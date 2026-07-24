# paper_wrighting 当前仓库用户问题审计与优化建议

- 审计时间：2026-07-22 10:04:06（Asia/Shanghai）
- 仓库：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 正式地址：`http://10.30.0.22:8787`
- 审计视角：首次使用者、日常论文作者、管理员、二次开发维护者
- 审计边界：只发现问题，不修改业务代码、不重启正式服务、不写入正式论文、不调用真实付费模型
- 本轮唯一仓库写入：新增本审计文档
- 证据来源：正式 LAN Playwright、隔离 Playwright、探索式 Playwright、HTTP 三态探针、进程与文件系统、当前源码、测试覆盖、TypeScript、Vitest、依赖审计、Git 工作区

> 状态说明：本文基于 10:04 左右的最新证据。今天更早生成的审计文档记录的是不同源码、构建和进程时刻；若结论冲突，以本文列出的时间、build ID、PID 和实测结果为准。

## 1. 结论先行

当前仓库已经不再是“只能通过 API 配置 LLM、没有 Codex/Copilot、没有 RAG、没有 Skills 系统”的早期原型。当前工作区源码已经具备：

- OpenAI-compatible API；
- Anthropic API；
- Codex CLI；
- Claude Code CLI；
- GitHub Copilot CLI；
- 只读 Chat 与可修改文件的 CLI Task Agent；
- 稳定项目 ID、显示名称和物理目录三层项目身份；
- 已有 `papers` 子目录发现与注册；
- 本地 RAG 健康、generation、fingerprint、损坏诊断和外部来源状态；
- Skills readiness、dry-run、last-run、成本和副作用元数据；
- 前后端 build ID / API schema 门禁；
- Bearer Token 保护；
- 手机和平板布局；
- 本地中文字体、离线 Draw.io fallback、模板校验和显式 TeX 包安装授权。

但“代码里有”不等于“用户能用”。本轮最重要的事实是：

```text
当前工作区源码
≠ 当前 frontend dist 之外的历史状态
≠ 正式 8787 后端进程
≠ 正式服务使用的数据根
≠ 用户认为的仓库 papers/ 目录
```

### 1.1 本轮最重要的实测结论

1. **正式 LAN 站点当前完全不能进入工作区。** 桌面、手机、平板三个真实 Chromium 视口都停在 `missing-build-metadata` 的“前后端版本不一致”页面。
2. **正式后端仍是旧版本。** `/api/ready` 为 404，`/api/health` 返回 `authRequired:false`；无 Token 和错误 Token 都可以读取项目、配置和 Skills。
3. **正式数据根仍然指向 `/data01/home/xuzk/papers`，不是仓库的 `paper_wrighting/papers`。** 两处目录内容明显不同，这仍是“页面项目和 papers 子文件夹对不上”的最直接运行态原因。
4. **当前源码本身大部分核心功能可运行。** 隔离环境 Playwright 26/26 通过，TypeScript 通过，78 个测试文件、438 个单元测试通过，依赖审计为 0 漏洞。
5. **Codex、Claude Code、Copilot 不只是下拉选项。** 本轮进行了真实但非付费的 CLI probe：Codex 已安装且认证可用，Claude Code 已安装且认证可用，Copilot 已安装但没有可靠的非交互认证状态命令。
6. **项目名与文件夹名仍不相同，而且这是当前设计。** 通过真实 UI 新建项目后，显示名为 `真实UI审计-...`，物理目录为 `真实UI审计-...--7312fc23`。
7. **新建项目的真实 UI 旅程暴露了现有 E2E 没覆盖的可访问性问题。** 页面视觉上有“项目名称”标签，但标签没有与输入框关联，`getByLabel('项目名称')` 返回 0 个元素。
8. **Skills 治理框架存在，但 Skill 资产没有达到 ready。** 干净环境默认 Provider 未配置时 123/123 `unavailable`；切换为已安装的 Codex CLI 后变为 123/123 `degraded`，仍然 0 个 `ready`，原因是执行元数据全部来自推断。
9. **RAG 的核心仍是关键词/token overlap，不是语义向量检索。** UI 已诚实标注这一点，但不能把它宣传成完整语义 RAG。
10. **`/api/ready` 的含义过窄。** 当前源码只检查数据根和模板目录，不代表 Provider、TeX 编译、OCR、Skills 或 RAG 已真正可用。
11. **仓库交付状态非常混杂。** `git status --short` 当前约 219 条，tracked diff 涉及约 110 个文件、八千余行新增和七千余行删除；同一天已有多份审计报告，部分结论已过期。

### 1.2 综合判断

| 维度 | 当前判断 | 用户含义 |
| --- | --- | --- |
| 当前源码实现 | 核心能力较完整 | 不应重复从零实现 Provider、项目身份、RAG health 等功能 |
| 隔离自动化 | 26/26 Playwright，438/438 unit | 当前构建具备可运行基础 |
| 正式 LAN 入口 | 失败 | 所有真实用户无法进入工作区 |
| 正式鉴权 | 失败 | 旧后端匿名暴露项目和配置元数据 |
| 正式数据根 | 错位 | 页面项目不对应仓库 `papers/` |
| CLI Provider | 基础可用，状态表达仍不足 | Codex/Claude 可 probe，Copilot 登录态未知，未做付费调用 |
| Skills | 0 ready | 有目录和治理 UI，不等于有 123 个可靠能力 |
| RAG | 可解释的本地关键词检索 | 适合查找字面证据，不适合宣称语义召回 |
| 发布状态 | **BLOCK** | 当前不能标记为正式可用 |

