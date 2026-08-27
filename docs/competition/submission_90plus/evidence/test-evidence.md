# 工程验证证据

本文件记录最终提交版本的验证命令和结果。它用于证明作品可运行、状态边界可靠和演示可复现，不直接替代真实业务成效。

## 当前提交基线

- 分支：`feat/office-track-writing-workbench`
- 基线提交：`dd90034 Make the competition demo understandable without narration`；本文件记录其上的 replacement-v2 候选工作树
- 办公主流程：收件 → 处理 → 审阅 → 审批 → 交付 → 度量

## 已完成验证

| 验证 | 结果 | 说明 |
| --- | --- | --- |
| 办公智能服务回归 | 6/6 通过 | 含中文“没有证明稳定提效”冲突回归 |
| 受控评估 | 9/9 通过 | 4 个检索、4 个证据关系、1 个会议提取检查 |
| 受控重复运行 | 100 次完成 | 性能数字见 M05 和结果 JSON |
| 第二版演示契约红灯 | 3 项失败 | 旧 UI 缺解析/执行详情，旧主演示没有 OfficeCLI 成功与 `coverage.json` |
| 第二版演示契约绿灯 | 5/5 通过 | 六阶段 success、OfficeCLI `ok`、19 张截图及最小文件大小全部通过 |
| 提交包契约绿灯 | 5/5 通过 | 必交文件、PDF/视频/覆盖率/日志、哈希同步、敏感信息模式和空白试点表 |
| 全量单元测试 | 520/520 通过 | 95 个测试文件，包含提交包、演示覆盖与办公服务回归 |
| API 集成测试 | 13/13 通过 | 隔离后端与临时数据目录 |
| Chromium E2E | 历史全量 38/38；本次定向 2/2 | 单 worker；本次重跑六阶段桌面主流程及 390×844 窄屏操作 |
| 生产构建/类型检查 | 通过 | 前端 TypeScript 无错误；Vite 生产构建在全量流程中执行两次 |
| 演示脚本语法 | 4/4 通过 | 录像、成片剪辑、PDF、manifest 四个 Node 脚本通过 `node --check` |
| 中文字幕红绿灯 | 修复前 1 失败，修复后 5/5 通过 | 阶段字幕改用内置 Noto Sans SC，并等待 `document.fonts.ready` |
| 连续演示媒体 | WebM 4,538,522 bytes；H.264 MP4 2,005,173 bytes；均为 73.760 秒 | ffprobe 核验，1440×960、yuv420p、小于 180 秒 |
| 参赛提交成片 | H.264/AAC MP4 6,635,894 bytes；150.424 秒 | 1920×1080、yuv420p、48 kHz 双声道；8 张 PPT、6 段实操、中文讲解和 50 条逐句字幕 |
| 功能覆盖契约 | 5/5 通过 | 六阶段 success；OfficeCLI `ok`；19 张截图；每阶段至少两张；每张超过 50 KB |
| 完整包清单 | 75 个文件 | 必交项无缺失，逐文件字节数与 SHA-256 由契约测试复算 |

## 复现命令

```bash
node --test app/apps/backend/src/services/__tests__/officeIntelligenceService.test.js
node experiments/office_competition_controlled_evaluation.mjs --output experiments/results/office_competition_controlled_evaluation_20260827.json
npm run check:full
npm run competition:video
npm run competition:pdf
npm run competition:manifest
npm --prefix app exec -- vitest run tests/competitionSubmissionContract.test.mjs
```

以上结果于 2026-08-28 在候选工作树上复核。最终上传前若任何材料字节发生变化，必须重新生成成片/PDF 和 manifest，并再次运行提交包契约测试。
