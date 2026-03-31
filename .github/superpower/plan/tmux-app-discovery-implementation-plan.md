# Tmux / 应用发现 UX 重构 — 实施计划

> 基于 [tmux-app-discovery-sketch-v1.md](../ux/tmux-app-discovery-sketch-v1.md) 的 9 项已确认设计决定。

---

## 技术变更总览

| 层 | 涉及文件 | 变更类型 |
|---|---|---|
| Shared Types | `packages/shared/src/index.ts` | 新增类型 |
| Backend API | `apps/server/src/routes/agent-sessions.ts` | 新增端点、修改删除逻辑 |
| Backend Service | `apps/server/src/services/local-tmux-adapter.ts` | 新增远程 tmux 扫描、终止 |
| Backend Service | `apps/server/src/services/agent-session-registry.ts` | 新增 "从宫格移除" 操作 |
| Frontend Lib | `apps/web/src/lib/api.ts` | 新增 API 调用 |
| Frontend State | `apps/web/src/lib/layout-store.ts` | **新建** — 布局折叠状态 |
| Frontend Comp | `apps/web/src/components/TopBar.tsx` | 下拉菜单、折叠 |
| Frontend Comp | `apps/web/src/components/SideDrawer.tsx` | 折叠为 36px 图标条 |
| Frontend Comp | `apps/web/src/components/DiscoveryDialog.tsx` | **新建** — 扫描弹窗 |
| Frontend Comp | `apps/web/src/components/HostDropdown.tsx` | **新建** — 主机选择下拉 |
| Frontend Comp | `apps/web/src/components/CardMoreMenu.tsx` | **新建** — ··· 更多菜单 |
| Frontend Comp | `apps/web/src/components/AgentGridCard.tsx` | 接入新菜单、"从宫格移除" |
| Frontend Comp | `apps/web/src/components/AgentGrid.tsx` | 传递新 callbacks |
| Frontend Root | `apps/web/src/App.tsx` | 布局模式、快捷键、新回调 |
| Styles | `apps/web/src/app.css` | 折叠过渡、Dialog 样式 |
| Tests | `apps/web/src/components/*.test.ts` | 新增 / 更新 |
| E2E | `tests/e2e/discovery-dialog.spec.ts` | **新建** |

---

## 阶段划分

### Phase 0：共享类型 & 后端基础（无 UI 改动）

**目标**：先把后端 API 改好，前端仍可正常运行。

#### Task 0-1: 新增共享类型

文件: `packages/shared/src/index.ts`

```ts
// 新增：tmux 扫描请求（支持远程主机）
export interface DiscoverTmuxInput {
  hostId?: string;       // undefined = 本机
  sshTarget?: SshTarget; // 远程主机连接信息
}

// 新增：终止 tmux 会话请求
export interface KillTmuxSessionInput {
  tmuxSessionName: string;
  hostId?: string;
  sshTarget?: SshTarget;
}

// 新增：从宫格移除（不杀底层进程）
export interface RemoveFromGridInput {
  preserveTransport: boolean; // true = 只移除 UI 记录
}
```

#### Task 0-2: 后端 — tmux 扫描支持远程主机

文件: `apps/server/src/services/local-tmux-adapter.ts`

当前 `discover()` 只扫本机。新增：

```ts
async discoverRemote(sshTarget: SshTarget): Promise<DiscoverTmuxSessionsResponse>
```

- 通过 SSH 执行 `tmux list-panes -a -F '#{session_name}\t#{pane_id}\t#{pane_current_command}\t#{pane_current_path}'`
- 复用现有的 `parsePaneInfo()` 解析逻辑
- 在结果中附上 `sshTarget` 信息

文件: `apps/server/src/routes/agent-sessions.ts`

新增路由:
```
POST /api/agent-discovery/tmux/scan   { hostId?, sshTarget? }
```
- 取代当前的本地专用端点，合并为一个统一入口
- `hostId` 为空或为 `"local"` 时走本机 `discover()`
- 否则走 `discoverRemote(sshTarget)`

#### Task 0-3: 后端 — "从宫格移除" 端点

文件: `apps/server/src/routes/agent-sessions.ts`

```
POST /api/agent-sessions/:id/remove-from-grid
```

