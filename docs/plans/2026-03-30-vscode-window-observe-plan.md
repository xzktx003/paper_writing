# VS Code Window Observe 实施计划

关联规格：/Users/hx/Documents/Codes/VibeCoding/coding_kanban/docs/specs/2026-03-30-vscode-window-observe-design.md

状态：DONE

说明：当前进入的是“执行计划”阶段，不是实现阶段。下面的 commit checkpoint 只是后续执行时的逻辑切点；除非你后续显式要求，否则不会实际提交 git commit。

## Context Map：本机多 VS Code 窗口观察（纯浏览器 V1）

### Primary Files（直接修改）

- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/packages/shared/src/index.ts`
  - 增加 `local-window-capture` 相关共享类型与 DTO。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/services/agent-session-registry.ts`
  - 让 `local-window-capture` 完全退出 `awaiting_input` 推断与 text-screen inference。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/routes/agent-sessions.ts`
  - 增加 window capture 创建与 observe-state 路由，补删除约束。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/app.ts`
  - 注入 observe session 生命周期管理。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/lib/api.ts`
  - 增加 window capture 会话创建与 observe-state 请求。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/App.tsx`
  - 增加本地 capture store、页面本地 focus、心跳与停止观察流程。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/TopBar.tsx`
  - 增加“添加 VS Code 窗口”入口。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/AgentGridCard.tsx`
  - 为 `local-window-capture` 分支渲染窗口预览或占位态。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/AgentFocusView.tsx`
  - 焦点态改为本地视频预览分支，不挂 `TerminalView`。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/app.css`
  - 增加窗口预览卡片、焦点视频区、detached/exited 占位态样式。

### New Files（高概率新增）

- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/services/observe-session-manager.ts`
  - 负责 `observeToken`、心跳 TTL sweep、状态迁移约束。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/services/observe-session-manager.test.ts`
  - 验证 token、heartbeat、transition、TTL sweep。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/routes/agent-sessions.window-capture.test.ts`
  - 路由层 contract 测试，包含创建、心跳、transition、删除限制。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/lib/window-capture.ts`
  - 浏览器窗口采集适配层，封装 `getDisplayMedia`、track ended、label 提取。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/WindowCapturePreview.tsx`
  - 专门渲染 `MediaStream` 预览与 detached/exited 占位态。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/tests/e2e/window-capture-observe.spec.ts`
  - Playwright E2E，使用 mock `getDisplayMedia` 验证 UI 和路由流转。

### Affected Files（可能需要更新）

- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/playwright.config.ts`
  - 如需为窗口采集 mock 注入统一 setup，可在这里加 `use.launchOptions` 或全局 helper。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/TerminalView.tsx`
  - 预期不改逻辑，但需要确保 capture session 永远不挂载此组件。
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/tests/e2e/agent-orchestrator.spec.ts`
  - 如现有用例覆盖主导航，可能需要补一个入口可见性断言。

### Test Coverage

- 现有可复用：
  - `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/services/agent-session-registry.test.ts`
  - `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/tests/e2e/agent-orchestrator.spec.ts`
- 需要新增：
  - `observe-session-manager.test.ts`
  - `agent-sessions.window-capture.test.ts`
  - `window-capture-observe.spec.ts`

### Suggested Change Order

1. `shared types` + `registry inference guard`
2. `observe session service` + unit tests
3. `server routes/app wiring` + route contract tests
4. `web API/store` + capture adapter
5. `grid/focus rendering branches` + stop-observe UX
6. `Playwright e2e` + full verification

### Risks

- 纯浏览器无法预枚举窗口，只能逐次打开原生 picker。
- `MediaStreamTrack.label` 可能不稳定，V1 需要容忍 fallback 名称。
- 浏览器窗口捕获需要 secure context；本地调试必须保证 `localhost` / HTTPS。
- 页面刷新后 token 丢失，旧会话只能靠 heartbeat timeout 转为 detached。

## 执行任务分解

---

### Task 1：共享契约 + Registry 推断隔离

目标：先把领域模型定死，并确保 `local-window-capture` 不会被误判成 `awaiting_input`。

**修改文件**

- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/packages/shared/src/index.ts`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/services/agent-session-registry.ts`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/services/agent-session-registry.test.ts`

**先写失败验证**

1. 在 `agent-session-registry.test.ts` 新增用例：`local-window-capture` 会话在空闲 30ms 后仍不进入 `awaiting_input`。
2. 运行：

```bash
pnpm --filter server exec tsx --test src/services/agent-session-registry.test.ts
```

预期失败：

- 新测试断言失败，或编译期提示 `local-window-capture` 尚未存在。

**实现内容**

1. 在 `packages/shared/src/index.ts` 增加：
   - `AgentSourceType` 新值：`local-window-capture`
   - `CreateWindowCaptureSessionInput`
   - `CreateWindowCaptureSessionResponse`
   - `ObserveStateHeartbeatInput`
   - `ObserveStateTransitionInput`
   - `ObserveStateInput`
