# Paper Workbench 运行环境子域拆分计划

日期：2026-07-22

## 现状

`app/apps/backend/src/services/paperWorkbenchService.js` 超过 8000 行，同时承担任务路由、证据审查、Skill 决策、工作包、UI projection、生产可用性和运行环境探测。运行环境相关函数约 350 行，集中处理 OCR、PDF 文本抽取、Playwright preflight/E2E 状态、production gates、复验计划和复制文本，与核心写作路由边界清晰。

## 行为保护

- `app/apps/backend/src/services/__tests__/paperWorkbenchService.test.js` 已覆盖 runtime environment、OCR、PDF 抽取、浏览器 E2E gate、readiness tiers 和 copy text；
- `app/tests/workbenchPrototype*.test.mjs` 与路由测试覆盖完整 Workbench API projection；
- 本次拆分前先运行相关回归并保留原有状态值、中文文案、命令包和 JSON shape；
- 拆分后运行同一组测试及完整 unit，不新增依赖。

## 拆分边界

新模块 `paperWorkbenchRuntimeEnvironment.js` 负责：

- `buildRuntimeEnvironmentGuide`；
- OCR/PDF/浏览器三项 production gate；
- Playwright preflight 与完整 E2E 状态文件读取；
- 依赖修复后的 recheck plan；
- runtime environment copy text。

`paperWorkbenchService.js` 只导入并使用 `buildRuntimeEnvironmentGuide`，不再直接读取 Playwright 状态文件或调用 `buildOcrCapability`。

## 不做事项

- 不改变 readiness 算法和阈值；
- 不改变状态文件路径或格式；
- 不修改 OCR、RAG 或 Playwright 脚本；
- 不重命名 API 字段；
- 不拆分其他工作台子域。

## 验收

- 现有 Workbench service/route/static contract 测试全部通过；
- 完整 unit 通过；
- `paperWorkbenchService.js` 不再包含运行环境状态文件读取实现；
- API 返回的 runtime environment、production gates、recheck plan 和 copy text 与拆分前一致。
