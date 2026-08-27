# E05 输出质量说明

## 当前可核验结论

本页记录“输出是否因提速而降质”的证据边界。当前只有受控技术评估和工作流测试，不把它写成真实业务质量结论。

| 检查项 | 当前结果 | 证据 | 适用边界 |
| --- | --- | --- | --- |
| 中文检索、证据关系、会议提取 | 9/9 通过 | `experiments/results/office_competition_controlled_evaluation_20260827.json` | 4 份受控材料、9 项检查 |
| 否定提效主张识别 | 首轮 1 项失败，修复后通过 | `E04-red-green-tests.md`、`officeIntelligenceService.test.js` | 证明回归已修复，不代表覆盖所有中文表达 |
| 缺证据主张 | 显示 missing，不生成虚构来源 | 连续录屏审阅阶段、证据图测试 | 受控样例和当前规则实现 |
| 人工审批门禁 | 非法状态跳转被拒绝 | `officeWorkflowService.test.js`、`E09-approval-log.md` | 本地工作流状态，不代表外部平台送达 |
| 参赛材料完整性 | 53 文件清单目标、必需项契约校验 | `submission-manifest.json`、`competitionSubmissionContract.test.mjs` | 最终数字以最新 manifest 为准 |

## 真实试点必须补充的质量字段

每个真实任务至少记录：

- 输入任务类型、质量标准和最终审批人；
- AI 初稿中的事实错误数、无证据主张数和数字口径错误数；
- 人工修改段落数、建议采纳/拒绝数、返工轮次；
- 最终产出是否按时交付、是否被退回、退回原因；
- 与人工基线是否采用同一任务目标和验收标准。

真实记录进入 `E05-effect-measurement.csv` 或 `pilot-measurement-register.csv`。没有这些记录时，只能陈述“受控技术检查通过”和“质量门禁存在”，不能陈述错误率下降、质量稳定提升或业务验收成功。
