# M02 三分钟实操演示脚本

目标：3 分钟内展示 OpenPrism Office 真实跑通办公场景，并主动呈现缺证据时不形成高分结论的诚实边界。

| 时间 | 操作画面 | 讲稿 | 取证点 |
| --- | --- | --- | --- |
| 00:00-00:14 | 打开项目和六阶段工作台 | 这是 OpenPrism Office，可核验的 AI 办公材料工作台。 | 项目名、六阶段导航 |
| 00:14-00:26 | 收件导入脱敏 DOCX | 原来资料散落在文档和聊天记录中，现在先进入项目账本。 | inbox ready、native-ooxml、来源路径 |
| 00:26-00:50 | 处理阶段运行计划/配方 | AI 可辅助整理和起草；外部能力缺失时系统明确 unavailable。 | OfficeCLI 外部能力诚实失败态 |
| 00:50-01:15 | 审阅阶段检索和证据图 | 关键结论必须能回到来源，支持、冲突和缺失都会展示。 | BM25/向量/rerank 分数、support/conflict/missing |
| 01:15-01:38 | 评论、建议和人工审批 | AI 只给建议，最终采纳由人批准。 | 评论、accepted、approved/published |
| 01:38-02:02 | 度量阶段填写全成本 | 提效计算包含生成、复核、返工、配置和维护成本；演示样本保持 designed。 | baseline/AI/review/retry/setup/maintenance、effect-not-measured |
| 02:02-02:28 | 审核、建议分与导出 | 系统显示非官方准备度建议 94、低置信度和风险，并导出 M01-M06、评委说明与 manifest。 | totalGuidanceScore、confidence、risks、submission 文件列表 |

## 录制要求

- 视频总长不超过 3 分钟。
- 使用受控演示数据时，画面或旁白必须说明“演示数据，不作为真实业务成效”。
- 至少展示一次证据冲突或材料待补风险。
- 不展示 Token、账号、客户名、生产地址、个人信息或未授权截图。
- 保留原始 WebM/MP4、关键截图、时间戳清单和导出 manifest。

实际录屏：优先上传 `evidence/demo/office-demo.mp4`，原始文件为同目录 `office-demo.webm`；两者 ffprobe 核验时长均为 148.840 秒，关键画面和截图见 `evidence/demo/timestamps.md`。