2. 在 `agent-session-registry.ts` 增加 source-type 规则：
   - `local-window-capture` 不启动 timed `awaiting_input`
   - 不走 `syncCapturedScreen`
   - 不走 output-based interaction inference

**通过验证**

再次运行：

```bash
pnpm --filter server exec tsx --test src/services/agent-session-registry.test.ts
```

预期通过：

- 终端输出 `ok` / 全部测试通过
- `local-window-capture` 用例与原有 3 个 registry 用例一起通过

**Commit checkpoint**

- `feat: add window capture session contracts`

---

### Task 2：ObserveSessionManager 服务 + Token/TTL 单测

目标：把浏览器 owner token、heartbeat、transition、TTL sweep 这些行为从 route 里抽离成独立服务。

**修改文件**

- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/services/observe-session-manager.ts`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/services/observe-session-manager.test.ts`

**先写失败验证**

1. 新建 `observe-session-manager.test.ts`，覆盖：
   - 创建会话会返回 `observeToken`
   - heartbeat 只能刷新 `lastHeartbeatAt`
   - 错 token 不能更新状态
   - 超时 sweep 将 `running` 转为 `degraded + detached`
2. 运行：

```bash
pnpm --filter server exec tsx --test src/services/observe-session-manager.test.ts
```

预期失败：

- 文件或导入缺失，或断言失败。

**实现内容**

1. 新建 `ObserveSessionManager`：
   - `createSession(input)`
   - `heartbeat(sessionId, observeToken, preview?)`
   - `transition(sessionId, observeToken, nextState)`
   - `sweepExpiredSessions(nowMs)`
2. 内部持有：
   - `sessionId -> observeToken`
   - `sessionId -> lastHeartbeatAt`
3. 合法迁移固定为：
   - `running -> detached`
   - `running -> exited`
   - `detached -> exited`

**通过验证**

再次运行：

```bash
pnpm --filter server exec tsx --test src/services/observe-session-manager.test.ts
```

预期通过：

- token、heartbeat、transition、TTL 全部通过

**Commit checkpoint**

- `feat: add observe session manager`

---

### Task 3：Server 路由接线 + 删除约束合同

目标：把 V1 的服务端 contract 固化成可注入测试，不靠前端“自觉遵守”。

**修改文件**

- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/routes/agent-sessions.ts`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/app.ts`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/server/src/routes/agent-sessions.window-capture.test.ts`

**先写失败验证**

1. 新建 route contract 测试，使用 `buildServer().app.inject()` 覆盖：
   - `POST /api/agent-sessions/window-capture` 成功返回 `observeToken`
   - `POST /api/agent-sessions/:id/observe-state` 心跳成功
   - 错 token 返回 403/400
   - 运行中的 `local-window-capture` 不能被 `DELETE` 删除
   - `detached` 或 `exited` 的 capture session 可以被删除
2. 运行：

```bash
pnpm --filter server exec tsx --test src/routes/agent-sessions.window-capture.test.ts
```

预期失败：

- 404、无 token、删除约束未实现，或 app 未注入服务。

**实现内容**

1. 在 `agent-sessions.ts` 增加：
   - `POST /api/agent-sessions/window-capture`
   - `POST /api/agent-sessions/:id/observe-state`
2. 调整 `DELETE /api/agent-sessions/:id`：
   - `local-window-capture + running` 返回 409
   - `local-window-capture + detached/exited` 才允许清理
3. 在 `app.ts` 注入 `ObserveSessionManager`，并注册 sweep 定时器。

**通过验证**

再次运行：

```bash
pnpm --filter server exec tsx --test src/routes/agent-sessions.window-capture.test.ts
```

预期通过：

- 创建、心跳、transition、删除限制全部通过

**Commit checkpoint**

- `feat: add window capture lifecycle routes`

---

### Task 4：前端采集入口 + 本地 store + 首个 E2E 绿灯

目标：让用户能从顶栏发起一次窗口采集，并看到新会话出现在宫格里。

**修改文件**

- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/lib/api.ts`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/lib/window-capture.ts`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/App.tsx`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/TopBar.tsx`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/tests/e2e/window-capture-observe.spec.ts`

**先写失败验证**

1. 新建 Playwright 用例，mock `navigator.mediaDevices.getDisplayMedia`，覆盖：
   - 顶栏存在“添加 VS Code 窗口”按钮
   - 点击后调用 mock capture
   - 成功后宫格新增一个 `vscode` 会话卡片
2. 运行：

```bash
pnpm exec playwright test --workers=1 tests/e2e/window-capture-observe.spec.ts
```

预期失败：

- 按钮不存在，或点击后不会创建 capture session。

**实现内容**

1. `api.ts` 增加：
   - `createWindowCaptureSession()`
   - `sendObserveState()`
2. 新建 `window-capture.ts`：
   - 请求 `getDisplayMedia({ video: { displaySurface: 'window' }, audio: false })`
   - 读取 `track.label`
   - 绑定 `track.onended`
3. 在 `App.tsx` 增加本地 store：
   - `sessionId -> MediaStream`
   - `sessionId -> observeToken`
   - `sessionId -> capture label`
4. 在 `TopBar.tsx` 增加入口按钮并回调到 `App.tsx`。

