# OpenPrism Office 办公赛道参赛准备包

日期：2026-08-27

本目录用于把 OpenPrism Office 包装为“智效同行·AI生产力创新挑战赛”办公场景参赛作品。材料口径以当前代码和规则文件为准，不写未验证的提效数据、用户数量、落地周期、获奖承诺或官方评分结论。

## 作品定位

- 作品名称建议：OpenPrism Office
- 中文描述：可核验的 AI 办公材料工作台
- 申报赛道：办公场景
- 核心场景：项目申报书、技术方案、研究总结、评审说明、答辩稿等长文案写作
- 核心机制：Brief、来源登记、证据索引、AI 草拟、人工审批、效果测量、复用资产、审核导出在同一项目链路内闭环

## 当前系统能自动提供的证据

| 证据 | 当前来源 |
| --- | --- |
| 正式工作台入口 | 项目页右侧“交付”面板 |
| 状态留痕 | 项目内 `.openprism/office-track.json` |
| V2 收件/检索/会议留痕 | 项目内 `.openprism/office-workspace.json` |
| V2 配方/运行/审阅/审批/遥测留痕 | 项目内 `.openprism/office-workflow.json` |
| Office 材料能力 | 内置 DOCX/PPTX/XLSX OOXML 抽取；可选 OfficeCLI 创建/编辑/合并/渲染/验证 |
| 证据关系 | BM25 + 哈希向量 + rerank 分数分解，以及 support/conflict/missing 图 |
| 会议证据 | 用户提供的带时间戳逐字稿、已有 speaker 标签、候选决定和待办 |
| 参赛导出包 | 项目内 `submission/` |
| 审核建议 | `/api/projects/:id/office-track/audit` |
| 导出清单和哈希 | `submission/submission-manifest.json` |
| 初赛材料骨架 | `M01-proposal.md` 到 `M06-reuse-assets.md`、`reviewer-guide.md`、`initial-score-guide.md`、`blank-initial-score-sheet.md` |
| 决赛准备骨架 | `finals-pack.md`、`finals-score-guide.md` |
| 复用模板 | `app/templates/office-track-writing/` |

## 仍需人工补齐的真实材料

- 受控 3 分钟内连续实操已经生成 MP4/WebM；参赛负责人仍需在上传后确认平台播放兼容性，并按实际报名身份补充必要旁白或片头信息。
- 至少一组真实办公任务的基线耗时、AI 使用耗时、复核耗时、返工耗时、样本量和统计周期。
- 真实输出样例，需先脱敏，且能定位到证据索引。
- 使用人、使用周期、使用频次或试点记录。没有这些记录时，只能写“Demo 跑通”或“待试点”。
- 敏感信息处理记录，包括是否删除 Token、个人信息、内部地址和未授权截图。
- 现场答辩问答记录。没有问答材料时，决赛“问题应答成熟度”只能标为待现场评分。

## 系统导出与提交清单

| 编号 | 材料 | 系统导出文件 | 责任边界 |
| --- | --- | --- | --- |
| M01 | 作品方案文档 | `submission/M01-proposal.md` | 系统生成骨架；参赛方补真实场景、流程、边界 |
| M02 | 3 分钟演示材料 | `submission/M02-demo-script.md` | 系统生成脚本；参赛方录制真实操作视频 |
| M03 | 复用价值说明 | `submission/M03-reuse-statement.md` | 系统汇总复用资产；参赛方说明目标岗位和部署条件 |
| M04 | 作品意义 | `submission/M04-significance.md` | 系统生成初稿；参赛方校准业务价值 |
| M05 | 效果证明材料 | `submission/M05-effect-evidence.md` | 系统复算已填数据；参赛方提供真实样本和周期 |
| M06 | 标准化资产清单 | `submission/M06-reuse-assets.md` | 系统列出模板/SOP/Skill；参赛方验证可复现性 |
| R01 | 评委评审说明 | `submission/reviewer-guide.md` | 系统生成准备度说明；参赛方不得改成官方评分 |
| R02 | 初赛建议分说明 | `submission/initial-score-guide.md` | 列出 AI 准备建议、分档、扣分和置信度；不代表人工评委分 |
| R03 | 空白初赛评分表 | `submission/blank-initial-score-sheet.md` | 供评委填写，不由参赛方预填 |
| F01 | 决赛材料准备包 | `submission/finals-pack.md` | 系统整理演示、问答、落地和推广待补项；需参赛方补真实记录 |
| F02 | 决赛附加分准备说明 | `submission/finals-score-guide.md` | 按四项附加分列出当前证据状态；无现场问答时保持待评 |
| P01 | 90+ 准备总包 | `submission/90plus-readiness-pack.md` | 将四模块高分门槛、材料排序、不得填写内容汇总到一处 |
| P02 | 评分证据矩阵 | `submission/90plus-score-evidence-matrix.md` | 按 30/30/20/20 映射目标档、证据位置和缺口 |
| P03 | 演示取证计划 | `submission/demo-evidence-plan.md` | 固定 3 分钟连续录屏分镜、截图和失败态要求 |
| P04 | 试点测量登记表 | `submission/pilot-measurement-register.csv` | 提供真实样本采集字段；默认 planned，不预填提效数字 |
| P05 | 评委问答稿 | `submission/reviewer-qna.md` | 准备常见追问和证据定位口径 |
| P06 | 合规脱敏清单 | `submission/data-compliance-checklist.md` | 提交前人工核查敏感信息、授权和演示数据边界 |
| R04 | 哈希清单 | `submission/submission-manifest.json` | 系统生成，用于证明导出文件版本 |

## 建议准备顺序

1. 新建 `office-track-writing` 模板项目。
2. 在“收件”导入项目内真实 Office/文本材料；在“处理”运行本地配方或导入会议逐字稿。
3. 在“审阅”展示一次检索命中分解、证据支持/冲突/缺失和建议采纳过程。
4. 在“审批”记录人工批准事件；不要把本地 published 状态描述为外部平台已经收到文件。
5. 在“度量”补真实基线、AI、复核、重试、配置、维护、样本和质量记录。
6. 在“交付”运行证据审核，处理不可读材料、敏感信息提醒和数据缺口，勾选人工确认后导出 `submission/`。
7. 按本目录文档录制视频、补真实数据、撰写评委说明；提交前重新导出并保留最新 manifest。

## 本目录文件

- `demo_storyboard_3min.md`：3 分钟演示视频分镜与录制检查。
- `effect_measurement_protocol.md`：真实效果测量协议。
- `reuse_deployment_sop.md`：部署、复用和培训 SOP。
- `reviewer_guide_writing.md`：评委说明写作指南。
- `finals_defense_roadmap.md`：决赛答辩与落地路线图。
- `submission_checklist.md`：提交前逐项核对表。
- `submission_90plus/`：90+ 目标提交包，含 M01—M06、评分证据矩阵、答辩问答、合规清单和真实试点数据表模板。

## 录制演示资产

在 `app/` 目录完成构建后，可以运行：

```bash
npm run build
npm run competition:demo
npm run competition:pdf
npm run competition:manifest
```

演示脚本会启动隔离服务，创建 `office-track-writing` 项目，复制仓库内 DOCX 示例，录制浏览器操作，并在 `docs/competition/submission_90plus/evidence/demo/` 输出原始 WebM、H.264 MP4 上传版、截图、时间戳和脱敏状态样例；PDF 脚本会把 M01-M06、评委说明和初决赛准备材料合成为 A4 合订本；manifest 脚本为完整静态提交包生成 SHA-256 清单并核对必需文件。录屏使用受控演示数据，只证明产品链路跑通，不作为真实业务提效证明。