逻辑：
1. 从 `AgentSessionRegistry.sessions` 中移除记录
2. **不**调用 `pty-runtime-manager.kill()` / `ssh-runtime-manager.kill()`
3. 如果有活跃 PTY handle，关闭 handle 但不发 SIGKILL 给 tmux
4. 广播 WebSocket snapshot 更新

#### Task 0-4: 后端 — "终止 tmux 会话" 端点

文件: `apps/server/src/routes/agent-sessions.ts`

```
POST /api/agent-sessions/:id/tmux/kill
```

逻辑：
1. 从 session 记录中取 `transportRef.tmuxSession`
2. 本机: `tmux kill-session -t <name>`
3. 远程: 通过 SSH 执行同样的命令
4. 然后执行常规 delete 流程

**验证点**: 跑 `pnpm check`，确保新类型在 backend + shared 间编译通过。不碰前端。

---

### Phase 1：布局折叠系统（TopBar + SideBar 可折叠）

**目标**：先实现三模式布局切换，不碰发现弹窗。

#### Task 1-1: 布局状态管理

新建: `apps/web/src/lib/layout-store.ts`

```ts
export type LayoutMode = 'expanded' | 'compact' | 'immersive';

export interface LayoutState {
  sidebarCollapsed: boolean;
  topbarCollapsed: boolean;
}

// 读写 localStorage key: 'agent-console-layout'
export function loadLayoutState(): LayoutState;
export function saveLayoutState(state: LayoutState): void;
export function deriveLayoutMode(state: LayoutState): LayoutMode;
```

- LayoutMode 是派生值：
  - `expanded` = 两者都展开
  - `compact` = sidebar 折叠
  - `immersive` = 两者都折叠

#### Task 1-2: TopBar 折叠

文件: `apps/web/src/components/TopBar.tsx`

Props 新增:
```ts
collapsed: boolean;
onToggleCollapsed: () => void;
```

行为：
- `collapsed=false`：当前完整 UI + 右侧新增 `[─ 折叠]` 按钮
- `collapsed=true`：渲染为一条 ~24px 高的窄线，右侧 `[▼ 展开]` 按钮
- CSS 过渡：`max-height` 从 auto 到 24px，用 `overflow: hidden`

#### Task 1-3: SideDrawer 折叠

文件: `apps/web/src/components/SideDrawer.tsx`

Props 新增:
```ts
collapsed: boolean;
onToggleCollapsed: () => void;
```

行为：
- `collapsed=false`：当前完整 UI，底部加 `[◀]` 折叠按钮
- `collapsed=true`：宽度变为 36px，只渲染:
  - `[▶]` 展开
  - `[🖥]` 主机图标（hover 显示 tooltip）
  - `[＋]` 新建会话（点击后展开 drawer 并聚焦到新建表单）
- CSS 过渡：`width` 从原始值到 36px，配合 `transition: width 0.2s ease`

#### Task 1-4: App.tsx 集成布局状态

文件: `apps/web/src/App.tsx`

- 初始化时 `loadLayoutState()` 读 localStorage
- 用 `useState` 管理 `LayoutState`
- 切换时 `saveLayoutState()` 写回
- 传 `collapsed` / `onToggleCollapsed` 给 TopBar 和 SideDrawer
- 调整主容器 CSS class 以匹配当前 LayoutMode

#### Task 1-5: CSS 过渡与样式

文件: `apps/web/src/app.css`

- `.top-bar--collapsed`: `max-height: 24px`, `overflow: hidden`
- `.side-drawer--collapsed`: `width: 36px`
- `.side-drawer--collapsed .drawer-icon-rail`: 36px icon column
- `.layout-compact .agent-grid-container`: 更多宽度
- `.layout-immersive .agent-grid-container`: 接近 100% 面积
- 过渡动画: `transition: width 0.2s ease, max-height 0.2s ease`

**验证点**: 三模式可视觉切换，localStorage 持久化有效。刷新不丢失状态。跑 `pnpm check` + 现有测试。

---

### Phase 2：HostDropdown 组件 & TopBar 入口改造

**目标**：TopBar 上的 [扫描 tmux ▾] 和 [扫描应用 ▾] 按钮 + 主机下拉。

#### Task 2-1: HostDropdown 组件

新建: `apps/web/src/components/HostDropdown.tsx`

```tsx
interface HostDropdownProps {
  sshHosts: SshHostPreset[];
  onSelectHost: (host: SelectedHost) => void;
  triggerLabel: string;     // "扫描 tmux" / "扫描应用"
  disabled?: boolean;
}
```

