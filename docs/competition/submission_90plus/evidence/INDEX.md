# 证据索引

证据等级沿用比赛规则：E3 为原始数据、日志、连续录屏、可运行代码或真实业务记录；E2 为前后样例、测算表、测试记录或完整操作过程；E1 为单张截图或主观反馈；E0 为无有效来源的结论。

| 编号 | 结论 | 等级 | 状态 | 位置 | 边界 |
| --- | --- | --- | --- | --- | --- |
| E3-01 | 六阶段办公流程可在真实浏览器中连续操作 | E3 | 已核验：160.840 秒提交成片、148.840 秒原始连续操作 | `demo/office-demo-submission.mp4`、`demo/office-demo.mp4`、`demo/office-demo.webm`、`demo/office-demo-submission-transcript.md`、`demo/timestamps.md` | 成片仅增加片头、字幕和片尾；受控演示不代表生产落地 |
| E3-02 | 浏览器用例覆盖收件、处理、审阅、审批、度量、交付和诚实缺口状态 | E3 | 已核验 | `app/tests/e2e/office-delivery.spec.ts` | 可运行代码与测试 |
| E3-03 | 审批状态机拒绝非法跳转，必须保留人类批准事件 | E3 | 已核验 | `app/apps/backend/src/services/__tests__/officeWorkflowService.test.js` | 代码行为 |
| E3-04 | 系统能生成 M01-M06、评委材料和 SHA-256 manifest | E3 | 已核验 | `app/apps/backend/src/services/officeTrackService.js` 及测试 | 代码行为 |
| E2-01 | 中文检索、证据关系和会议提取受控评估 9/9 通过 | E2 | 已核验 | `experiments/results/office_competition_controlled_evaluation_20260827.json` | 技术实验，不是企业提效 |
| E2-02 | 桌面与手机界面无主流程阻断 | E2 | 已核验 | `demo/` 截图及 `.impeccable/review/office-v2-*.png` | 视觉/操作验证 |
| E2-03 | 提交版本通过单元、集成和 Chromium E2E 验证 | E2 | 已核验 | `test-evidence.md` | 工程质量，不直接等同业务价值 |
| E2-04 | 受控输出质量门禁、失败与修复记录可定位 | E2 | 已核验 | `E05-quality-notes.md`、`E04-red-green-tests.md` | 不替代真实业务质量对比 |
| E2-05 | 模板、SOP、Skill 和生成器资产真实存在并能在临时项目运行 | E2 | 已核验 | `E06-reuse-assets.md`、`E10-reuse-dry-run.md` | 自动化复现，不是独立用户复现 |
| E1-01 | 原流程存在资料分散、证据核验和审批留痕负担 | E1 | 参赛方说明 | M01“原流程与痛点” | 需真实岗位材料增强 |
| BIZ-01 | 真实岗位连续使用与净提效 | E3 | 待真实试点 | `../pilot-measurement-register.csv` | 禁止使用测试 fixture 填充 |
| BIZ-02 | 非作者普通用户可按 SOP 独立复现 | E3 | 待真实复用验证 | `../reuse/operator-checklist.md` | 需用户签字/录屏/反馈 |

## 证据使用规则

1. 关键主张必须引用本表编号和具体文件位置。
2. E3-01 至 E3-04 可证明产品和演示行为，不能自动升级为 BIZ-01。
3. 测试中的 120、45、20 等数字是 fixture，只验证计算逻辑，不作为比赛提效数据。
4. 任何真实业务数据进入提交包前必须脱敏，并由数据负责人或业务负责人确认。