## 2. 审计方法与证据边界

### 2.1 实际执行的验证

- 正式 LAN Playwright：
  - Desktop：1440×900；
  - Phone：390×844；
  - Tablet：768×1024。
- 隔离 Playwright：随机端口、`/tmp` 临时数据根、随机 Bearer Token。
- 探索式 Playwright：通过真实“新建项目”弹窗创建空白项目，检查实际目录和 `project.json`。
- CLI probe：只执行版本和认证状态检查，没有向模型发送论文任务。
- HTTP 三态检查：无 Token、错误 Token、正确 Token。
- 代码和配置检查：鉴权、Deployment Gate、项目定位、Skills readiness、RAG、compile、启动脚本、测试覆盖。
- 质量检查：
  - `npm run typecheck`；
  - `npm run test:unit -- --reporter=dot`；
  - `node scripts/run-e2e-isolated.mjs --reporter=line`；
  - `npm audit --json`；
  - `git diff --check`。

### 2.2 没有执行的操作

- 没有重启、停止或替换正式服务；
- 没有修改正式 `.env`；
- 没有在 `/data01/home/xuzk/papers` 或仓库 `papers/` 中创建测试论文；
- 没有接受任何 CLI Task Agent 文件修改；
- 没有调用真实付费模型；
- 没有执行真实模板全量编译矩阵；
- 没有安装或修改主机 TeX 包；
- 没有做破坏性路径穿越、安全利用或删除测试。

### 2.3 证据标签

- **直接证据**：本轮命令、浏览器或 HTTP 直接观察到。
- **源码证据**：当前工作区源码明确表示某种行为，但不代表正式进程已加载。
- **高可信推断**：多个直接证据共同支持，但本轮没有执行破坏性验证。
- **未知**：在只读、无付费调用边界内无法确认。

## 3. Playwright 实际使用结果

### 3.1 正式 LAN：桌面、手机、平板全部被阻断

访问地址：

```text
http://10.30.0.22:8787/projects
```

结果：

| 设备 | 视口 | HTTP | 页面结果 | 横向溢出 | Console/Page error |
| --- | ---: | ---: | --- | --- | --- |
| Desktop | 1440×900 | 200 | 前后端版本不一致 | 无 | 无 |
| Phone | 390×844 | 200 | 前后端版本不一致 | 无 | 无 |
| Tablet | 768×1024 | 200 | 前后端版本不一致 | 无 | 无 |

三个视口正文一致：

```text
前后端版本不一致

当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。

missing-build-metadata
Frontend build 20260722014952-f0ef1484486e-bc4257b6 is not compatible with the running backend.

重新检查

管理员需要重新构建并重启前后端服务，然后再刷新页面。
```

截图证据：

- `/tmp/paper-wrighting-current-audit-2026-07-22T01-57-04-752Z-desktop.png`
- `/tmp/paper-wrighting-current-audit-2026-07-22T01-57-04-752Z-phone.png`
- `/tmp/paper-wrighting-current-audit-2026-07-22T01-57-04-752Z-tablet.png`

补充观察：

- 当前前端本地字体已经真实加载；
- computed font 以 `Noto Sans SC` 开头；
- `document.fonts.check('16px "Noto Sans SC"', '中文测试')` 返回 `true`；
- 三个视口没有横向溢出；
- 因此早先报告中的“中文字体方框”已经不是当前前端构建问题。

这里应区分：

- **Deployment Gate 本身是正确保护。** 它阻止新前端使用旧 API 修改论文。
- **正式产品仍然不可用。** 保护机制工作正常，不等于发布成功。

源码证据：

- `app/apps/frontend/src/api/deploymentHandshake.ts:22-30`：缺 metadata、schema 不一致或 build ID 不一致都会阻断；
- `app/apps/frontend/src/app/components/DeploymentGate.tsx:18-29`：读取 `/api/health` 并判断兼容性；
- `app/apps/frontend/src/app/components/DeploymentGate.tsx:49-56`：阻断时不加载工作区。

### 3.2 当前源码隔离 Playwright：26/26 通过

实际执行：

```bash
cd app
node scripts/run-e2e-isolated.mjs --reporter=line
```

结果：

```text
26 passed
0 failed
```

覆盖范围包括：

- 项目列表、搜索、打开、删除；
- 已有目录发现与显式注册；
- Token 首次应用；
- 受保护图片、PDF 和下载；
- RAG health、损坏索引和外部来源状态；
- Skills readiness 展示；
- Draw.io 离线 fallback；
- CLI Task Agent 的 Diff、Reject、Accept；
- 桌面、手机和平板工作区；
- 本地 CJK 字体；
- Markdown、LaTeX 懒加载预览；
- build mismatch 门禁。