**通过验证**

再次运行：

```bash
pnpm exec playwright test --workers=1 tests/e2e/window-capture-observe.spec.ts
```

预期通过：

- 首个用例通过
- 会话卡片出现在 grid 中

**Commit checkpoint**

- `feat: create local window capture sessions from top bar`

---

### Task 5：Grid / Focus 预览组件 + 页面本地焦点

目标：把 capture session 从 terminal 路径里完全分离，保证它永远走视频预览分支。

**修改文件**

- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/WindowCapturePreview.tsx`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/AgentGridCard.tsx`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/AgentFocusView.tsx`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/App.tsx`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/app.css`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/tests/e2e/window-capture-observe.spec.ts`

**先写失败验证**

1. 扩充 E2E 用例，覆盖：
   - capture 卡片渲染 preview/placeholder，而不是 terminal websocket 内容
   - 双击卡片进入焦点态后显示大预览
   - 同页添加第二个窗口后，两个会话同时存在，但焦点仍然是单一页面本地状态
2. 运行：

```bash
pnpm exec playwright test --workers=1 tests/e2e/window-capture-observe.spec.ts
```

预期失败：

- 焦点页仍挂载 `TerminalView`，或第二个 capture 会话逻辑冲突。

**实现内容**

1. 新建 `WindowCapturePreview.tsx`：
   - 有 stream：渲染 `<video autoPlay muted playsInline>`
   - 无 stream：渲染 detached/offline placeholder
2. `AgentGridCard.tsx`：
   - `sourceType === 'local-window-capture'` 时不挂 `TerminalView`
3. `AgentFocusView.tsx`：
   - 引入 capture 分支，使用页面本地 `focusedCaptureSessionId`
4. `App.tsx`：
   - 对 capture 会话完全不调用后端 focus API

**通过验证**

再次运行：

```bash
pnpm exec playwright test --workers=1 tests/e2e/window-capture-observe.spec.ts
```

预期通过：

- 多窗口会话并存
- 焦点态正确渲染本地视频预览

**Commit checkpoint**

- `feat: render local window capture sessions in grid and focus views`

---

### Task 6：停止观察、detached 占位态、最终验证

目标：闭合完整生命周期，确保 ended、stop、timeout、cleanup 都有清晰行为。

**修改文件**

- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/App.tsx`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/AgentGridCard.tsx`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/AgentFocusView.tsx`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/components/WindowCapturePreview.tsx`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/apps/web/src/app.css`
- `/Users/hx/Documents/Codes/VibeCoding/coding_kanban/tests/e2e/window-capture-observe.spec.ts`

**先写失败验证**

1. 扩充 E2E 用例，覆盖：
   - 运行中的 capture session 显示“停止观察”，不显示删除
   - stop 后会话转 `offline + exited`
   - exited 或 detached 卡片允许删除
2. 扩充 server 测试，覆盖：
   - running capture session `DELETE` 返回 409
3. 运行：

```bash
pnpm --filter server exec tsx --test src/routes/agent-sessions.window-capture.test.ts
pnpm exec playwright test --workers=1 tests/e2e/window-capture-observe.spec.ts
```

预期失败：

- UI 仍然暴露错误动作，或后端删除规则未闭合。

**实现内容**

1. `App.tsx`：
   - owner stop 流程：`track.stop()` -> `transition(exited)` -> 清理本地 stream/token
2. Grid / Focus 组件：
   - running 态显示“停止观察”
   - exited / detached 态显示删除与重新添加引导
3. `WindowCapturePreview.tsx`：
   - 增加 ended / detached / exited 三种占位文案

**通过验证**

运行窄测：

```bash
pnpm --filter server exec tsx --test src/routes/agent-sessions.window-capture.test.ts
pnpm exec playwright test --workers=1 tests/e2e/window-capture-observe.spec.ts
```

再运行全量受影响验证：

```bash
pnpm format
pnpm check
pnpm exec playwright test --workers=1 tests/e2e/window-capture-observe.spec.ts tests/e2e/agent-orchestrator.spec.ts
```

预期通过：

- format 无错误
- `pnpm check` 通过
- 受影响 E2E 全绿

**Commit checkpoint**

- `feat: complete local vscode window observe lifecycle`

---

## 执行完成判定

满足以下条件才算本轮实现完成：

1. 顶栏可重复添加多个 VS Code 窗口观察会话。
2. 每个窗口对应独立 `local-window-capture` session。
3. Capture session 永远不挂载 `TerminalView`，而是走 `WindowCapturePreview`。
4. 页面本地 focus 与本地 stream store 生效，不依赖后端 `activeAgentSessionId`。
5. owner 可以停止观察；运行中的 capture session 不能被直接删除。
6. detached / exited metadata session 可清理。
7. `pnpm format`、`pnpm check`、新增 E2E 全部通过。

## 建议移交方式

实现时按 Task 1 → Task 6 顺序执行，不要并行推进前后端状态机和 UI 细节。先把 source-type 规则和后端 contract 锁死，再接浏览器采集与 E2E，不然很容易在后面反复改类型和生命周期。