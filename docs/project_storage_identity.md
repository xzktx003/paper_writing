# 项目身份与存储定位架构决策

日期：2026-07-22

## 决策摘要

Paper Agent 的受管项目采用四层明确模型：

| 概念 | 字段/来源 | 规则 |
| --- | --- | --- |
| 稳定身份 | `project.json.id` | 完整 UUID，创建后不可变，API 与跨模块关联只使用该值 |
| 用户名称 | `project.json.name` | 允许中文、空格和符号，可重命名 |
| 磁盘目录 | `project.json.directoryName` | 安全可读 slug 加 8 位 UUID，例如 `中文-论文--79692122` |
| 项目根路径 | Project Locator | 仅由权威数据根和 `directoryName` 计算，不接受客户端指定绝对路径 |

权威数据根是 `OPENPRISM_DATA_DIR`。旧变量 `OPENPRISM_PROJECTS_DIR` 只在主变量未设置时作为兼容别名；如果两者同时存在且指向不同目录，后端采用 `OPENPRISM_DATA_DIR` 并输出启动警告。`/api/config.projects_dir` 是当前运行根目录的只读事实，不再维护另一套设置语义。

## 目录命名规则

新项目目录由 `slugifyProjectName(name)` 与稳定 ID 的前 8 个字母数字字符组成：

```text
<readable-slug>--<short-id>
```

- Unicode 字母和数字保留，因此中文标题仍可辨识；
- 空格和下划线归一化为连字符；
- 路径分隔符及其他符号不会进入目录名；
- 纯符号名称使用 `project` 回退；
- slug 最长 72 个 Unicode 字符，避免超长路径；
- 同名项目依靠 UUID 后缀自然隔离；完整 UUID 始终保存在元数据中。

## 创建与兼容

新建、ZIP 导入、arXiv 导入和复制项目都写入：

```json
{
  "id": "完整 UUID",
  "name": "用户名称",
  "directoryName": "安全可读目录--短ID",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

旧 UUID 目录和历史可读目录不做破坏性批量迁移。Locator 先处理兼容的直接目录，再扫描 `project.json.id`；没有元数据但包含论文文件的上传目录仍由项目列表注册，并把真实目录写入 `directoryName`。列表响应中的 `directoryName` 与兼容字段 `dirName` 始终取实际磁盘目录，避免陈旧元数据误导调用方。

## 重命名事务边界

项目重命名在同一个项目锁内执行：

1. 通过完整 ID 解析当前目录并读取元数据；
2. 根据新名称和原 ID 计算目标 `directoryName`；
3. 目标已存在时返回 HTTP 409，不修改源目录或元数据；
4. 先迁移目录，再使用临时文件加原子 rename 提交新的 `project.json`；
5. 元数据提交失败时把目录迁回原位置；如果回滚本身失败，错误对象保留 `rollbackError` 供日志和人工恢复使用；
6. 成功后更新 `name/directoryName/updatedAt`，保持 `id/createdAt` 不变。

此事务只覆盖同一文件系统中的目录和元数据一致性。外部进程在迁移瞬间持有旧绝对路径仍可能失效，因此长期接口必须使用 `projectId + relativePath`，不能持久化派生绝对路径。

## 模块接入规则

- 项目路由直接使用 `services/projectLocator.js`；
- Draw 与 RAG 必须以 managed `projectId` 调用同一个 Locator；
- `projectService.getProjectRoot` 暂时保留为兼容 re-export，避免一次性破坏旧调用方；
- 正式 React 工作区的章节、AI、Review、Anti-AI、Citation、Pipeline、文件 watcher 和 Terminal 统一发送 `projectId`；文件级操作另发项目内 `relativePath`，浏览器不再为这些主路径构造 `__paper_agent__:<id>`；
- 后端 `managedProjectContext` 以 `projectId` 为权威输入。旧客户端仅发送 `__paper_agent__:<id>` 时仍可兼容解析，但会记录 deprecated usage 并返回 `Deprecation: true` 与 `X-OpenPrism-Deprecated-Input: projectPath`；当新旧字段同时存在时，始终采用 `projectId`；
- managed API 拒绝外部绝对路径。外部 Code 浏览与 MCP 是单独的 external-path 能力，仍显式使用绝对 `projectPath` 并由各自的数据根和路径校验保护；这不是 managed paper 主路径的回退接口；
- 浏览器不能提交任意磁盘根或利用显示名称拼接后端路径。

## 会话隐私存储边界

会话、PDF 附件正文和会话选择的 RAG 文档属于项目数据，不再写入开发者
`$HOME/.paper-writer/conversations/<projectId>`。正式会话存储固定位于同一
受管项目根下：

```text
<projectRoot>/.openprism/conversations/<conversationId>.json
```

每次会话读写先通过 Project Locator 校验 `projectId`，再校验
`conversationId` 的安全格式；客户端不能利用会话 ID 构造路径或访问另一个
项目的会话。项目永久删除前，后端同时清理项目内会话目录和迁移前遗留的
`$HOME/.paper-writer/conversations/<projectId>` 隐私残留。软删除（trash）不清理
数据，以便用户恢复；只有明确的 permanent 删除才触发不可逆清理。

## 验证门禁

相关回归测试必须至少覆盖：

- 中文、空格、纯符号、超长、同名项目目录生成；
- 完整元数据与真实列表目录一致；
- 旧 UUID 和历史可读目录解析；
- 重命名保持 ID、迁移目录并更新时间；
- 目标冲突返回 409 且源项目不变；
- 元数据写入失败后的目录回滚；
- `OPENPRISM_DATA_DIR` 优先级、旧别名回退和冲突告警；
- Draw/RAG 通过 managed ID 访问同一项目根。
- 会话创建、读取、更新、附件读写和删除只接受已存在的 managed `projectId`，并将 JSON 写入项目内 `.openprism/conversations`；未知项目和非法 conversation ID 必须返回结构化 4xx。
- 永久删除项目后，项目内会话和迁移前 `$HOME/.paper-writer` 会话残留均不存在。
- 正式 React 调用点不含 `__paper_agent__` marker，并统一序列化 `projectId + relativePath`；
- 旧 marker 兼容路径可观测且带弃用响应头，新旧字段并存时 `projectId` 权威；
- managed API 拒绝绝对路径，而显式 external Code/MCP 能力保持独立、受控的路径契约。

## 当前定位性能边界

Project Locator 在首次或缓存失效时仍会扫描数据根并校验每个 `project.json`，以保留旧 UUID 目录、手工移动目录和恢复场景。当前实现会缓存经过 `lstat`、非 symlink、metadata `id` 匹配验证的 `projectId -> projectRoot` 结果；缓存路径不存在或身份改变时立即失效并回退扫描。缓存只优化重复查找，不是安全信任边界。重命名、已有目录注册和测试迁移必须更新或清理缓存。