这证明当前源码和当前 `dist` 在同一隔离批次中可以运行，但不能替代正式 LAN 验收。

### 3.3 真实 UI 新建项目：功能可用，但可访问性和身份预期有问题

探索式 Playwright 实际操作：

1. 打开 `/projects`；
2. 点击“新建项目”；
3. 确认默认模板显示“空白项目”；
4. 填写项目名称；
5. 点击“创建”；
6. 等待进入 `/editor/:projectId`；
7. 检查临时数据根中的实际目录和 `project.json`。

结果：

```text
显示名称：真实UI审计-1784685709139
项目 ID：7312fc23-44ae-4221-acec-f5c4c11fe42e
物理目录：真实UI审计-1784685709139--7312fc23
template：null
文件：docs/、project.json
```

这证明：

- “空白项目”确实创建空白项目，没有暗中套用模板；
- 项目 ID 稳定；
- 目录名采用“slug + 短 ID”；
- 显示名称和物理目录明确不是同一个字符串。

同时发现真实可访问性问题：

```text
视觉标签“项目名称”：1 个
通过 getByLabel('项目名称') 找到的输入框：0 个
实际 .modal input.input：1 个
```

原因是 `ProjectPage.tsx:799-806` 中 `<label>` 没有 `htmlFor`，输入框也没有相应 `id`。

这不只是“自动化选择器问题”。屏幕阅读器、语音控制和依赖可访问名称的测试工具也无法正确识别该字段。

### 3.4 CLI Provider 真实非付费 probe

本轮只执行安全的版本和认证状态检查，没有发送真实模型请求。

| Provider | 安装状态 | 版本 | 认证状态 |
| --- | --- | --- | --- |
| Codex CLI | 已安装 | `codex-cli 0.144.6` | 可用；具体凭据已脱敏 |
| Claude Code CLI | 已安装 | `2.1.139 (Claude Code)` | `loggedIn: true`，OAuth Token |
| GitHub Copilot CLI | 已安装 | `GitHub Copilot CLI 1.0.73` | 未知；CLI 没有非交互 auth status 命令 |

因此：

- “增加 Codex/Copilot”已经不是主要缺失功能；
- 当前剩余工作是把安装、登录、网络、模型访问和权限模式清楚呈现给用户；
- Copilot 不能只因为 executable 存在就标记为“已登录可用”；
- 正式 UI 仍被版本门禁阻断，所以真实用户当前无法使用这些能力。

## 4. 正式运行态问题

### P0-1：正式前后端不是同一发布批次

**证据：直接，高置信。**

正式监听：

```text
0.0.0.0:8787
backend PID: 575763
supervisor PID: 575751
backend cwd: app/apps/backend
backend start: 2026-07-22 02:56:52
```

正式 `/api/health`：

```json
{"ok":true,"authRequired":false}
```

当前源码应返回 build metadata 和 API schema；正式进程没有，证明它没有加载当前源码批次。

用户影响：所有正式用户都只能看到阻断页，不能进入任何核心功能。

改进方向：

1. frontend、backend、build ID、API schema 必须作为一个发布单元；
2. 发布成功必须校验前端 build ID = 后端 build ID；
3. `/api/ready` 必须通过；
4. 发布后必须运行 LAN Playwright，而不是只运行临时隔离测试；
5. 失败时恢复上一套匹配的前后端构建；
6. 阻断页显示后端 build、schema、启动时间等可复制诊断信息。

### P0-2：正式旧后端匿名暴露业务元数据

**证据：直接，高置信。**

| Endpoint | 无 Token | 错误 Token | 说明 |
| --- | ---: | ---: | --- |
| `/api/health` | 200 | 200 | 旧格式，`authRequired:false` |
| `/api/ready` | 404 | 404 | 当前 readiness 未部署 |
| `/api/projects` | 200 | 200 | 匿名枚举项目 |
| `/api/config` | 200 | 200 | 匿名读取配置元数据 |
| `/api/providers` | 200 | 200 | 匿名读取 Provider 元数据 |
| `/api/skills` | 200 | 200 | 匿名读取 Skills 目录 |
| `/api/capabilities` | 503 | 503 | 当前新能力面 fail-closed |

当前源码的隔离验证结果是：

| Endpoint | 无 Token | 错误 Token | 正确 Token |
| --- | ---: | ---: | ---: |
| `/api/projects` | 401 | 403 | 200 |
| `/api/config` | 401 | 403 | 200 |
| `/api/skills` | 401 | 403 | 200 |
| `/api/capabilities` | 401 | 403 | 200 |

当前源码的 default-deny 方向正确；问题是正式实例仍停留在旧版本。

改进方向：

1. 发布当前鉴权实现；
2. 正式环境必须配置强 Token；
3. 发布门禁固定验证 401/403/200 三态；
4. `/api/config` 只返回必要的脱敏字段；
5. `/api/providers` 即使保持公开，也只应返回最低限度的产品支持元数据。

### P0-3：正式数据根与仓库 `papers/` 不一致

**证据：直接，高置信。**

正式进程环境：