行为：
- 点击触发按钮显示下拉
- 列表项：`● 本机` + 远程主机列表 + `＋ 添加远程主机`
- 选择后立即调用 `onSelectHost()`
- 点击外部或选择后关闭下拉
- 下拉用绝对定位，不影响布局流

#### Task 2-2: TopBar 接入下拉

文件: `apps/web/src/components/TopBar.tsx`

Props 新增:
```ts
sshHosts: SshHostPreset[];
onScanTmux: (host: SelectedHost) => void;
onScanApps: (host: SelectedHost) => void;
```

替换当前的 `onOpenQuickTmuxConnect` 为下拉式触发。保留 `[添加窗口]` 按钮不变。

渲染:
```
☰  Agent 控制台    [HostDropdown:扫描 tmux ▾] [HostDropdown:扫描应用 ▾] [添加窗口]  🟢3 🟡1 共8
```

#### Task 2-3: App.tsx 提升 sshHosts 状态

文件: `apps/web/src/App.tsx`

- 将 `SideDrawer` 内部的 `sshHosts` 状态提升到 App 层
- `useEffect` 调用 `getSshHosts()` 在 App 初始化
- 同时传给 `TopBar` 和 `SideDrawer`

**验证点**: 下拉可打开关闭，选择主机后回调被触发（先用 console.log 验证）。

---

### Phase 3：Discovery Dialog（核心交互）

**目标**：实现 Tmux 扫描弹窗和应用扫描弹窗。

#### Task 3-1: DiscoveryDialog 容器组件

新建: `apps/web/src/components/DiscoveryDialog.tsx`

```tsx
export type DiscoveryMode = 'tmux' | 'apps';

interface DiscoveryDialogProps {
  open: boolean;
  mode: DiscoveryMode;
  host: SelectedHost;
  sessions: AgentSessionRecord[];  // 当前宫格中的 sessions
  onClose: () => void;
  onAddToGrid: (items: AddToGridItem[]) => void;
  onFocusSession: (id: string) => void;
}
```

外壳：
- `<dialog>` 元素或手动 portal + overlay
- 80% 宽 × 70% 高，居中
- 半透明遮罩 `rgba(0,0,0,0.4)`
- 点击遮罩关闭，ESC 关闭
- 标题栏: `[发现 tmux 会话 — {主机名}]  [✕]`

根据 `mode` 分支渲染:
- `tmux` → `<TmuxDiscoveryPanel />`
- `apps` → `<AppDiscoveryPanel />`

#### Task 3-2: TmuxDiscoveryPanel

新建: `apps/web/src/components/TmuxDiscoveryPanel.tsx`

```tsx
interface TmuxDiscoveryPanelProps {
  host: SelectedHost;
  sessions: AgentSessionRecord[];
  onAddToGrid: (items: TmuxDiscoveryItem[]) => void;
  onFocusSession: (id: string) => void;
}
```

状态:
- `items: TmuxDiscoveryItem[]` — 扫描结果
- `selected: Set<number>` — 勾选项索引
- `searchQuery: string` — 名称筛选
- `showOnlyNew: boolean` — 仅未加入
- `selectAll: boolean` — 全选复选框
- `loading: boolean`

进入即自动触发扫描:
- 本机: 调 `POST /api/agent-discovery/tmux/scan`
- 远程: 同一端点 + `sshTarget`

展示:
- 每项: 勾选框、tmux 名称、windows/panes 数、最近活动时间、内部应用检测
- 已在宫格的项 → 主按钮变为 `[聚焦到宫格]`
- 底部: `[关闭]  [加入已选 (N)]`
- 筛选行: `[搜索名称...]  [☑ 仅运行中]  [☐ 仅未加入]  [☐ 全选]  已选 N 项 [批量加入宫格]`

匹配宫格逻辑:
- 复用 `SideDrawer.findExistingSession()` 的匹配逻辑（提取为独立函数）

#### Task 3-3: AppDiscoveryPanel

新建: `apps/web/src/components/AppDiscoveryPanel.tsx`

```tsx
interface AppDiscoveryPanelProps {
  host: SelectedHost;
  sessions: AgentSessionRecord[];
  onAddToGrid: (items: ScanResult[]) => void;
  onFocusSession: (id: string) => void;
}
```

