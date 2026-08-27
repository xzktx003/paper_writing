# OpenPrism Office 交付架构

日期：2026-08-27

## 决策

办公材料交付是正式 `/projects` React 工作台的一等能力，不复活 Legacy 静态原型。现有编辑、AI、Skills、RAG、Diff、人审、Pipeline 和编译能力继续承担文案生产；新增“交付”面板只负责把任务边界、材料、证据、效果、复用和参赛交付组织成可审核状态。

## 数据流

```text
React OfficeDeliveryPanel
  ├─ GET /api/projects/:id/office-track
  ├─ PUT /api/projects/:id/office-track
  ├─ POST /api/projects/:id/office-track/audit
  └─ POST /api/projects/:id/office-track/export
                │
                ▼
Fastify officeTrack route
  ├─ managed project identity + global authentication hooks
  ├─ field / enum / length / number / relative-path validation
  └─ officeTrackService
       ├─ .openprism/office-track.json
       ├─ deterministic evidence/readiness audit
       └─ submission/* + SHA-256 manifest
```

## 信任边界

- 浏览器只传稳定 `projectId`；后端通过项目服务解析真实根目录，前端不能指定绝对路径。
- `.openprism/office-track.json` 是项目内运行状态；`submission/` 是用户可见交付件。状态不保存模型凭据、服务器 Token 或主机绝对路径。
- 来源材料、证据和复用资产不能登记为导出器将覆盖的固定 `submission/*` 文件；来源与生成物保持单向关系，避免自证循环和静默覆盖。
- 路径必须为项目相对路径并经过 `safeJoin`；未知字段、非法枚举、非有限数和越界路径直接拒绝。
- 审核是确定性准备检查，不调用模型、不自动写正文、不作取消资格、晋级或获奖裁决。
- 每个效果结论必须保留基线、AI 时间、人工复核、重试、配置、维护、样本和测量状态。缺项时只显示缺口。
- 导出前需要前端明确的人工作责确认；后端输出哈希清单供复核。真实录屏、真实用户反馈和真实效果证明仍由参赛团队采集。
- 重复导出在状态和来源未变化时生成同一组内容哈希；所有文本和 manifest 均使用同目录临时文件后原子替换。

## 与现有能力的关系

| 既有能力 | 办公用途 |
| --- | --- |
| managed projects / project tree | 隔离每份办公任务、来源和交付件 |
| Chat / Agent / Tools | 解释、建议和复杂改稿 |
| Diff Accept/Reject | 人工采纳门禁 |
| Skills | 沉淀岗位任务和文案方法 |
| local keyword RAG / citations | 来源检索、定位与引用核验 |
| Review / Pipeline | 质量审查和可重复审批流程 |
| Markdown / LaTeX / PDF | 长文案源码与正式交付 |

## 不做的承诺

- 不宣称内置语义向量检索；当前本地检索为可解释的关键词重叠。
- 不宣称已经实现 DOCX/PPTX/XLSX 原生编辑。
- 不用样例数据生成“真实提效”或“真实落地”结论。
- 不把建议分描述为官方评分。