```text
OPENPRISM_PROJECTS_DIR=/data01/home/xuzk/papers
```

正式根当前可见子目录：

```text
aliased-dir-27eedc87-0ae7-40a8-a6e1-81b32d63f217
c2b87dfc-af29-42ef-b088-0f28aa9d65c3
not-a-real-project
uploaded-paper-cff0c984-f935-4ee4-bc42-20fbf796640d
```

仓库 `papers/` 当前包含：

```text
1_dim_vq
MSAVQ
coding_agent_spe
faar_gsq
moe_prune
moe_prune_v2
paper-agent
paper-agent-spe
perblock
tmp_stom
torq
...以及缓存/测试目录
```

因此“页面上的工程和 `papers` 子文件夹对不上”至少有三层原因：

1. 正式服务读取的是另一个根目录；
2. managed project 的显示名、稳定 ID 和目录名本来就是三个字段；
3. 仓库 `papers/` 中有未注册目录、缓存和测试遗留目录。

改进方向：

1. 明确唯一 authoritative data root；
2. 管理员页面持续显示当前数据根；
3. 启动时检测“配置根目录”和“仓库常见 papers 根目录”冲突；
4. 提供只读迁移预览，再由管理员显式执行注册/迁移；
5. 默认排除隐藏缓存和测试遗留目录；
6. 正式验收比较 API data root 与预期路径。

## 5. 项目模型与项目用户体验

### P1-1：显示名、项目 ID、物理目录的模型合理，但不符合普通用户直觉

**证据：Playwright + 源码，高置信。**

目录规则：

```text
slugified display name + "--" + stable ID 前 8 位
```

源码：

- `projectLocator.js:23-42`：slug 和目录名规则；
- `projectLocator.js:134-145`：新项目创建；
- `projectLocator.js:228-274`：重命名时移动物理目录；
- `ProjectPage.tsx:686-696`：列表显示项目 ID 和存储目录。

合理性：

- 防止同名冲突；
- API 使用稳定 ID；
- 显示名可以变化；
- 已有目录可以原地注册。

用户问题：

- 用户看到的项目名不是终端中的文件夹名；
- 外部编辑器、Git、备份和同步脚本需要理解内部目录规则；
- “重命名项目”会同时移动物理目录，可能影响外部路径引用；
- 新建对话框在创建前不展示最终目录名。

优化建议：

1. 新建项目时实时预览显示名、物理目录和稳定 ID；
2. 提供目录策略：名称、名称--短 ID、自定义 slug；
3. 把“修改显示名”和“移动物理目录”拆成两个动作；
4. 增加“复制完整路径”“在终端打开”“打开所在目录”；
5. 编辑器顶部持续显示项目名和物理目录；
6. 未注册目录显示明确状态：待注册、已注册、元数据损坏、ID 冲突。

### P1-2：Project Locator 每次按稳定 ID 查找可能 O(N) 扫描全部项目

**证据：源码，高置信。**

`projectLocator.js:67-132` 先尝试 `dataDir/projectId`，但新项目目录实际是 `slug--shortId`，通常不会命中；随后 `readdir(dataDir)` 并逐个读取 `project.json`。

项目较少时影响不明显；当论文数增多、数据根位于网络盘或机械盘时，每次文件、RAG、编译、对话请求都可能放大扫描成本。

优化建议：

- 建立持久 `projectId -> directoryName` 索引；
- create/register/rename/trash/delete 时原子更新；
- 启动时支持只读重建；
- 检测索引和 metadata 漂移；
- 保留 O(N) 扫描作为损坏恢复路径，而不是正常路径。

### P1-3：新建项目表单缺少可访问名称

**证据：探索式 Playwright，高置信。**

`ProjectPage.tsx:799-806` 的视觉 `<label>` 没有 `htmlFor`，输入框没有 `id`。

影响：

- 屏幕阅读器无法可靠关联标签和字段；
- 语音控制无法按字段名定位；
- Playwright `getByLabel` 无法使用；
- 当前 E2E 因绕过真实 UI 创建而没有发现。

优化建议：

- 所有表单字段建立 `label[for] -> input#id`；
- 弹窗增加 `role="dialog"`、`aria-labelledby`；
- E2E 强制使用 role/label，而不是 CSS 选择器；
- 对 Settings、导入、重命名、RAG、Skills 进行同类可访问性审计。

## 6. Provider、Codex、Claude 和 Copilot

### P1-4：Provider 的“支持、安装、登录、可调用”语义仍然分散

**证据：API + 源码 + probe，高置信。**

`/api/providers` 的 CLI `available` 只代表服务器配置了 `OPENPRISM_API_TOKEN`，不代表 executable、登录、网络和模型访问均正常：

- `agentProviderRegistry.js:368-375`：CLI metadata 的 available 基于服务器 Token；
- 实际安装和认证只在 `/probe` 时检查；
- capabilities 页面目前只检查 CLI 版本，不检查登录；
- Copilot 没有非交互认证状态命令。

用户会混淆以下状态：

1. 产品代码支持；
2. 服务器已安装；
3. CLI 已登录；
4. 网络和模型当前可达；
5. 当前操作是只读 Chat 还是可修改文件 Task Agent。