状态:
- `scanPath: string` — 扫描路径
- `results: ScanResult[]` — 按文件夹分组
- `kindFilter: string | null` — Codex/Copilot/Claude/全部
- `showOnlyNew: boolean`
- `selected: Set<number>` — 勾选项
- `loading: boolean`

需手动点击 `[扫描]` 后触发（因为需要先输入路径）:
- 调 `POST /api/agent-discovery/scan`

分组渲染:
- 按 `workingDirectory` 分组，每组有分隔标题
- 在 tmux 中运行的应用: 显示 `╰→ 推荐: 连接到已有 tmux`，主按钮 `[连接到 tmux]`
- 独立进程: 主按钮 `[加入宫格]`
- 已停止: `[恢复]`
- 底部: `[关闭]  [加入已选 (N)]`

#### Task 3-4: 从 SideDrawer 提取复用逻辑

文件: `apps/web/src/lib/session-matching.ts` (**新建**)

从 SideDrawer 中提取:
- `findExistingSession()` → 独立导出
- `sortScanResults()` → 独立导出
- `buildTmuxAttachCommand()`, `buildDirectLaunchCommand()` 等命令构建函数 → 独立导出

SideDrawer 改为 import 这些函数（不改变行为）。

#### Task 3-5: App.tsx 编排 Dialog

文件: `apps/web/src/App.tsx`

新增状态:
```ts
const [discoveryState, setDiscoveryState] = useState<{
  open: boolean;
  mode: DiscoveryMode;
  host: SelectedHost;
} | null>(null);
```

TopBar 的 `onScanTmux` / `onScanApps` 回调打开 Dialog:
```ts
function handleScanTmux(host: SelectedHost) {
  setDiscoveryState({ open: true, mode: 'tmux', host });
}
function handleScanApps(host: SelectedHost) {
  setDiscoveryState({ open: true, mode: 'apps', host });
}
```

`onAddToGrid` 回调:
- 复用/适配当前 SideDrawer 中的 `handleAddScanResult()` 逻辑
- 成功加入后自动刷新 sessions
- 如果需要批量加入，循环调用

`onClose`:
```ts
function handleDiscoveryClose() {
  setDiscoveryState(null);
}
```

#### Task 3-6: Cmd/Ctrl+Shift+S 快捷键

文件: `apps/web/src/App.tsx`

在已有的 `handleKeyDown` 中加分支:
```ts
if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'S') {
  event.preventDefault();
  // 默认以本机 tmux 扫描打开 Dialog
  setDiscoveryState({ open: true, mode: 'tmux', host: { type: 'local' } });
}
```

**验证点**: 
1. 从 TopBar 下拉选主机 → Dialog 弹出正确模式
2. Tmux 扫描: 列表展示、勾选、批量加入、已加入项显示 "聚焦"
3. 应用扫描: 输入路径、扫描、分组展示、类型筛选、tmux 推荐提示
4. Cmd/Ctrl+Shift+S → 弹出 Tmux Dialog
5. 关闭后 UI 干净无残留

---

### Phase 4：宫格卡片改进（从宫格移除 + ··· 更多菜单）

**目标**：AgentGridCard 新增 "从宫格移除" 按钮和 ··· 更多楼下菜单。

#### Task 4-1: CardMoreMenu 组件

新建: `apps/web/src/components/CardMoreMenu.tsx`

```tsx
interface CardMoreMenuProps {
  sessionId: string;
  isTmux: boolean;
  onRename: (id: string) => void;
  onCopyConnectCommand: (id: string) => void;
  onKillTmux: (id: string) => void;
}
```

行为：
- 点击 `···` 触发按钮 → 显示浮动菜单
- 菜单项:
  - `✎ 重命名` — 调 `onRename`
  - `📋 复制连接命令` — 构建 `tmux attach -t <name>` 并 `navigator.clipboard.writeText()`，仅 tmux 类型显示
  - `⚠ 终止 tmux 会话` — 仅 tmux 类型显示，红色，点击后 `window.confirm()` 二次确认
- 点击外部关闭
- 绝对定位，不影响卡片布局

#### Task 4-2: AgentGridCard 改造

文件: `apps/web/src/components/AgentGridCard.tsx`

Props 新增:
```ts
onRemoveFromGrid?: (id: string) => void;
onCopyConnectCommand?: (id: string) => void;
onKillTmux?: (id: string) => void;
```

