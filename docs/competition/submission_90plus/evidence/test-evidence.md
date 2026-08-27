# 工程验证证据

本文件记录最终提交版本的验证命令和结果。它用于证明作品可运行、状态边界可靠和演示可复现，不直接替代真实业务成效。

## 当前提交基线

- 分支：`feat/office-track-writing-workbench`
- 基线提交：`e4c6505 Make office work auditable from intake through delivery`
- 办公主流程：收件 → 处理 → 审阅 → 审批 → 交付 → 度量

## 已完成验证

| 验证 | 结果 | 说明 |
| --- | --- | --- |
| 办公智能服务回归 | 6/6 通过 | 含中文“没有证明稳定提效”冲突回归 |
| 受控评估 | 9/9 通过 | 4 个检索、4 个证据关系、1 个会议提取检查 |
| 受控重复运行 | 100 次完成 | 性能数字见 M05 和结果 JSON |
| 提交包契约红灯 | 2 失败、2 通过 | 首次执行时最终 `submission-manifest.json` 尚未生成，准确暴露缺口 |
| 提交包契约绿灯 | 4/4 通过 | 必交文件、PDF/视频、哈希同步、敏感信息模式和空白试点表 |
| 全量单元测试 | 518/518 通过 | 94 个测试文件，包含提交包契约与办公服务回归 |
| API 集成测试 | 13/13 通过 | 隔离后端与临时数据目录 |
| Chromium E2E | 38/38 通过 | 单 worker；包含六阶段办公流程及 390×844 窄屏操作 |
| 生产构建/类型检查 | 通过 | 前端 TypeScript 无错误；Vite 生产构建在全量流程中执行两次 |
| 演示脚本语法 | 3/3 通过 | 录像、PDF、manifest 三个 Node 脚本通过 `node --check` |
| 中文字幕红绿灯 | 修复前 1 失败，修复后 5/5 通过 | 阶段字幕改用内置 Noto Sans SC，并等待 `document.fonts.ready` |
| 连续演示媒体 | WebM 5,886,270 bytes；H.264 MP4 2,451,487 bytes；均为 148.840 秒 | ffprobe 核验，1440×960、yuv420p、小于 180 秒 |
| 完整包清单 | 53 个文件 | 必交项无缺失，逐文件字节数与 SHA-256 由契约测试复算 |

## 复现命令

```bash
node --test app/apps/backend/src/services/__tests__/officeIntelligenceService.test.js
node experiments/office_competition_controlled_evaluation.mjs --output experiments/results/office_competition_controlled_evaluation_20260827.json
npm run check:full
npm run competition:pdf
npm run competition:manifest
npm --prefix app exec -- vitest run tests/competitionSubmissionContract.test.mjs
```

以上结果于 2026-08-27 在候选工作树上执行，基线提交为 `e4c6505`。最终上传前若任何材料字节发生变化，必须重新生成 PDF 和 manifest，并再次运行提交包契约测试。