优化建议：

1. Provider 卡片显示五段状态：支持、安装、认证、连通、权限；
2. 下拉框中显示 `Codex CLI（已安装、已登录）` 等实际状态；
3. Copilot 显示“认证未知”，不能标绿；
4. “测试连接”输出结构化结果和时间戳；
5. 把 Chat 与 Task Agent 按用户任务解释，不要求用户先理解内部架构；
6. 正式发布至少执行非付费 probe；真实模型调用由管理员显式触发。

### P1-5：Provider E2E 只检查说明文案，没有点击真实“测试连接”

**证据：测试覆盖，高置信。**

`tests/e2e/provider-onboarding.spec.ts` 当前只验证：

- 设置引导文案；
- Codex CLI 可在下拉框选择；
- 页面出现“测试连接”说明。

没有：

- 点击 Test connection；
- 验证 installed/version/auth；
- 保存后重新打开；
- 验证 Provider 状态和 Skills readiness 联动。

优化建议：增加真实非付费 probe E2E；模型 invoke 继续使用 mock 或管理员显式测试，避免自动产生费用。

## 7. Skills 系统

### P1-6：123 个 Skills 没有一个达到 ready

**证据：隔离 API + 配置切换，高置信。**

干净隔离启动默认 `openai-compatible`，无模型凭据：

```text
unavailable: 123
ready: 0
```

将 Provider 切换为当前已安装的 Codex CLI 后：

```text
degraded: 123
ready: 0
```

典型检查：

```text
execution-metadata: requirements — unverified
provider-capability: invoke / codex-cli — available
```

说明：

- Provider 能力问题可以通过选择 Codex 解决；
- 但 123 个 Skill 的执行 metadata 都是 inferred，仍无法进入 ready；
- `lastRun` 默认全部是 `never`；
- “加载成功”不等于“任务可成功完成”。

优化建议：

1. 先治理最常用的 10-20 个 Skills，不追求数量；
2. 每个 Skill 声明显式 requirements、side effects、cost class 和产物；
3. 引入四级结果：

```text
prompt_applied
provider_completed
artifacts_verified
objective_passed
```

4. `success` 不应只表示模型请求返回；
5. degraded Skill 首次选择时显示风险确认；
6. UI 提供“已验证”“需检查”“不可用”“从未运行”筛选；
7. 为代表性 Skills 建立隔离 fixture 和目标级验收。

### P1-7：Skills readiness 与当前 Provider 联动不够直观

**证据：实际配置切换，高置信。**

同一批 123 个 Skills：

- 默认无 API 凭据时全部 unavailable；
- 切换 Codex CLI 后全部 degraded。

用户若先打开 Skills，看到 123 个全部不可用，很难知道只需先选择一个可用 Provider。当前系统缺少清晰的因果提示和一键跳转。

优化建议：

- Skills 页顶部显示“当前 Provider：未配置/已配置”；
- 统一聚合不可用原因；
- 提供“去设置 Codex CLI”按钮；
- Provider 保存后实时刷新 readiness；
- 不要逐个 Skill 重复同一 provider-missing 错误。

## 8. RAG 系统

### P1-8：本地 RAG 是关键词重叠，不是语义 RAG

**证据：源码和 UI，高置信。**

- `paperRagService.js:26`：`kind: 'local-keyword-overlap'`；
- `PaperRagPanel.tsx:260`：明确显示 “not semantic vector retrieval”。

优点：

- 透明；
- 可重复；
- 可检查来源、行号和分块；
- 没有向量服务依赖；
- 索引损坏可诊断和显式修复。

限制：

- 同义词召回弱；
- 中英文跨语言召回弱；
- 无字面重叠的概念问题容易漏检；
- 没有 embedding/reranker 质量基准；
- 不能把 token overlap 分数解释为语义相关性。

优化建议：

1. 保留当前关键词检索作为可解释 baseline；
2. 增加可选混合检索：BM25/关键词 + embedding + reranker；
3. 明确显示每种分数的含义；
4. 建立论文场景固定评测集；
5. 评估 citation recall、claim evidence recall、跨语言 recall 和延迟；
6. 未达到质量门槛前不要默认宣传“智能语义 RAG”。

### P1-9：缺少完整的本地 RAG 浏览器旅程

**证据：测试覆盖，高置信。**

现有 RAG E2E 主要通过 API 预置文档，再在 UI 检查 health、repair 和外部来源状态。尚缺完整用户路径：

```text
通过 UI 添加文本
→ 自动索引
→ 通过 UI 搜索唯一 token
→ 查看来源和内容
→ 从 UI 删除文档
→ 再搜索确认证据消失
```

优化建议：补充完整 UI journey，并验证项目树不显示 `.openprism`、`.compile` 等内部目录。

## 9. Readiness、能力诊断和发布语义

### P1-10：`/api/ready` 只表示数据根和模板可用

**证据：源码，高置信。**

`health.js:17-30` 只检查：

- data root 可读写；
- template catalog 有效。

它没有检查：

