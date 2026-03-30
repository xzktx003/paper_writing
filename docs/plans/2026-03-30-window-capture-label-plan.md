# Window Capture Label 实施计划

关联规格：
- [docs/specs/2026-03-30-window-capture-label-design.md](docs/specs/2026-03-30-window-capture-label-design.md)

状态：DONE

说明：当前进入的是“执行计划”阶段，不是实现阶段。下面的 checkpoint 只是后续执行时的逻辑切点；除非你后续显式要求，否则不会实际提交 git commit。

## Context Map：Window Capture Label Persistence + Parsed Presentation

### Primary Files（直接修改）

- `packages/shared/src/index.ts`
  - 增加 `WindowCaptureMeta`。
  - 扩展 `AgentSessionRecord`、`RegisterAgentSessionInput`、`CreateWindowCaptureSessionInput`。
- `apps/server/src/services/observe-session-manager.ts`
  - 在 create 流程里归一化 `rawLabel`。
  - 保证 `displayName` 在 v1 继续等于 raw label。
- `apps/server/src/services/agent-session-registry.ts`
  - 在 `register` / `upsert` / `updateSession` 链路中保留 `windowCaptureMeta`。
- `apps/server/src/routes/agent-sessions.window-capture.test.ts`
  - 覆盖 create response、list roundtrip、legacy payload fallback。
- `apps/web/src/lib/window-capture.ts`
  - 将 capture 结果从语义模糊的 `label` 收紧为原始 capture label。
- `apps/web/src/App.tsx`
  - 创建 capture session 时同时发送 `suggestedDisplayName` 与 `windowCaptureMeta.rawLabel`。
- `apps/web/src/lib/window-capture-label.ts`
  - 新增保守解析器，负责 `rawLabel -> parsedWindowTitle / parsedAppName / parseConfidence`。
- `apps/web/src/components/AgentGridCard.tsx`
  - 仅对 `local-window-capture` 显示解析后的主标题和次级 app 名称。
- `apps/web/src/components/AgentFocusView.tsx`
  - 焦点态主标题、侧边栏卡片接入解析展示。
  - 增加 raw label metadata block。
- `apps/web/src/app.css`
  - 增加 capture label 次级文本与 metadata block 样式。
- `tests/e2e/window-capture-observe.spec.ts`
  - 用 mocked `track.label` 覆盖已知格式解析和未知格式回退。

### New Files（高概率新增）

- `apps/web/src/lib/window-capture-label.ts`
  - 纯字符串解析函数，保持前端最佳努力解析。
- `apps/web/src/lib/window-capture-label.test.ts`
  - 轻量纯函数测试，验证保守解析规则。

### Affected Files（可能需要更新）

- `apps/web/package.json`
  - 当前没有 web 单测承载。若要保留 parser 纯函数测试，需要补一个极轻的测试执行能力，例如 `tsx`。
- `apps/web/src/lib/api.ts`
  - DTO 变化后需要确认 `createWindowCaptureSession` 调用端类型对齐。
- `apps/server/src/routes/agent-sessions.ts`
  - 预期不需要直接改路由逻辑，但会被共享 DTO 改动波及编译。
- `apps/web/src/components/FocusBar.tsx`
  - v1 明确不改，计划里只作为排除面确认。

### Test Coverage

- 现有可扩展：
  - `apps/server/src/routes/agent-sessions.window-capture.test.ts`
  - `tests/e2e/window-capture-observe.spec.ts`
- 需要新增：
  - `apps/web/src/lib/window-capture-label.test.ts`
- 需要保持通过：
  - `apps/server/src/services/observe-session-manager.test.ts`
  - `apps/server/src/services/agent-session-registry.test.ts`

### Suggested Change Order

1. `shared DTO` + `server create/persist path`
2. `legacy fallback normalization` + `server roundtrip tests`
3. `web rawLabel plumbing` + `parser utility`
4. `capture-specific UI rendering` + `focus metadata block`
5. `parser behavior e2e` + `full verification`

### Risks

- `displayName` 一旦被误改为“解析标题”，会影响当前 capture session 的回退逻辑与其他全局展示面。
- web 目前没有现成单测承载；如果不加极轻测试能力，parser 行为只能依赖 E2E 验证。
- `track.label` 的真实格式依赖浏览器和系统，parser 必须接受“完全不解析”的正常结果。
- `AgentSessionRecord` 是全局共享 DTO，虽然新增字段是 optional，但任何手工拷贝路径漏传都会导致 create -> list 丢字段。

### Context Map 自省

