# 测试与发布门禁

日期：2026-07-22

## 统一入口

所有命令在仓库根目录运行，由根 `package.json` 原样转发到 `app/`；任一子命令失败都会保留非零退出码：

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run typecheck
npm run check
npm run check:full
```

- `test:unit`：不启动后端，排除 `*.integration.test.mjs`。
- `test:integration`：隔离后端上的 API 集成测试。
- `test:e2e`：先构建，再运行隔离 Playwright。
- `typecheck`：运行前端真实 `tsc --noEmit`，重复对象键、不完整联合类型和 API 参数类型错误都会阻止发布。
- `check`：依次执行 TypeScript 类型检查、生产构建和单元测试。
- `check:full`：隔离源码门禁，包含类型检查、生产构建、单元、集成和隔离 E2E；它不替代正式部署验收。
- `release:verify`：针对已启动实例的只读健康、build/schema、鉴权、数据根、Provider 和 Legacy 入口验收；需要 `BASE_URL`（或 `OPENPRISM_PUBLIC_URL`）、`OPENPRISM_API_TOKEN`，正式 LAN 验收仍需另外运行三视口 Playwright。

首次安装同样从根目录执行 `npm run install`。npm workspace 与唯一锁文件位于 `app/package.json`、`app/package-lock.json`；仓库不再维护 pnpm 锁文件。

`npm start` 同样从仓库根目录执行。app workspace 会兼容加载仓库根 `.env`，随后用 `app/.env` 覆盖同名变量；两者都是可选的被忽略本地配置，缺失时必须进入后端默认配置逻辑，而不能在 Node 启动前退出。

## 隔离规则

`scripts/run-e2e-isolated.mjs` 是服务生命周期唯一所有者：

- 绑定随机 `127.0.0.1` 端口；
- 使用临时 `OPENPRISM_DATA_DIR` / `OPENPRISM_PROJECTS_DIR`；
- 删除宿主环境继承的普通 `OPENPRISM_API_TOKEN`，每次生成独立随机 Token（显式 `OPENPRISM_E2E_API_TOKEN` 可覆盖），并映射到隔离后端、API fixture 和浏览器 sessionStorage；无 Token fail-closed 由认证单测独立验证；
- Playwright 项目测试自行创建唯一 fixture，并在每项结束后永久清理；
- 测试报告和截图写入临时目录；
- 成功、失败或异常时都停止子进程并删除临时数据。

禁止依赖开发者 `papers/` 中的项目、固定名称（例如 `torq`）、固定端口或测试之间共享的可变顺序状态。

## 文案断言

组件已采用 i18n 时，静态契约测试应验证翻译 key、插值参数和动作绑定，不应继续断言迁移前的渲染文案或字符串模板。

## 回归证据

- `tests/e2eIsolationContract.test.mjs`
- `tests/e2e/projects.spec.ts`
- `tests/e2e/mobile-workspace.spec.ts`
- `tests/deploymentHandshake.test.mjs`
- `tests/e2e/capabilities.spec.ts`（包含版本不一致阻断）
- `tests/projectTreeCreateUi.test.mjs`
- `tests/toolchainContract.test.mjs`

## 正式运行态门禁

隔离测试通过后，正式交付还必须验证运行实例，而不能只确认构建产物存在：

1. 解析并确认旧监听 PID、工作目录和端口，只终止本仓库服务；
2. 使用最新 frontend dist 和当前 backend 源码启动唯一 `0.0.0.0:8787` 进程；
3. 同时请求 loopback 与 LAN health；
4. 断言 frontend build ID、backend build ID 和 API schema 一致，并验证 `/api/ready` 全部检查为 true；
5. 验证 `/api/providers` 与当前前端契约一致；
6. 无 Token 时验证 `/api/config`、项目、`/api/code/exec`、Terminal/CLI Provider 和 `/api/capabilities` fail-closed；
7. 用 LAN URL 运行桌面与手机 Playwright 冒烟，检查设置页、Provider、系统能力提示和横向溢出；
8. 确认没有隔离测试端口、临时项目或孤儿浏览器进程残留。

正式实例的自动化只读探针：

```bash
BASE_URL=http://10.30.0.22:8787 \
OPENPRISM_API_TOKEN="$OPENPRISM_API_TOKEN" \
npm run release:verify
```

`npm run build` 会先运行 `scripts/prepare-build-id.mjs`，把一次性 build metadata 写入被 Git 忽略的后端运行文件，并把同一个 ID 编译进前端。后端只在进程启动时读取该文件，因此重新构建前端但没有重启后端会被浏览器可靠识别为版本不一致。

2026-07-22 当前整改复核还要求：发布前必须分别记录隔离串行 E2E 与正式 LAN 多视口结果；前者证明源码旅程，后者证明实际进程已加载同一 build、鉴权和权威数据根。当前共享单后端 runner 必须保持 `fullyParallel: false`、`workers: 1`，恢复并行前需要 worker 级后端/数据隔离证据。