- 当前 Provider 是否可用；
- CLI 是否已登录；
- TeX 引擎；
- Pandoc；
- PDF 文本提取/OCR；
- RAG parser；
- Skills readiness；
- Task Agent；
- 外部检索网络。

所以 `ready:true` 不能解释为“论文系统全部可用”。

优化建议：拆分：

```text
workspace-ready
compile-ready
provider-ready
rag-ready
skills-ready
task-agent-ready
```

全局 `/api/ready` 只表示“进程可安全接收基础请求”；产品 UI 应展示分能力 readiness。

### P1-11：Capabilities 目前检查 CLI 安装，但不检查登录

**证据：源码，高置信。**

`capabilityService.js:193-219` 只执行 `--version`，并明确返回：

```text
login status and model access were not tested
```

真实 `/api/providers/:id/probe` 能进一步检查 Codex 和 Claude auth；两套状态源应统一，否则设置页、能力页和 Skills 页可能给出不同结论。

## 10. 测试体系问题

### P2-1：自动化绿灯没有覆盖最关键的真实项目旅程

**证据：测试搜索 + Playwright 实测，高置信。**

`tests/e2e/projects.spec.ts` 的项目 fixture 通过 API 创建；没有点击“新建项目”并填写表单。

因此以下问题未被发现：

- 项目名称 label 没有关联输入框；
- 空白模板默认值是否真正生效；
- UI 创建后的目录名、metadata 和导航；
- UI 重命名后稳定 ID 是否不变；
- 物理目录冲突时是否回滚；
- 重命名对外部路径的影响。

优化建议：增加浏览器级项目生命周期测试：create → inspect → rename → conflict → preserve state。

### P2-2：会话恢复只有逻辑测试，缺少刷新后的浏览器证明

当前已有 `conversationRestoration.ts` 和单元测试，但 E2E 没有证明：

- 两个会话同时存在；
- 用户选中非最新会话；
- 刷新后仍恢复同一 active tab；
- 存储内容失效时安全 fallback。

### P2-3：模板和编译缺少真实矩阵

当前模板 catalog 校验已经比旧版本可靠，编译缺包安装也已改为 `allowPackageInstall === true` 才执行。

仍缺少浏览器/集成矩阵：

- 每个 bundled template 创建项目；
- manifest `mainFile` 存在；
- 当前本机工具链能够编译，或返回明确诊断；
- 默认编译绝不修改主机 TeX；
- 用户显式授权时才允许安装包。

### P2-4：隔离测试和正式发布验收之间断层

当前结果：

```text
TypeScript: passed
Unit: 78 files / 438 tests passed
Playwright isolated: 26/26 passed
npm audit: 0 vulnerabilities
Formal LAN Playwright: blocked
```

这不是“测试没价值”，而是缺最后一段发布闭环：

```text
代码检查
→ 构建
→ 替换正式 supervisor/backend
→ build/schema/ready 检查
→ auth 三态
→ LAN desktop/phone/tablet Playwright
→ 发布成功
```

## 11. UI 与信息架构问题

### P2-5：编辑器功能密度高，首次用户缺少任务导向

编辑器同时暴露：

- 文件树；
- 编辑区；
- Chat；
- Task；
- Draw；
- RAG；
- Review；
- Citation；
- AI Writing Detection；
- Pipeline；
- Skills；
- Terminal。

对熟悉系统的人是能力丰富，对首次用户则是“从哪里开始”不明确。

优化建议：

1. 项目首次使用 checklist；
2. 按“写作、证据、质量、自动化、高级工具”分组；
3. 默认只展示核心写作路径；
4. 根据当前文件、Provider、Skills、RAG 状态推荐下一步；
5. 编辑器顶部持续显示项目名称和物理路径。

### P2-6：部分用户界面仍有硬编码英文

**证据：源码，中高置信。**

`ConversationTabs.tsx:127-132` 的右键菜单直接写死：

```text
Rename
Delete
```

这会在中文界面中出现语言混杂。当前 i18n E2E 只覆盖主要面板，没有覆盖上下文菜单和所有二级弹窗。

优化建议：建立用户可见字符串扫描和次级交互 i18n E2E。

## 12. 仓库与维护性问题

### P2-7：工作区过度 dirty，难以形成可复现发布

**证据：Git，高置信。**

当前大约：

```text
git status 条目：219
tracked diff：110 files changed
新增：8372 lines
删除：7232 lines
```

风险：

- 无法快速判断哪些改动属于同一功能；
- 测试结果难绑定到精确提交；
- 正式进程可能继续使用任意历史工作区状态；
- 回滚和 code review 成本高；
- 用户已有论文 metadata 改动容易混入产品改动。

优化建议：

- 按功能拆分 reviewable changeset；
- 发布记录绑定 commit、dirty hash、build ID、PID 和测试证据；
- 不把正式发布建立在无法复现的 200+ 项 dirty 工作区上；
- 保留用户论文改动，不做破坏性 reset。

### P2-8：同日审计文档过多，存在互相矛盾的历史结论

仓库中已有多份 2026-07-22 审计，记录了不同时间点的：

- 不同 build ID；
- 20/20、26/26 等不同测试数量；
- Skills degraded 或 unavailable；
- Claude CLI 未安装或已安装；
- 中文字体缺失或已修复；
- 启动脚本竞争存在或已整改。

