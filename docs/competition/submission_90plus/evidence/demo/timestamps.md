# 演示时间戳清单

推荐上传：`office-demo.mp4`；原始录屏：`office-demo.webm`

| 时间 | 画面 | 证据说明 | 截图 |
| --- | --- | --- | --- |
| 00:06 | ① 收件｜选择脱敏 DOCX | 用户在项目相对路径中选择受控 DOCX，准备执行本地解析。 | 01-inbox-input.png |
| 00:09 | ① 收件｜DOCX 解析成功 | 界面显示 native-ooxml、ready、来源路径与解析器，证明导入不是静态图片。 | 02-inbox-ready.png |
| 00:12 | ① 收件｜展开解析证据 | 展开段落数、检索分块、字符数与原文摘录，完整展示解析成功结果。 | 03-inbox-details.png |
| 00:16 | ② 处理｜生成安全执行计划 | OfficeCLI validate 计划展示受控 argv；此时尚未修改文件。 | 04-produce-plan.png |
| 00:22 | ② 处理｜OfficeCLI 执行成功 | 真实 OfficeCLI 返回 ok / validate，失败态已由成功执行结果替换。 | 05-produce-success.png |
| 00:26 | ② 处理｜配方进入人工审阅 | 本地配方完成 triggered → processing → review，强制保留人工审阅门禁。 | 06-produce-workflow.png |
| 00:29 | ② 处理｜会议决定与待办提取成功 | 带时间戳逐字稿提取出 1 项决定和 1 项待办，并明确不宣称自动说话人分离。 | 07-produce-meeting.png |
| 00:34 | ③ 审阅｜混合检索返回来源和分数 | 同屏展示来源路径、BM25、哈希向量、Rerank 与最终得分。 | 08-review-search.png |
| 00:37 | ③ 审阅｜支持、冲突与缺口同时可见 | 证据图对三条主张分别给出 support、conflict、missing，不用单一分数掩盖风险。 | 09-review-graph.png |
| 00:41 | ③ 审阅｜人工接受修订建议 | 审阅意见删除无真实样本支持的提效结论，accepted 决策进入留痕。 | 10-review-suggestion.png |
| 00:44 | ④ 审批｜发布前必须人工确认 | 运行仍在 review，系统明确要求核对来源、数字、敏感信息与建议决策。 | 11-approve-gate.png |
| 00:48 | ④ 审批｜人工批准事件已记录 | 状态进入 approved，审批人与时间事件独立保存在审批账本。 | 12-approve-approved.png |
| 00:51 | ④ 审批｜本地发布状态完成 | published 只表示本地工作流状态，参赛文件仍需在交付阶段另行人工导出。 | 13-approve-published.png |
| 00:54 | ⑤ 度量｜全成本字段完整录入 | 基线、AI、人工复核、重试、配置、维护和样本量全部进入同一测量记录。 | 14-measure-inputs.png |
| 00:58 | ⑤ 度量｜受控样本成功记录 | 演示计算结果明确标记 measurementStatus=designed，只验证记录与计算，不作为业务提效证明。 | 15-measure-controlled.png |
| 01:04 | ⑥ 交付｜审核前保持人工门禁 | 交付页要求先运行证据审核，再核对真实数据、敏感信息和审批责任。 | 16-deliver-before-audit.png |
| 01:08 | ⑥ 交付｜准备度审核完成 | 非官方准备度建议 94 / 100、low 置信度与形成条件同时展示。 | 17-deliver-audit.png |
| 01:11 | ⑥ 交付｜风险与证据边界展开 | effect-not-measured、信息复核和可读性风险保持可见，防止把演示包装成业务成效。 | 18-deliver-risks.png |
| 01:14 | ⑥ 交付｜参赛文件与哈希生成成功 | M01—M06、评委材料和 SHA-256 manifest 真实生成并列出短哈希。 | 19-deliver-export.png |

生成时间：2026-08-27T16:37:17.071Z
视频大小：4538522 bytes
MP4 兼容版大小：2005173 bytes
说明：本录屏使用受控演示项目和仓库内 DOCX 示例，不作为真实业务提效证明。
