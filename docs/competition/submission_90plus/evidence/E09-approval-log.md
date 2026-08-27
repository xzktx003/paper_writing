# E09 人工审批记录

## 受控演示记录

- 任务：OpenPrism Office 办公赛道演示。
- 数据属性：仓库内 DOCX 样例和脱敏演示文本。
- 审阅意见：删除“长期稳定提效”这类没有真实样本支持的结论。
- 采纳决定：接受，替换为“受控演示仅证明流程跑通，真实提效以试点表为准”。
- 审批动作：演示脚本通过正式 API 写入人工批准事件，再进入本地 published 状态。
- 证据：`demo/11-approve-gate.png`、`demo/12-approve-approved.png`、`demo/13-approve-published.png`、`demo/office-demo.webm`、`workflow-state-samples/office-workflow.json`。

边界：这是受控演示审批记录，不是企业生产审批或外部平台投递凭证。