这些结论可能在各自生成时成立，但缺少 canonical status 和 superseded 标记。

优化建议：

1. 建立唯一 `docs/current_status.md`；
2. 状态页绑定时间、commit/dirty hash、build ID、PID；
3. 历史审计顶部加 `Superseded by ...`；
4. 不让后续 Claude/Codex 默认读取任意旧报告后继续开发。

### P2-9：核心模块体积过大

当前规模：

```text
ProjectPage.tsx                 1061 lines
CenterPanel.tsx                  743 lines
RightPanel.tsx                   877 lines
paperRagService.js              2797 lines
skillEngine.js                  2424 lines
```

高可信推断：职责集中会提高回归概率、测试成本和多人协作冲突。

优化建议：按领域拆分，但先锁定行为测试；优先删除重复逻辑和复用现有 utils，不新增无必要抽象。

## 13. 已经整改、不应继续当作当前源码缺陷的问题

以下问题在早先审计中成立，但当前源码已经有明确整改证据：

### 13.1 中文本地字体

- 当前入口导入本地 Noto Sans SC；
- 字体 WOFF2 请求成功；
- `document.fonts.check` 为 true；
- 不能继续把“CSS 只有字体名、无真实 glyph”列为当前问题。

### 13.2 Legacy `/api/paper/*`

- 当前默认不注册；
- `/api/paper/projects` 在隔离环境返回 404；
- 兼容模式需要显式 `OPENPRISM_ENABLE_LEGACY_PAPER_API=true`；
- symlink 边界已加强。

### 13.3 Legacy workbench

- `/paper-writer-workbench.html` 默认返回 404；
- 不能再当作默认公开入口。

### 13.4 TeX 自动安装

- 当前 `allowPackageInstall` 默认 false；
- route 只有显式 `allowPackageInstall === true` 才转发；
- UI 没有静默传 true；
- 不能继续描述为“普通编译会自动修改主机 TeX”。

### 13.5 启动脚本竞争

- `run-server.sh` 已成为单一 lifecycle owner；
- `restart.sh` 先 build、再停止 supervisor、再调用统一 launcher；
- 验证 build ID、schema 和 ready；
- 当前问题是新脚本尚未部署到正式运行态，不是源码仍保持旧竞争逻辑。

### 13.6 模板 readiness

- 当前会校验 manifest JSON、模板 ID、label、description、mainFile 和入口文件存在；
- 不再只是检查 manifest 文件存在。

### 13.7 RAG Vision 配置

- 当前 route 通过 `getAppConfig` 获取实时配置；
- 不能继续列为“设置页新配置一定不生效”。

## 14. 问题优先级总表

| 编号 | 优先级 | 问题 | 证据 | 当前影响 |
| --- | --- | --- | --- | --- |
| P0-1 | P0 | 正式前后端 build 不一致 | LAN Playwright + health | 正式工作区完全不可进入 |
| P0-2 | P0 | 正式旧后端匿名暴露项目、配置、Skills | HTTP 三态 | 局域网未授权信息暴露 |
| P0-3 | P0 | 正式数据根不是仓库 `papers/` | 进程环境 + 文件系统 | UI 项目和真实论文不一致 |
| P1-1 | P1 | 项目名和物理目录仍违背用户直觉 | UI 创建 + 源码 | 终端、备份、Git、协作易混淆 |
| P1-2 | P1 | Project Locator O(N) metadata 扫描 | 源码 | 项目多或网络盘时性能下降 |
| P1-3 | P1 | 新建项目字段缺少可访问名称 | Playwright | 无障碍和语义自动化失败 |
| P1-4 | P1 | Provider 状态语义分散 | API + probe + 源码 | 可选不等于已登录可调用 |
| P1-5 | P1 | Provider E2E 未点击真实 probe | 测试覆盖 | 正式兼容性回归可能漏检 |
| P1-6 | P1 | 123 Skills 仍 0 ready | API + 配置切换 | 数量大但可靠性低 |
| P1-7 | P1 | Skills 与 Provider 联动不直观 | 实测 | 首次用户看到全不可用却不知道原因 |
| P1-8 | P1 | RAG 非语义向量检索 | 源码 + UI | 同义词、跨语言召回有限 |
| P1-9 | P1 | 缺完整本地 RAG UI journey | 测试覆盖 | API 绿但 UI 流程可能回归 |
| P1-10 | P1 | `/api/ready` 语义过窄 | 源码 | 运维可能误判核心能力 ready |
| P1-11 | P1 | capability 与 provider probe 状态源不统一 | 源码 + probe | 页面间结论可能矛盾 |
| P2-1 | P2 | 项目 E2E 通过 API 绕过真实创建 UI | 测试覆盖 | 已出现真实漏检 |
| P2-2 | P2 | 会话恢复缺浏览器刷新验证 | 测试覆盖 | 单测通过仍可能 UI 回归 |
| P2-3 | P2 | 模板/编译缺全量矩阵 | 测试覆盖 | 模板存在不等于本机可编译 |
| P2-4 | P2 | 隔离测试与正式发布断层 | 直接证据 | 26/26 通过但正式不可用 |
| P2-5 | P2 | 编辑器入口过密、首次路径不清晰 | Playwright + UI | 学习成本高 |
| P2-6 | P2 | 次级交互仍有硬编码英文 | 源码 | 中英文混杂 |
| P2-7 | P2 | 219 项 dirty 工作区 | Git | 发布、评审、回滚不可复现 |
| P2-8 | P2 | 同日多份审计互相矛盾 | 文档 | Agent 和维护者易使用过期事实 |
| P2-9 | P2 | 多个核心模块超大 | 文件规模 | 修改和回归成本高 |