- 缺失依赖：当前没有发现必须改 `focus-window` 路由的前置条件，因为 v1 明确保持 `displayName = raw label`。
- 影响范围：真正需要改的只有 capture-specific 流程、共享 DTO 和字符串展示面，不应该波及普通 agent 会话。
- 任务尺度：计划避免一次性改所有展示面，第一版只覆盖 grid、focus 主头部、focus sidebar、focus metadata block，尺度合适。

## 执行任务分解

---

### Task 1：共享契约 + create/persist 链路打通

目标：先让 `rawLabel` 成为正式数据，而不是前端临时字符串。

**修改文件**

- `packages/shared/src/index.ts`
- `apps/server/src/services/observe-session-manager.ts`
- `apps/server/src/services/agent-session-registry.ts`
- `apps/server/src/routes/agent-sessions.window-capture.test.ts`

**先写失败验证**

1. 在 `agent-sessions.window-capture.test.ts` 新增断言：
   - create payload 带 `windowCaptureMeta.rawLabel`
   - create response 返回该字段
   - 随后 `GET /api/agent-sessions` 仍能读到该字段
2. 运行：

```bash
pnpm --filter server exec tsx --test src/routes/agent-sessions.window-capture.test.ts
```

预期失败：

- 类型缺失，或 create/list payload 中拿不到 `windowCaptureMeta.rawLabel`。

**实现内容**

1. 在 shared types 中新增：
   - `WindowCaptureMeta`
   - `AgentSessionRecord.windowCaptureMeta?`
   - `RegisterAgentSessionInput.windowCaptureMeta?`
   - `CreateWindowCaptureSessionInput.windowCaptureMeta?`
2. 在 `ObserveSessionManager.createSession()` 中：
   - 归一化传入 raw label
   - `displayName` 保持等于 raw label
   - 将 `windowCaptureMeta.rawLabel` 写入注册输入
3. 在 registry 的 `register` / `upsertByTransportRef` / `updateSession` 中保持新字段透传。

**通过验证**

```bash
pnpm --filter server exec tsx --test src/routes/agent-sessions.window-capture.test.ts
pnpm --filter server exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
```

预期通过：

- create/list roundtrip 测试通过
- server 与 web 类型检查通过

**Commit checkpoint**

- `feat: persist raw capture label on window-capture sessions`

---

### Task 2：legacy payload fallback + 归一化规则钉死

目标：保证老客户端不送 `windowCaptureMeta` 时，系统仍有一致的事实源。

**修改文件**

- `apps/server/src/services/observe-session-manager.ts`
- `apps/server/src/routes/agent-sessions.window-capture.test.ts`

**先写失败验证**

1. 在 route contract tests 中新增两个场景：
   - 只有 `suggestedDisplayName` 时，create response 仍生成 `windowCaptureMeta.rawLabel`
   - `windowCaptureMeta.rawLabel` 为空字符串或纯空白时，回退到 `suggestedDisplayName`
2. 运行：

```bash
pnpm --filter server exec tsx --test src/routes/agent-sessions.window-capture.test.ts
```

预期失败：

- legacy payload 不会补写 `rawLabel`
- whitespace raw label 不会被归一化

**实现内容**

1. 在 `ObserveSessionManager` 中抽出小型归一化逻辑：
   - trim raw label
   - 缺失时回退到 `suggestedDisplayName`
   - 两者都缺失时回退到 `VS Code 窗口`
2. 将归一化结果同时写入：
   - `displayName`
   - `windowCaptureMeta.rawLabel`

**通过验证**

```bash
pnpm --filter server exec tsx --test src/routes/agent-sessions.window-capture.test.ts
pnpm --filter server exec tsx --test src/services/observe-session-manager.test.ts
```

预期通过：

- legacy create 请求仍可用
- raw label 归一化断言通过

**Commit checkpoint**

- `feat: normalize raw capture label fallback behavior`

---

### Task 3：前端 rawLabel 管道 + parser 纯函数

目标：把 raw label 从浏览器 capture 结果干净地送到后端，并把解析逻辑隔离成纯函数。

**修改文件**

- `apps/web/src/lib/window-capture.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/window-capture-label.ts`
- `apps/web/src/lib/window-capture-label.test.ts`
- `apps/web/package.json`

**先写失败验证**

1. 新建 parser test，覆盖：
   - `coding_kanban - Visual Studio Code` -> high confidence
   - `coding_kanban — Code` -> high confidence
   - `mystery capture string` -> low confidence + no parsed fields
2. 运行：

```bash
pnpm --filter web exec tsx --test src/lib/window-capture-label.test.ts
```

预期失败：