变更:
1. **所有 tmux 卡片**都显示 `[从宫格移除]` 按钮（替代当前对 tmux 隐藏的 `×` 按钮）
2. `canDelete` 逻辑改为: 非 tmux 类型仍走原逻辑；tmux 类型只在 ··· 菜单里暴露"终止"
3. 加入 `<CardMoreMenu />` 渲染（展类的）

当前 `canDelete = !isTmux && (...)` 逻辑变更:
```ts
// 所有卡片都能从宫格移除
const canRemoveFromGrid = isTmux || isTmuxManaged;
// 非 tmux 卡片保持 × 关闭按钮
const canDelete = !isTmux && (!isWindowCapture || isExited || isDetached);
```

#### Task 4-3: 后端 — removeFromGrid API 调用

文件: `apps/web/src/lib/api.ts`

```ts
export function removeFromGrid(agentSessionId: string): Promise<void> {
  return request<void>(`/api/agent-sessions/${agentSessionId}/remove-from-grid`, {
    method: 'POST',
  });
}

export function killTmuxSession(agentSessionId: string): Promise<void> {
  return request<void>(`/api/agent-sessions/${agentSessionId}/tmux/kill`, {
    method: 'POST',
  });
}
```

#### Task 4-4: App.tsx 新增回调

文件: `apps/web/src/App.tsx`

```ts
async function handleRemoveFromGrid(id: string) {
  await removeFromGrid(id);
  // WebSocket snapshot 自动更新
}

async function handleKillTmux(id: string) {
  await killTmuxSession(id);
}

function handleCopyConnectCommand(id: string) {
  const session = sessions.find(s => s.id === id);
  if (session?.transportRef?.tmuxSession) {
    const cmd = `tmux attach -t ${session.transportRef.tmuxSession}`;
    navigator.clipboard.writeText(cmd);
  }
}
```

传给 `<AgentGrid>` 再传给 `<AgentGridCard>`。

**验证点**:
1. Tmux 卡片有 `[从宫格移除]` 按钮，点击后卡片消失，tmux 进程仍在
2. `···` 菜单弹出三个选项
3. "复制连接命令" 成功复制到剪贴板
4. "终止 tmux 会话" 二次确认后真正杀掉
5. 非 tmux 卡片保持原来的 `×` 关闭行为

---

### Phase 5：SideDrawer 瘦身 & 清理

**目标**：SideDrawer 中的扫描功能已迁移到 Discovery Dialog，清理旧代码。

#### Task 5-1: 移除 SideDrawer 中的扫描 UI

文件: `apps/web/src/components/SideDrawer.tsx`

移除的内容:
- `handleScan()` 函数
- `handleDiscoverTmux()` 函数
- `handleAddScanResult()` 函数（已提取到独立模块）
- `scanResults` / `scanning` / `scanMessage` 状态
- `scanPath` 状态（如果 SideDrawer 不再需要扫描路径输入）
- Section 2: 扫描结果 整个 collapsible panel
- "扫描" 按钮和 "扫描本地 tmux" 按钮

保留的内容:
- Section 1: 主机列表（可能仍有用，但 host 选择已在 TopBar 上）
- Section 3: 新建会话表单

评估: 如果主机列表也已完全被 TopBar HostDropdown 取代，SideDrawer 可能只剩"新建会话"功能。考虑是否合并到其他入口。

#### Task 5-2: QuickTmuxConnect 处理

文件: `apps/web/src/components/QuickTmuxConnect.tsx`

评估: 快速 tmux 连接（Cmd+E）是否仍需保留？
- 如果 Discovery Dialog 覆盖了快速连接场景 → 可移除
- 如果用户希望保留一键连接特定 tmux → 保留 QuickTmuxConnect 作为简化入口

建议: Phase 5 先保留 QuickTmuxConnect，后续观察是否冗余再考虑移除。

**验证点**: SideDrawer 精简后仍能正常展开/折叠。新建会话流程不受影响。

---

### Phase 6：样式完善、测试、收尾

#### Task 6-1: Discovery Dialog 样式

文件: `apps/web/src/app.css`

- `.discovery-overlay`: position fixed, z-index 1000, 遮罩
- `.discovery-dialog`: 80%w × 70%h, max-width 960px, border-radius 8px
- `.discovery-dialog-header`: flex, 标题 + 关闭按钮
- `.discovery-item`: 行样式、hover 高亮
- `.discovery-item--selected`: 勾选态背景
- `.discovery-item-actions`: 按钮组对齐
- `.discovery-footer`: sticky bottom, 汇总操作
- `.discovery-group-title`: 文件夹分组标题
- `.discovery-recommend-badge`: `╰→` 推荐提示样式