## 15. 建议实施顺序

### 第一阶段：恢复正式可用和安全边界

1. 确认 authoritative data root；
2. 配置强 Bearer Token；
3. 用当前统一脚本构建并重启正式前后端；
4. 验证唯一 supervisor、backend 和 8787 listener；
5. 校验 build ID、schema、ready；
6. 校验 401/403/200；
7. 运行正式 LAN desktop/phone/tablet Playwright；
8. 确认真实项目列表对应预期 `papers/`。

### 第二阶段：补齐真实用户旅程测试

1. UI 创建空白项目；
2. UI 重命名、目录移动和冲突回滚；
3. 会话刷新恢复；
4. Provider 测试连接和保存重开；
5. RAG UI 添加、搜索、删除、再搜索；
6. bundled templates 创建与编译矩阵；
7. 次级弹窗可访问性和 i18n。

### 第三阶段：提高 Provider、Skills、RAG 产品成熟度

1. 统一 Provider 状态模型；
2. 先治理高频 Skills，做到真实 ready；
3. 区分 provider completed 与 objective passed；
4. 建立混合 RAG 和固定质量评测；
5. 分能力 readiness；
6. 项目身份和目录策略可视化。

### 第四阶段：维护性和发布治理

1. 建立 canonical current status；
2. 历史报告标记 superseded；
3. 拆分 changeset；
4. 绑定 commit/build/PID/测试证据；
5. 在测试保护下拆分超大模块；
6. 建立发布后 LAN gate。

## 16. 建议验收标准

### 正式部署

- `/api/health` 返回当前 build metadata；
- `/api/ready` 返回 200；
- frontend build ID = backend build ID；
- 无 Token 401、错误 Token 403、正确 Token 200；
- 只有一个 supervisor、一个 backend、一个 8787 listener；
- desktop/phone/tablet 可进入项目页和编辑器；
- 无 pageerror、无失败同源请求、无横向溢出。

### 项目系统

- UI 创建的项目显示最终物理目录；
- 空白模板确实 `template:null`；
- 重命名后 ID 不变；
- 是否移动目录由用户明确选择；
- 冲突时原项目完全不变；
- UI 和 authoritative `papers/` 对应关系可解释。

### Provider

- Codex、Claude、Copilot 分别展示安装、认证、连通和权限；
- 非付费 probe 可从 UI 完成；
- Copilot 未知认证不能显示绿色“已登录”；
- Chat 保持只读；
- 文件修改必须经过 Diff 和 Accept。

### Skills

- 高频 Skills 有显式 metadata；
- 至少一组代表性 Skills 达到 ready；
- last-run 持久化；
- objective_passed 有真实产物验证；
- unavailable/degraded 原因可聚合和一键处理。

### RAG

- 完整 UI 添加/搜索/删除旅程通过；
- 关键词 baseline 有固定评测；
- 语义能力存在时有独立标识和指标；
- 来源、行号、分数语义清楚；
- 损坏索引不会静默自动改写。

## 17. 未知项与本轮限制

以下结论本轮不能给出“已通过”：

- Codex、Claude、Copilot 的真实付费模型调用；
- Copilot 的真实登录态；
- 当前正式环境重启后的最终状态；
- repository `papers/` 是否就是管理员最终希望的 authoritative root；
- 每个模板在当前主机上的真实编译结果；
- PDF OCR 的真实质量；
- 外部检索在真实网络下的稳定性和限流；
- 123 个 Skills 的任务级成功率；
- RAG 对同义词、跨语言和复杂 claim 的真实 recall。

这些未知项不能用“代码存在”“测试文件存在”或“CLI 已安装”替代。

## 18. 最终判断

当前仓库的主要矛盾已经从“功能不存在”转为“功能、运行态、数据根、测试和发布没有形成同一事实”。

最准确的描述是：

> 当前源码已经具备较完整的 Paper Writer 产品化基础，Codex/Claude/Copilot、项目身份、RAG、Skills、安全边界和移动端均有实质实现；隔离测试也大部分通过。但正式 LAN 仍运行旧后端、没有当前鉴权和 build metadata、使用错误的数据根，并被 Deployment Gate 完全阻断。与此同时，真实 UI 创建、项目目录语义、Provider 状态、Skills ready、RAG 质量和发布后验收仍有明显缺口。

因此当前版本应保持 **BLOCK**，先恢复正式部署一致性和数据根，再补用户旅程测试，最后推进 Skills/RAG 的真实任务级成熟度。