- parser 文件不存在，或 web 还没有 `tsx` 可执行。

**实现内容**

1. 在 web package 增加最轻量的 parser 测试执行能力。
2. 将 `CaptureResult.label` 收紧为 `rawLabel` 语义。
3. `App.tsx` 在创建会话时发送：
   - `suggestedDisplayName: rawLabel`
   - `windowCaptureMeta: { rawLabel }`
4. 新建 parser util：
   - 仅识别 `Visual Studio Code` / `Code`
   - 仅识别 ` - ` / ` — ` / ` – `
   - 只有 high confidence 才返回 parsed fields

**通过验证**

```bash
pnpm --filter web exec tsx --test src/lib/window-capture-label.test.ts
pnpm --filter web exec tsc --noEmit
```

预期通过：

- parser 行为精确可控
- 前端类型对齐通过

**Commit checkpoint**

- `feat: add raw label plumbing and conservative parser`

---

### Task 4：窗口捕获 UI 展示增强

目标：只在 capture-specific 视图里把长 raw label 转成更易读的标题，并补充诊断信息。

**修改文件**

- `apps/web/src/components/AgentGridCard.tsx`
- `apps/web/src/components/AgentFocusView.tsx`
- `apps/web/src/app.css`

**先写失败验证**

1. 在 E2E 中新增一个 recognized-label 场景：
   - mock label 为 `coding_kanban — Visual Studio Code`
   - grid card 主标题显示 `coding_kanban`
   - 焦点主标题显示 `coding_kanban`
   - 焦点 metadata block 显示原始 label 和 app name
2. 运行：

```bash
pnpm exec playwright test tests/e2e/window-capture-observe.spec.ts --grep "recognized label"
```

预期失败：

- UI 仍直接显示 raw label
- 焦点态不存在 metadata block

**实现内容**

1. 在 grid card 上：
   - 对 `local-window-capture` 使用 parsed title 作为主标题
   - app name 作为次级文本
2. 在 focus view 上：
   - 主头部和 sidebar 卡片使用同一套 capture label 解析展示
   - 增加 raw label metadata block
3. 在 CSS 中增加：
   - capture title secondary text
   - metadata block 布局与层次样式

**通过验证**

```bash
pnpm exec playwright test tests/e2e/window-capture-observe.spec.ts --grep "recognized label"
pnpm --filter web exec tsc --noEmit
```

预期通过：

- recognized label 的展示提升生效
- 只影响 capture-specific 界面

**Commit checkpoint**

- `feat: show parsed capture labels in window-capture views`

---

### Task 5：未知格式回退 + 全量验证

目标：验证 parser 的保守边界，确保未知 label 不会被误拆。

**修改文件**

- `tests/e2e/window-capture-observe.spec.ts`
- 如有必要，微调 `apps/web/src/lib/window-capture-label.ts`

**先写失败验证**

1. 在 E2E 中新增 unknown-label 场景：
   - mock label 为 `mystery capture string`
   - grid/focus 仍显示原始 label
   - metadata block 不显示伪造的 app name
2. 运行：

```bash
pnpm exec playwright test tests/e2e/window-capture-observe.spec.ts --grep "unknown label"
```

预期失败：

- parser 误拆，或 UI 错误显示次级 app 名称。

**实现内容**

1. 收紧 parser 回退逻辑。
2. 确保 low confidence 时 UI 统一回 raw label。

**通过验证**

```bash
pnpm exec playwright test tests/e2e/window-capture-observe.spec.ts
pnpm --filter server exec tsx --test src/routes/agent-sessions.window-capture.test.ts src/services/observe-session-manager.test.ts src/services/agent-session-registry.test.ts
pnpm --filter web exec tsx --test src/lib/window-capture-label.test.ts
pnpm format
pnpm check
```

预期通过：

- 解析成功与解析失败两类展示都稳定
- server contract tests、parser tests、E2E、全量 build 全部通过

**Commit checkpoint**

- `feat: finalize conservative window capture label presentation`

## 交付标准

- `local-window-capture` 会话在 create response 和 list snapshot 中都带有 `windowCaptureMeta.rawLabel`
- legacy create payload 不送 metadata 仍可工作，且服务端会补齐规范化后的 `rawLabel`
- capture-specific UI 在已知 VS Code label 上显示更短的标题和 app name
- 未知 label 不会被误拆，UI 退回原始 label
- 非 capture 会话的所有展示面保持不变

## 建议执行入口

建议从 Task 1 开始，按顺序执行。Task 1 和 Task 2 会先把契约和事实层钉死，后面的 UI 改动才不会边写边改模型。