#### Task 6-2: CardMoreMenu 样式

- `.card-more-menu-trigger`: 三点按钮
- `.card-more-menu`: 浮动菜单，阴影，z-index
- `.card-more-menu-item`: hover 高亮
- `.card-more-menu-item--danger`: 红色文字（终止 tmux）

#### Task 6-3: 单元测试

| 测试文件 | 测试内容 |
|---|---|
| `layout-store.test.ts` | localStorage 读写、模式派生 |
| `session-matching.test.ts` | findExistingSession 匹配逻辑 |
| `TmuxDiscoveryPanel.test.tsx` | 渲染、筛选、勾选、批量操作 |
| `CardMoreMenu.test.tsx` | 菜单打开关闭、各项点击回调 |
| `HostDropdown.test.tsx` | 下拉打开关闭、选择回调 |

#### Task 6-4: E2E 测试

新建: `tests/e2e/discovery-dialog.spec.ts`

场景:
1. 启动 → TopBar 有 [扫描 tmux ▾] 按钮
2. 点击按钮 → 下拉出现 → 选择本机 → Dialog 弹出
3. Dialog 显示扫描结果 → 勾选 → 点击 "加入已选" → 宫格出现新卡片
4. 宫格卡片 → 点 ··· → 出现菜单 → 点击 "从宫格移除" → 卡片消失
5. Cmd+Shift+S → Dialog 弹出

#### Task 6-5: 格式化 & 最终检查

```bash
pnpm format
pnpm check
pnpm test
pnpm exec playwright test
```

---

## 依赖关系

```
Phase 0 (Types + Backend)
  │
  ├─► Phase 1 (Layout fold)           # 独立于 Phase 0
  │       │
  │       ▼
  ├─► Phase 2 (HostDropdown + TopBar)  # 需要 Phase 0 的 sshHosts 提升
  │       │
  │       ▼
  └──► Phase 3 (Discovery Dialog)      # 需要 Phase 0 API + Phase 2 入口
          │
          ▼
        Phase 4 (Card improvements)     # 需要 Phase 0 的 removeFromGrid API
          │
          ▼
        Phase 5 (SideDrawer cleanup)    # 需要 Phase 3 功能完整后
          │
          ▼
        Phase 6 (Tests + polish)
```

**可并行**: Phase 1 和 Phase 0 可同时启动（布局折叠不依赖新 API）。

---

## 风险 & 注意事项

| 风险 | 缓解措施 |
|---|---|
| 远程 tmux 扫描 SSH 超时 | execRemote 已有 `ConnectTimeout=5`，UI 加 loading + timeout 提示 |
| "从宫格移除" 后 tmux 孤立 | 再次扫描时会重新出现在列表（设计如此） |
| Dialog 内批量加入并发问题 | 串行 `await` 每项加入，避免 race condition |
| SideDrawer 瘦身后功能遗漏 | Phase 5 仅在 Phase 3 功能验证完成后执行 |
| 快捷键冲突 | Cmd+Shift+S 需检查是否与浏览器原生快捷键冲突（Chrome 无此默认绑定） |
| 折叠动画导致布局抖动 | 使用 `transform` 代替 `width` 触发 GPU 加速；或用 `will-change: width` |

---

## 对照 UX 确认清单

| # | 设计决定 | 对应 Task |
|---|---|---|
| 1 | Dialog 80%w × 70%h | Task 3-1, 6-1 |
| 2 | 扫描应用展示已停止 | Task 3-3 |
| 3 | 拆开"从宫格移除"和"终止 tmux" | Task 0-3, 0-4, 4-2, 4-3, 4-4 |
| 4 | TopBar + SideBar 可折叠 | Task 1-1 ~ 1-5 |
| 5 | 发现流程做成弹窗 | Task 3-1 ~ 3-6 |
| 6 | 全选按钮 | Task 3-2 |
| 7 | Cmd/Ctrl+Shift+S 快捷键 | Task 3-6 |
| 8 | SideBar 折叠 36px | Task 1-3, 1-5 |
| 9 | ··· 更多菜单 | Task 4-1, 4-2, 6-2 |
