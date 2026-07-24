# Paper Writer UX Contract

本文档记录 Paper Writer 的 RAG、Skill、Chat / Agent / Tools 前端体验契约。它面向前端实现者，目标是让用户在写论文时不需要理解内部 skill 名称，也能知道证据库是否可靠、该选哪个模式、下一步该做什么。

Legacy / Prototype 参考实现：

- `app/apps/frontend/public/paper-writer-workbench.html`
- React `/projects` 是唯一正式产品入口；正式 UI 不得链接该原型。
- 原型默认关闭。只有设置 `OPENPRISM_ENABLE_LEGACY_WORKBENCH=true` 并重启后端后，才可通过 `/writing-workbench` 或 `/paper-writer-workbench.html` 临时访问。
- 这是一个迁移期、无构建依赖的静态参考页面，直接调用 `/api/projects/:id/writing-workbench/context` 展示任务路由、Skill 推荐、RAG 摘要、证据片段和最近文档；它不再承担正式产品规范。
- 独有功能所有权、迁移验收清单和弃用阶段见 [`legacy_workbench_lifecycle.md`](legacy_workbench_lifecycle.md)。
- 从后端同源打开时，“后端地址”输入框可以留空；如果是直接打开 HTML 文件，需要填写后端 URL。
- 如果后端启用了 `OPENPRISM_API_TOKEN`，在页面“API Token”输入框填写 token。页面会把 token 保存在当前浏览器 localStorage，并对所有 API 请求追加 `Authorization: Bearer <token>`。
- 页面提供“加载项目”按钮，调用 `GET /api/projects` 并只展示未归档、未回收站的开放项目。选择项目后自动填入项目 ID。
- 页面提供“演示数据”按钮；没有现成项目时也可以预览任务路由、Skill hover/focus 详情、RAG 摘要和证据抽屉形态。
- 页面提供轻量 Evidence Library 操作：上传文献、重建索引、检索证据库。对应接口是 `/rag/upload`、`/rag/index` 和 `/rag/search`。静态原型支持一次选择或拖拽多篇 PDF、BibTeX 和文献笔记，并逐个调用现有上传接口，最后汇总解析结果。
- 上传接口返回 `uploadReview`，前端必须逐文件展示上传后诊断，而不是只汇总“成功/失败”。诊断至少包括 `status`、`label_zh`、`message_zh`、`parseStatus`、`parser`、`chunks`、`extractedTextChars`、`contentQuality`、`blocksCitationWriting`、`recovery`、`actions`、`successCriteria_zh` 和 `copyText`。
- `uploadReview.blocksCitationWriting: true` 表示这次上传虽然保存了文件，但还不能支撑论文引用写作。前端应明确显示“暂不能引用”，并提示替换 PDF、补充 Markdown 文献笔记或重建索引。
- `uploadReview.recovery` 是面向用户的恢复诊断，不是 parser 调试日志。它包含 `code`、`label_zh`、`why_zh`、`instruction_zh`、`preferredAction`、`successCriteria_zh`、`blocksCitationWriting` 和可选的 `noteTemplate`，用于把扫描版/OCR、加密 PDF、损坏 PDF、暂未配置抽取器、缺少抽取 sidecar、需要重建索引等情况转成用户能执行的下一步。正式前端应显示中文原因和建议动作，不能只显示 `parseStatus`。
- `uploadReview.recovery.noteTemplate` 是可复制的 Markdown 文献笔记模板。当前 PDF 需要 OCR、人工摘录或补可检索文本时，前端应提供“复制文献笔记模板”按钮；模板只能作为用户手动填写的结构，不得自动生成文献事实或自动写入论文正文。
- 多文件上传完成后，文件选择摘要区域应变成逐文件上传诊断卡片：可用文件显示“可检索”，不可用文件显示“暂不能引用/解析失败”，每张卡片提供复制上传诊断按钮。
- 上传诊断、RAG 修复向导和文档引用可用性里的修复动作必须可点击。`upload-extracted-notes` / `replace-document` / `upload-evidence` 只能聚焦上传控件并提示用户选择 Markdown 文献笔记、可复制文本 PDF 或 BibTeX；`rebuild-index` 可调用重建索引接口；`review-rag-documents` 只能滚动到文档状态列表。任何 RAG 修复动作都不能自动生成论文正文或发送模型请求。
- 页面提供证据操作：复制全部证据、复制单条来源、复制单条片段、复制文档路径，以及确认后删除证据文档。
- 页面提供“生产可用性”面板，会优先展示后端 `agentReadiness`，明确告诉用户当前任务是否达到正式论文写作可用标准，以及哪些阻塞项必须先处理。
- 页面提供“操作队列”面板，会展示后端 `actionQueue`，把流程当前步骤、模式主操作、阻塞项、澄清问题、RAG 修复、检索改写、Skill 决策和证据包动作合并成 3-8 个按优先级排序的下一步动作。
- 页面仍可展示 `workflowHints` 作为底层救场提示，但正式前端应把 `actionQueue` 放在它前面，避免用户在多个面板之间自己判断优先级。
- 页面在推荐 Skill 详情中展示任务模板，可一键填入任务输入框或复制，帮助用户不知道如何描述任务时直接启动。
- 页面提供“写作提示词”面板，会把用户任务、推荐模式、推荐 Skill、Skill 输入/输出要求、RAG 证据、缺失上下文和下一步动作组合成可复制 prompt。
- 页面提供“创建会话并发送”按钮。用户显式点击后，页面会先创建 conversation，再把生成提示词发送到 `/api/ai/send`，并在页面中展示 AI 返回。

## 1. 任务工作台

接口：

```http
POST /api/projects/:id/writing-workbench/context
POST /api/projects/:id/writing-workbench/review-answer
```

请求示例：

```json
{
  "task": "帮我根据这些 PDF 写 related work 和 research gap",
  "evidenceQuery": "retrieval augmented generation writing limitation research gap",
  "contextAnswers": {
    "target_section_or_file": "chapters/related_work.tex",
    "paper_claims": "本文强调可审查的 RAG 证据写作流程。"
  },
  "skillLimit": 5,
  "evidenceLimit": 3
}
```

核心响应字段：

```json
{
  "task": "帮我根据这些 PDF 写 related work 和 research gap",
  "taskRouting": {
    "mode": "agent",
    "modeLabel_zh": "Agent 建议修改",
    "confidence": "high",
    "risk_level": "medium",
    "requiresConfirmation": true,
    "reasons": ["任务会影响论文正文，建议用 Agent 模式读取上下文并提交可确认的修改建议。"],
    "missingContext": ["target_section_or_file"],
    "missingContextDetails": [
      {
        "key": "target_section_or_file",
        "label_zh": "目标章节或文件",
        "help_zh": "例如 introduction、related work、discussion，或当前选中的稿件文件。"
      }
    ],
    "nextActions": [
      { "type": "select-file", "label_zh": "选择要写作或修改的章节" },
      { "type": "activate-skill", "label_zh": "启用推荐技能：文献综述", "skill": "literature-review" }
    ]
  },
  "interactionPlan": {
    "mode": "agent",
    "modeLabel_zh": "Agent 建议修改",
    "primarySkill": {
      "name": "literature-review",
      "display_name_zh": "文献综述",
      "subtitle_en": "Literature Review"
    },
    "primaryCta_zh": "用 文献综述 生成建议",
    "requiresExplicitUserAction": true,
    "requiresConfirmation": true,
    "confirmationRequiredBefore": [
      "写入或覆盖任何论文正文文件",
      "采纳 AI 生成的引用性事实陈述",
      "把草稿合并到正式章节"
    ],
    "blockedReasons": [
      {
        "code": "missing-context",
        "label_zh": "缺少关键上下文",
        "detail_zh": "还需要补充 1 项关键上下文，补齐后再让 Agent 修改正文更可靠。"
      }
    ],
    "visibleWarnings": [
      "Agent 模式应先给结构建议、草稿或 diff，不应直接覆盖文件。"
    ],
    "steps": [
      {
        "id": "review-before-apply",
        "label_zh": "用户确认后再应用",
        "detail_zh": "展示草稿、修改建议或 diff；用户确认前不写入正文文件。",
        "status": "requires-confirmation"
      }
    ],
    "outputPreview": {
      "title_zh": "预期输出",
      "items": ["章节结构建议", "可复制草稿或 diff", "来源编号和引用安全说明"]
    },
    "forbiddenActions": [
      "不得自动覆盖论文正文文件。",
      "不得编造引用、作者、年份、DOI 或会议名称。"
    ]
  },
  "modeDecisionGuide": {
    "status": "needs-confirmation",
    "label_zh": "模式需要确认",
    "summary_zh": "当前推荐“Agent 建议修改”，因为它是这个任务的最小风险执行方式。",
    "selected": {
      "mode": "agent",
      "label_zh": "Agent 建议修改",
      "subtitle_en": "Agent",
      "risk_level": "medium",
      "why_zh": ["任务会影响论文正文，建议用 Agent 模式读取上下文并提交可确认的修改建议。"],
      "switch_if_zh": "如果你要 AI 产出正文草稿、润色版本、结构改写或 diff，切换到 Agent。",
      "boundary_zh": "先给计划、草稿或 diff；用户确认前不写入或覆盖论文正文。"
    },
    "alternatives": [
      {
        "mode": "chat",
        "label_zh": "对话",
        "subtitle_en": "Chat",
        "why_zh": ["没有选择 Chat，因为当前任务不只是解释或建议，还可能影响正文或执行工具。"],
        "switch_if_zh": "如果你只是想问“这段怎么理解/怎么组织/有哪些风险”，切换到 Chat。",
        "boundary_zh": "只回答和澄清，不自动改文件、不执行命令。"
      }
    ],
    "switchHints": [
      {
        "targetMode": "tools",
        "label_zh": "我要执行命令或处理文件",
        "prompt_zh": "请先列出工具执行计划、命令、输入输出和风险，等我确认后再执行。"
      }
    ],
    "safetyBoundaries": [
      {
        "mode": "agent",
        "label_zh": "Agent 边界",
        "rule_zh": "可以生成计划、草稿、修改建议或 diff；用户确认前不覆盖正文。"
      }
    ],
    "copyText": "# Chat / Agent / Tools 模式决策\n..."
  },
  "paperWorkflowGuide": {
    "status": "blocked",
    "label_zh": "先处理阻塞步骤",
    "summary_zh": "4/7 步已就绪。当前先处理“确认写作上下文”，不要直接生成可采纳正文。",
    "currentStep": {
      "id": "confirm-context",
      "order": 3,
      "title_zh": "确认写作上下文",
      "status": "needs-action",
      "action": { "type": "select-file", "label_zh": "选择章节或稿件文件" }
    },
    "steps": [
      {
        "id": "prepare-evidence",
        "order": 2,
        "title_zh": "准备 RAG 证据",
        "subtitle_en": "Evidence",
        "status": "ready",
        "blocking": false,
        "message_zh": "已有 2 条可审查证据片段。",
        "evidence_zh": "2 个文档，8 个索引片段，2 条当前命中。",
        "action": { "type": "copy-evidence", "label_zh": "查看证据包" },
        "successCriteria_zh": "证据包里至少有一条可编号引用的片段。"
      }
    ],
    "copyText": "# 论文写作流程向导\n..."
  },
  "workflowHints": [
    {
      "priority": "high",
      "area": "rag",
      "code": "upload-first-evidence",
      "title_zh": "先上传可引用资料",
      "message_zh": "证据库为空时，不适合直接让 AI 写 related work 或引用结论。",
      "action": { "type": "upload-evidence", "label_zh": "上传 PDF、BibTeX 或文献笔记" }
    }
  ],
  "actionQueue": {
    "status": "blocked",
    "label_zh": "先处理 2 个阻塞动作",
    "summary_zh": "先完成阻塞项，再生成可审查草稿。",
    "actions": [
      {
        "source": "paperWorkflowGuide.currentStep",
        "priority": 10,
        "type": "select-file",
        "label_zh": "选择章节或稿件文件",
        "status": "needs-action",
        "reason_zh": "确认目标章节、论文主张和必要材料是否足够。",
        "blocking": true,
        "requiresExplicitUserAction": true,
        "action": { "type": "select-file", "label_zh": "选择章节或稿件文件" }
      }
    ],
    "copyText": "# 下一步操作队列\n..."
  },
  "agentReadiness": {
    "status": "blocked",
    "label_zh": "当前任务未达生产可用",
    "score": 78,
    "summary_zh": "还有 1 个阻塞项，处理前不建议让 Agent 生成可采纳正文。",
    "dimensions": [
      {
        "id": "context",
        "label_zh": "上下文是否足够",
        "status": "blocked",
        "score": 35,
        "blocking": true,
        "detail_zh": "还需要补充目标章节或文件。",
        "evidence_zh": "需要补上下文",
        "action": { "type": "select-file", "label_zh": "选择目标章节或文件" }
      }
    ],
    "blockers": [
      {
        "id": "context",
        "label_zh": "上下文是否足够",
        "detail_zh": "还需要补充目标章节或文件。",
        "action": { "type": "select-file", "label_zh": "选择目标章节或文件" }
      }
    ],
    "acceptanceGate": {
      "canDraft": false,
      "canUseForCitableText": false,
      "requiresHumanReview": true,
      "mustReviewWith": ["证据写作包", "引用安全策略", "验收清单", "AI 输出审查", "单句证据检查"]
    },
    "copyText": "# Paper Agent 生产可用性\n..."
  },
  "taskStarters": [
    {
      "id": "literature-review-gap",
      "title_zh": "写 Related Work / Research Gap",
      "subtitle_en": "Literature Review",
      "category_zh": "文献",
      "tags": ["PDF 证据", "引用安全", "研究空白"],
      "mode": "agent",
      "skill": "literature-review",
      "prompt": "帮我基于证据库里的论文写 related work，并按主题总结代表工作、局限和 research gap。请只使用命中的证据片段，不要编造引用。",
      "help_zh": "适合已经上传 PDF、BibTeX 或文献笔记后，开始写相关工作。",
      "requires_context": ["rag_documents_or_references", "target_section_or_file"],
      "disabled": false,
      "disabledReason_zh": "",
      "readiness_zh": "可以开始，发送前仍会检查上下文和引用安全。",
      "contextPrefill": {
        "target_section_or_file": "chapters/related_work.tex",
        "paper_claims": "补充：论文主题、目标会议/领域、希望强调的 research gap。",
        "requiredKeys": ["rag_documents_or_references", "target_section_or_file"]
      },
      "nextStep_zh": "填入任务后，优先确认：文献证据或 references.bib、目标章节或文件。",
      "startGuide": {
        "status": "needs-context",
        "label_zh": "先补上下文",
        "why_zh": "你要写相关工作或研究空白时，先用文献综述 Skill 把证据按主题组织起来，比直接让模型写正文更安全。",
        "recommendedMode": "agent",
        "recommendedSkill": "literature-review",
        "missingContext": [
          { "key": "target_section_or_file", "label_zh": "目标章节或文件", "statusLabel_zh": "待补充" }
        ],
        "beforeSend": ["确认目标章节或文件，不要让 Agent 猜要改哪里。"],
        "expectedOutputs": ["主题分组的 related work 草稿", "每组代表证据编号", "research gap 和不可外推边界"],
        "safeStartPrompt": "帮我基于证据库里的论文写 related work...",
        "copyText": "# 论文任务启动说明\n..."
      },
      "primaryAction": { "type": "fill-task-template", "label_zh": "填入 related work 任务" }
    }
  ],
  "contextReadiness": {
    "status": "blocked",
    "label_zh": "需要补上下文",
    "score": 30,
    "message_zh": "还需要补充 1 项关键上下文，补齐后再让 Agent 修改正文更可靠。",
    "required": [
      {
        "key": "target_section_or_file",
        "label_zh": "目标章节或文件",
        "help_zh": "例如 introduction、related work、discussion，或当前选中的稿件文件。",
        "required": true,
        "status": "missing",
        "statusLabel_zh": "待补充",
        "action": { "type": "select-file", "label_zh": "选择章节或稿件文件" }
      }
    ],
    "recommended": []
  },
  "citationPolicy": {
    "status": "grounded",
    "label_zh": "可基于证据写作",
    "citationSensitive": true,
    "allowUnsupportedClaims": false,
    "evidenceCount": 2,
    "message_zh": "当前命中 2 条 RAG 证据。写作时可以引用这些片段，但必须标注来源编号。",
    "requiredBehaviors": [
      "使用证据时必须写出来源编号，例如 [1]、[2]。"
    ],
    "forbiddenBehaviors": [
      "不得编造论文标题、作者、年份、DOI、会议或引用编号。"
    ]
  },
  "evidencePack": {
    "status": "ready",
    "label_zh": "证据包可用",
    "query": "related work research gap",
    "evidenceCount": 2,
    "citationSensitive": true,
    "message_zh": "当前证据包包含 2 条可追溯片段。写作时必须按 [1]、[2] 标注来源。",
    "rules": [
      "只使用证据包中出现的来源编号。",
      "每个事实性文献陈述都应能追溯到对应片段。",
      "把证据直接支持的内容和基于证据的推测分开写。"
    ],
    "items": [
      {
        "id": "E1",
        "rank": 1,
        "sourceLabel": "research_corpus/retrieval-survey.pdf:L12-L18",
        "snippet": "Retrieval augmented generation improves grounded academic writing by exposing source snippets during drafting.",
        "quality": {
          "level": "high",
          "label_zh": "可直接用于局部引用",
          "score_100": 85,
          "directQuoteSafe": true,
          "claimTemplate_zh": "可写成“证据 [1] 显示：可用于 related work 的主题归纳或代表性观点。”",
          "warnings_zh": ["片段未明确给出作者/年份/venue/DOI，不能补写这些信息。"],
          "recommendedUse_zh": "可以用于草稿中的局部事实陈述，但采纳前仍需核对原文。",
          "mustNotUseFor_zh": ["不能推导作者、年份、会议或 DOI，除非片段中明确出现。"]
        },
        "supports_zh": ["可用于 related work 的主题归纳或代表性观点。"],
        "useFor": ["related work 中的事实性陈述"],
        "notFor": ["不能推导作者、年份、会议或 DOI，除非片段中明确出现。"],
        "citationInstruction_zh": "使用该片段时标注 [1]，并保留来源路径以便审查。"
      }
    ],
    "copyText": "# 证据包使用规则\n...",
    "fallbackActions": []
  },
  "acceptanceChecklist": {
    "status": "strict",
    "label_zh": "严格验收",
    "items": [
      {
        "id": "sources-numbered",
        "label_zh": "事实陈述带来源编号",
        "detail_zh": "使用 2 条 RAG 证据时，相关事实必须标注 [1]、[2] 等来源编号。",
        "severity": "required",
        "blocking": true
      }
    ]
  },
  "writingPrompt": {
    "format": "markdown",
    "text": "# 论文写作任务\n帮我根据这些 PDF 写 related work 和 research gap\n\n# 引用安全规则\n...",
    "sections": [
      { "title_zh": "论文写作任务", "body": "帮我根据这些 PDF 写 related work 和 research gap" }
    ]
  },
  "aiDraftRequest": {
    "requiresExplicitUserAction": true,
    "mode": "agent",
    "active_skills": ["literature-review"],
    "conversation": {
      "name": "Workbench · 帮我根据这些 PDF 写 related work",
      "context_scope": { "type": "free" },
      "active_skills": ["literature-review"],
      "mode": "agent"
    },
    "send": {
      "projectId": "demo",
      "projectPath": "__paper_agent__:demo",
      "userMessage": "# 论文写作任务\n...",
      "projectConfig": { "global_skills": [], "chapters": [], "rag": { "enabled": true, "limit": 5 } },
      "rag": { "enabled": true, "query": "帮我根据这些 PDF 写 related work 和 research gap", "limit": 5 }
    },
    "warnings": ["必须由用户点击后才创建会话和发送给 AI。"]
  },
  "workbenchBundle": {
    "version": 1,
    "label_zh": "论文写作工作包",
    "status": "needs-context",
    "task": "帮我根据这些 PDF 写 related work 和 research gap",
    "mode": "agent",
    "modeLabel_zh": "Agent 建议修改",
    "primarySkill": { "name": "literature-review", "title_zh": "文献综述", "subtitle_en": "Literature Review" },
    "counts": { "evidence": 2, "blockingChecklistItems": 2, "clarificationQuestions": 1, "repairSteps": 0 },
    "sections": [
      { "id": "context-brief", "title_zh": "上下文摘要", "status": "needs-confirmation", "hasText": true },
      { "id": "skill-decision", "title_zh": "Skill 决策", "status": "needs-context", "hasText": true },
      { "id": "evidence-pack", "title_zh": "证据写作包", "status": "ready", "hasText": true },
      { "id": "draft-plan", "title_zh": "写作计划", "status": "needs-review", "hasText": true },
      { "id": "ai-prompt", "title_zh": "发送给 AI 的提示词", "status": "ready", "hasText": true }
    ],
    "copyText": "# 论文写作工作包\n..."
  },
  "uiModel": {
    "version": 1,
    "locale": "zh-CN",
    "primaryAction": {
      "type": "select-file",
      "label_zh": "选择章节或稿件文件",
      "requiresExplicitUserAction": true,
      "blockedBy": "target_section_or_file"
    },
    "taskStarters": {
      "title_zh": "论文任务入口",
      "subtitle_en": "Task Starters",
      "source": "taskStarters",
      "display": {
        "titleField": "title_zh",
        "subtitleField": "subtitle_en",
        "tagField": "tags",
        "disabledReasonField": "disabledReason_zh"
      }
    },
    "modeSwitcher": {
      "selected": "agent",
      "source": "taskRouting.mode"
    },
    "skillPicker": {
      "title_zh": "推荐 Skill",
      "subtitle_en": "Skill Picker",
      "source": "skills.recommendations",
      "selectedSkill": "literature-review",
      "display": {
        "titleField": "skill.display_name_zh",
        "subtitleField": "skill.subtitle_en",
        "showChineseTitleFirst": true
      }
    },
    "evidenceDrawer": {
      "title_zh": "RAG 证据抽屉",
      "subtitle_en": "Evidence Drawer",
      "source": "rag.evidence.results",
      "count": 2,
      "status": "healthy",
      "statusLabel_zh": "证据可用",
      "tone": "success"
    },
    "panels": [
      {
        "id": "task-routing",
        "title_zh": "任务路由",
        "source": "taskRouting",
        "statusLabel_zh": "Agent 建议修改",
        "tone": "warning",
        "priority": 10,
        "summary_zh": "任务会影响论文正文，建议用 Agent 模式。"
      }
    ]
  },
  "skills": {
    "categories": [],
    "recommendations": [],
    "navigator": {
      "title_zh": "Skill 导航",
      "subtitle_en": "Skill Navigator",
      "summary_zh": "按论文任务、标签、风险和所需材料理解 Skill，不需要先记英文 Skill 名。",
      "selectedSkill": "literature-review",
      "categories": [
        {
          "name": "文献",
          "count": 2,
          "recommendedCount": 1,
          "skills": []
        }
      ],
      "tagChips": [
        { "name": "Related Work", "count": 1, "skills": ["literature-review"] }
      ],
      "contextFilters": [
        {
          "key": "rag_documents_or_references",
          "label_zh": "文献证据或 references.bib",
          "help_zh": "需要 PDF、BibTeX、Markdown 文献笔记或已索引 RAG 证据。",
          "count": 1,
          "skills": ["literature-review"]
        }
      ],
      "riskFilters": [
        { "level": "medium", "label_zh": "中风险", "count": 3, "skills": [] }
      ],
      "cards": [
        {
          "name": "literature-review",
          "title_zh": "文献综述",
          "subtitle_en": "Literature Review",
          "category_zh": "文献",
          "tags": ["Related Work", "Survey", "Research Gap"],
          "inputs": ["研究主题", "文献 PDF 或 RAG 证据库"],
          "outputs": ["主题分类", "related work 草稿"],
          "best_for": ["相关工作"],
          "not_for": ["单段润色"],
          "requires_context": [
            {
              "key": "rag_documents_or_references",
              "label_zh": "文献证据或 references.bib",
              "help_zh": "需要 PDF、BibTeX、Markdown 文献笔记或已索引 RAG 证据。"
            }
          ],
          "recommended": true
        }
      ],
      "display": {
        "showChineseTitleFirst": true
      }
    }
  },
  "rag": {
    "ready": true,
    "health": {
      "status": "needs-attention",
      "label_zh": "需要处理",
      "score": 72,
      "message_zh": "证据库可部分使用，但建议先处理解析失败、仅 metadata 或检索无命中的问题。",
      "issues": [
        { "severity": "medium", "code": "metadata-only", "message_zh": "1 个文档只有文件信息，没有正文片段。" }
      ]
    },
    "summary": {},
    "recentDocuments": [],
    "evidence": {},
    "uiHints": [],
    "repairGuide": {
      "status": "needs-repair",
      "label_zh": "需要修复",
      "message_zh": "发现 1 个高优先级证据库问题。先修复这些问题，再生成需要引用支撑的正文。",
      "items": [
        {
          "id": "fix-pdf-parse-failures",
          "severity": "high",
          "title_zh": "有 PDF 没有抽取到正文",
          "message_zh": "这些文档不会进入可靠 RAG 证据。优先换用可复制文本的 PDF，或把关键段落整理成 Markdown 文献笔记后上传。",
          "affectedDocuments": [
            {
              "path": "research_corpus/scanned.pdf",
              "parseStatus": "failed",
              "chunks": 0,
              "extractedTextChars": 0,
              "extractionError": "PDF parser returned no extractable text"
            }
          ],
          "action": { "type": "review-rag-documents", "label_zh": "查看解析失败文档" },
          "successCriteria_zh": "修复后文档状态应变为 parsed/indexed，extractedTextChars 和 chunks 应大于 0。"
        }
      ],
      "repairPlan": {
        "status": "needs-repair",
        "label_zh": "先修复阻塞项",
        "summary_zh": "需要先完成 1 个阻塞修复步骤，再生成需要引用支撑的正文。",
        "steps": [
          {
            "id": "fix-pdf-parse-failures",
            "order": 1,
            "priority": "blocker",
            "title_zh": "有 PDF 没有抽取到正文",
            "action": { "type": "review-rag-documents", "label_zh": "查看解析失败文档" },
            "instruction_zh": "优先替换扫描版或加密 PDF；如果暂时无法替换，把论文标题、贡献、关键方法和相关段落整理成 Markdown 文献笔记后上传。",
            "affectedDocumentCount": 1,
            "blocksCitationWriting": true,
            "successCriteria_zh": "修复后文档状态应变为 parsed/indexed，extractedTextChars 和 chunks 应大于 0。"
          }
        ]
      },
      "copyText": "# 证据库修复计划\n先修复阻塞项..."
    }
  }
}
```

前端行为：

- 输入框右侧或上方显示 `taskRouting.modeLabel_zh`，并用 `taskRouting.reasons` 解释为什么选这个模式。
- `requiresConfirmation: true` 时，所有正文修改、工具执行和文件写入都必须先展示确认态或 diff。
- `missingContext` 不为空时，不要只禁用按钮；要把 `nextActions` 渲染成可点击步骤，例如“选择章节”“上传证据”。
- `missingContext` 保留机器可读 key；用户可见区域必须优先使用 `missingContextDetails[].label_zh` 和 `help_zh`，不要直接展示 `target_section_or_file` 这类内部字段。
- `interactionPlan` 是 Chat / Agent / Tools 的执行预案。正式前端不应只显示 `taskRouting.mode` 一个标签，而应展示 `steps`、`confirmationRequiredBefore`、`blockedReasons`、`visibleWarnings`、`forbiddenActions` 和 `outputPreview`。
- `interactionPlan.requiresExplicitUserAction` 始终表示不能在任务分析后自动发送、自动写文件或自动执行工具。用户必须点击主按钮后才能创建会话或发送给 AI。
- `interactionPlan.confirmationRequiredBefore` 是硬门槛。Agent 模式在写入正文、采纳引用性事实、合并草稿前必须确认；Tools 模式在运行脚本、编译 LaTeX、写入/删除/覆盖/移动文件前必须确认。
- `interactionPlan.blockedReasons` 不为空时，前端应把主操作降级为补资料、重新检索或查看预案，不应把按钮文案设计成“直接生成可采纳正文”。
- `modeDecisionGuide` 是给用户看的模式解释层。`taskRouting` 只告诉前端“选了哪个模式”，`interactionPlan` 告诉前端“接下来怎么执行”，`modeDecisionGuide` 必须解释“为什么选它、为什么不是另外两个模式、什么时候切换、每个模式的安全边界是什么”。
- `modeDecisionGuide.selected` 是当前推荐模式，正式前端应展示 `label_zh`、`subtitle_en`、`why_zh`、`boundary_zh` 和风险等级；`alternatives[]` 应用于“为什么不是 Chat / Agent / Tools”的展开说明，而不是隐藏在调试信息里。
- `modeDecisionGuide.switchHints[]` 可渲染为可复制提示或快捷按钮。点击后只能填入输入框或更新模式选择，不能自动发送、自动执行工具或自动写文件。
- `modeDecisionGuide.safetyBoundaries[]` 是三种模式的硬边界摘要：Chat 不改文件不执行命令；Agent 先给计划/草稿/diff，确认前不覆盖正文；Tools 先展示命令和风险，确认前不运行命令或改文件。
- `modeActionCenter` 是 Chat / Agent / Tools 的可执行操作中心。正式前端应用它渲染主按钮、按钮是否可点击、阻塞项、模式切换卡、发送前检查、确认门槛和禁止动作，而不是在前端重新推导这些规则。
- `modeActionCenter.primaryAction.enabled: false` 时，主按钮必须降级为补资料、修复证据或查看阻塞项，不能显示成“直接生成正文”或“执行工具”。`primaryAction.requiresExplicitUserAction` 始终意味着用户点击后才允许创建会话、发送模型请求或进入工具计划。
- `modeActionCenter.modeOptions[].switchAction` 只能用于预览或填入模式提示，不能自动发送、运行命令或改文件。
- `paperWorkflowGuide` 是面向新用户的总流程向导，优先于零散面板展示。它把“描述任务、准备 RAG 证据、确认上下文、选择 Skill、审查写作计划、生成可审查草稿、审查 AI 输出”串成有顺序的步骤。
- `paperWorkflowGuide.currentStep` 是用户当前最应该处理的步骤。`status: blocked` 或步骤 `blocking: true` 时，前端主视觉应停在该步骤，不应把“创建会话并发送”设计成唯一主操作。
- `paperWorkflowGuide.steps[].action` 只表示建议按钮或快捷入口。除非用户显式点击并确认，前端不得因为流程步骤存在就自动上传、自动发送、自动执行工具或自动写文件。
- `paperWorkflowGuide.copyText` 可用于“复制论文写作流程”，帮助用户把当前工作台状态带到新会话、协作者或代码 Agent。
- `aiDraftRequest.interactionPlan` 是发送请求模板上的简版执行门槛，正式前端在真正调用 `/api/ai/send` 前也应检查它，避免只依赖视觉提示。
- `skills.recommendations` 第一项可作为默认推荐 Skill，但用户必须能展开查看其他候选。
- `skills.navigator` 是 Skill 可发现性模型。正式前端应优先用它渲染中文分类 chips、标签 chips、风险筛选、上下文需求筛选和 Skill 卡片；不要要求用户先知道英文 Skill id。
- `skills.navigator.cards[].title_zh` 是卡片主标题，`subtitle_en` 只作为副标题。卡片 hover/focus 详情应展示 `inputs`、`outputs`、`best_for`、`not_for`、`requires_context` 和 `task_templates`。
- `skills.navigator.cards[].hoverGuide` 是 Skill 卡片悬停/键盘 focus 的用户决策摘要，包含 `summary_zh`、`before_start_zh`、`expected_output_zh`、`risk_boundary_zh` 和 `first_prompt_zh`。正式前端应优先展示这层摘要，再展示完整输入/输出列表，避免用户只看到字段清单却不知道是否该点。
- `skills.navigator.contextFilters` 用于解释“为什么这个 Skill 现在不能直接用”，例如需要文献证据、references.bib、实验结果或投稿规则。前端应展示 `label_zh` 和 `help_zh`，不要只显示机器 key。
- `skills.navigator.cards[].recommended` 和 `selectedSkill` 用于默认高亮推荐 Skill；用户仍应能按分类或标签浏览其它候选。
- `skills.compareGuide` 是 Skill 选择对比模型。正式前端应在推荐 Skill 列表附近展示它，把前 2-3 个候选按“什么时候选 / 不要选 / 取舍 / 输入 / 产出 / 风险 / 缺少材料”并排比较，避免用户只看分数或英文 id。
- `skills.compareGuide.cards[].first_prompt_zh` 应提供“填入任务框”和“复制首问”操作；`copyText` 应作为“复制 Skill 对比”的内容，便于把选择依据带到新会话或 Agent。
- `agentReadiness` 是当前任务的 Paper Agent 生产可用性门禁，正式前端应在工作台顶部展示，优先级高于流程、模式、Skill 和 RAG 细节。它不表示整个系统永远生产可用，而是判断“这一次论文任务是否可以进入正式草稿阶段”。
- `agentReadiness.status` 取值包括 `production-ready`、`needs-review`、`blocked` 和 `not-ready`。只有 `production-ready` 表示可以生成可审查草稿；`blocked` 或 `not-ready` 时，前端不得把主按钮文案设计成“直接生成可采纳正文”。
- `agentReadiness.dimensions[]` 是八个维度检查：任务明确性、证据可用性、上下文完整度、Skill 可发现性、模式安全边界、引用安全、输出审查闭环和下一步动作。每项包含 `score`、`blocking`、`detail_zh`、`evidence_zh` 和可选 `action`，前端应把 `blocking: true` 显示为必须先处理。
- `agentReadiness.acceptanceGate` 是正式采纳门槛。`canDraft: true` 只表示可以生成可审查草稿；`canUseForCitableText: true` 才表示当前任务有足够证据进入引用型正文写作。`requiresHumanReview` 固定为 true，前端不能把 AI 输出直接视为可合并论文正文。
- `agentReadiness.copyText` 是可复制评估报告，适合带到新会话、Agent 或协作者处排查为什么当前任务还不能正式写。
- 生产可用性面板应提供“重新评估生产可用性”按钮。该按钮只允许重新调用 `/writing-workbench/context` 并带上当前 `contextAnswers`，用于验证阻塞项是否解除；它不得创建会话、发送模型请求、运行工具或写入论文文件。
- `actionQueue` 是面向用户的统一下一步操作队列，正式前端应在 `agentReadiness` 和 `modeActionCenter` 之后、`workflowHints` 或旧“下一步动作”之前展示。它把 `paperWorkflowGuide.currentStep`、`modeActionCenter.primaryAction`、`modeActionCenter.blockers`、`clarificationQuestions`、`rag.repairGuide.repairPlan.steps`、`rag.queryRewriteGuide.topQueries`、`workflowHints`、`skills.decisionGuide.primary` 和 `evidencePack` 中的动作去重并排序，避免用户在多个面板里找“现在该做什么”。
- `actionQueue.actions[]` 每项包含 `source`、`priority`、`type`、`label_zh`、`status`、`reason_zh`、`blocking`、`requiresExplicitUserAction` 和原始 `action`。前端应优先展示阻塞项，再展示可改善项；`blocking: true` 时，不应把主流程设计成直接发送或直接写正文。
- `actionQueue.actions[].action` 只能触发显式、可见、可撤回的 UI 行为，例如填入任务框、复制文本、切换面板、填入 RAG 检索词或打开上传入口。它不能因为用户只是打开页面或点击分析任务而自动发送模型请求、自动运行工具、自动写入/删除/覆盖文件。
- `actionQueue.copyText` 是可复制的 Markdown 操作清单。正式前端应提供复制入口，便于用户把当前阻塞项和下一步动作带到新会话、Agent 或协作者。
- `workflowHints` 是面向用户的底层“下一步动作”列表，前端可按 `priority` 展示，但在有 `actionQueue` 时应作为补充信息而不是第一优先级。它会覆盖空证据库、PDF 解析失败、仅 metadata 文档、证据检索无命中、缺目标章节、推荐 Skill 和可复制证据等状态。
- `workflowHints[].action.type` 是机器可读动作类型，当前包括 `focus-task`、`upload-evidence`、`review-rag-documents`、`upload-extracted-notes`、`refine-query`、`select-file`、`activate-skill`、`copy-evidence` 和 `review-rag-status`。前端可以先渲染成按钮或 chip；没有对应交互时也要显示 `message_zh`。
- `rag.repairGuide` 是面向用户的证据库修复向导，不是开发者日志。它会把空证据库、PDF 解析失败、metadata-only 文档、没有可检索正文、当前任务检索无命中转成可展示的修复卡片。前端应展示 `title_zh`、`message_zh`、`affectedDocuments`、`action.label_zh` 和 `successCriteria_zh`。
- `rag.repairGuide.repairPlan` 是修复项的执行顺序，包含 `steps[]`、`priority`、`instruction_zh`、`affectedDocumentCount`、`blocksCitationWriting` 和 `successCriteria_zh`。正式前端应把 `blocksCitationWriting: true` 的步骤显示为引用写作阻塞项；`copyText` 可提供“复制证据库修复计划”，方便用户把修复步骤带到下一轮操作或团队协作。
- `rag.repairGuide.status` 取值为 `clear`、`needs-repair`、`can-improve`。`needs-repair` 应使用阻塞/危险视觉；这表示用户不应直接生成需要引用支撑的正文。`can-improve` 可以继续写作，但应提示先优化证据质量。`clear` 表示没有明显 RAG 阻塞问题。
- `rag.repairGuide.items[].affectedDocuments` 只包含文档路径、解析状态、chunks、抽取字符数和错误摘要，前端不要因此尝试读取或展示私密 PDF 原文；具体修复动作应通过上传替换文件、补充 Markdown 笔记或重建索引完成。
- `rag.repairGuide.items[].action`、`rag.repairGuide.repairPlan.steps[].action` 和 `rag.documentReadinessGuide.cards[].action` 应复用同一套 RAG 修复按钮规则：补充笔记/替换文档/上传证据只聚焦上传控件并显示说明，重建索引只调用索引接口，查看文档状态只滚动到文档列表。
- `rag.documentReadinessGuide` 是面向写作的文档引用可用性判断，基于文档元数据生成，不读取私密 PDF 原文。它会把文档标记为 `citable`、`usable-text`、`metadata-only` 或 `failed`，并提供 `label_zh`、`message_zh`、`action`、`blocksCitationWriting` 和 `successCriteria_zh`。正式前端应在文档列表里展示这层状态，而不是只显示 parseStatus/chunks。
- `rag.documentReadinessGuide.cards[].blocksCitationWriting: true` 表示该文档当前不能支撑引用型正文。前端应提示用户替换 PDF、补充 Markdown 文献笔记或重建索引；不要把 metadata-only 或 failed 文档当成可引用来源。
- `rag.documentReadinessGuide.cards[].contentQuality.status === "template-empty"` 表示 Markdown 文献笔记仍是空模板或几乎没有人工摘录内容。`"manual-note-incomplete"` 表示用户已经填写了一些内容，但缺少可核对的 `Fact`、`Evidence text` 或 `Page/section`。正式前端应把两者都显示为引用写作阻塞项；这类文档不会生成 RAG chunks，用户必须填写实际原文摘录、页码/章节和可引用事实后重新上传或重建索引。
- `taskStarters` 是比 Skill Picker 更靠前的“论文任务入口”。它面向不知道该选哪个 Skill 的用户，直接展示“写 Related Work / Research Gap”“搭建 Introduction 逻辑”“解释 Method / Algorithm”“分析 Results / Discussion”“压缩 Abstract”“整理引用和 BibTeX”“设计论文图表”“投稿前检查”等常见任务。前端应把 `prompt` 作为一键填入任务框的内容，而不是自动发送给 AI。
- `taskStarters[].contextPrefill` 是任务入口对应的上下文预填建议。正式前端点击入口时，可以把 `target_section_or_file` 写入目标章节输入框占位，把 `paper_claims` 写入补充上下文草稿，并根据 `requiredKeys` 提醒用户还要确认哪些材料。`nextStep_zh` 是用户点击入口后的下一步说明。
- `taskStarters[].startGuide` 是任务入口的启动说明包，正式前端应展示 `why_zh`、`missingContext`、`beforeSend` 和 `expectedOutputs`，并提供“复制启动说明”。它解决的是用户不知道为什么选这个入口、缺什么材料、会得到什么产出的问题；`safeStartPrompt` 可以填入任务框，但仍必须等待用户显式发送。
- `taskStarters[].disabled` 表示该入口当前不应直接开始，例如没有 PDF/BibTeX 时禁用 related work，没有 references.bib 时禁用引用整理。前端必须展示 `disabledReason_zh`，并把 `primaryAction` 渲染成上传证据或上传 BibTeX 等救场动作。
- `taskStarters[].skill` 是推荐 Skill 的机器名，用户可见区域仍优先展示 `title_zh`、`subtitle_en`、`category_zh` 和 `tags`，不要把英文 Skill id 当主标题。
- `contextReadiness` 是任务级上下文准备度。前端应展示 `label_zh`、`score`、`message_zh`，并把 `required` 与 `recommended` 分开展示。`required[].status !== "ready"` 时，Agent 写入正文、工具执行或引用生成应保持确认态，不要让用户误以为上下文已经齐全。
- `contextAnswers` 是用户对澄清问题的结构化回答。当前支持任意上下文 key，常用 key 包括 `target_section_or_file`、`paper_claims`、`method_notes`、`experiment_results`、`venue_rules` 和 `rag_documents_or_references`。后端会把非空答案计为已补齐上下文，并写入 `projectState.contextAnswers`、`projectState.answeredContextKeys`、`contextBrief.items[]` 和最终 `writingPrompt.text`。正式前端应把目标章节、论文贡献点、实验结果等答案放进 `contextAnswers`，不要只拼接到 `task` 文本里。
- `clarificationQuestions` 是面向用户的澄清问题列表，每项包含 `contextKey`、`priority`、`question_zh`、`placeholder_zh`、`help_zh` 和 `action`。正式前端应把它渲染成用户可回答的问题或可填入任务框的模板，而不是只展示 `missingContext` 的机器 key。
- `contextBrief` 是当前任务上下文摘要，包含 `status`、`label_zh`、`summary_zh`、`items[]`、`assumptions[]`、`openQuestions[]` 和 `copyText`。正式前端应提供复制入口，并把它作为发送给 AI 的工作摘要；当 `status` 为 `needs-confirmation` 时，不应让用户误以为目标章节、论文主张或证据范围已经完全确认。
- `draftPlan` 是生成正文前的写作计划，包含 `status`、`label_zh`、`planType`、`title_zh`、`summary_zh`、`sections[]`、`expectedOutput[]`、`warnings[]` 和 `copyText`。正式前端应在 Agent 写入正文或生成长草稿前展示该计划，让用户先审结构、证据使用和风险；`status: needs-review` 时不应直接把输出当作可采纳正文。
- `draftPlan.sections[].evidenceAssignments` 是段落级证据分配。每项包含 `rank`、`sourceLabel`、`use_zh` 和 `caution_zh`，用于告诉用户“这条证据适合放在哪个写作步骤、只能支持什么、不能扩展到什么”。正式前端应在对应计划步骤下展示这些分配；复制写作计划或发送给 AI 的工作包也应保留“证据分配”段落，避免模型把所有 RAG 片段混用。
- `citationPolicy` 是引用安全策略。前端应展示 `label_zh`、`message_zh`、`requiredBehaviors` 和 `forbiddenBehaviors`。当 `allowUnsupportedClaims: false` 时，发送给 AI 的提示词必须包含这些规则；当 `status` 为 `needs-evidence` 或 `no-evidence` 时，不应让用户误以为可以生成带真实引用的正文。
- `evidencePack` 是把 RAG 命中整理成“可复制、可审查、可限制使用”的写作材料包。它不新增检索结果，只包装 `rag.evidence.results`，并给出 `rules`、每条证据的 `quality`、`supports_zh`、`notFor`、`citationInstruction_zh` 和完整 `copyText`。
- `evidencePack.status` 取值为 `ready`、`missing-evidence`、`not-required`。`ready` 时可以展示“复制证据包”；`missing-evidence` 时应展示 `fallbackActions`，例如上传更多 PDF 或换关键词；`not-required` 表示当前任务不明显需要文献证据。
- `evidencePack.coverage` 是证据来源覆盖度诊断，包含 `status`、`label_zh`、`sourceCount`、`topSourceShare`、`sources[]`、`warnings[]` 和 `guidance_zh`。正式前端应在证据写作包附近展示它，提醒用户证据是否只来自单一论文或过于集中；完整 related work 不应只依赖单一来源覆盖。
- `evidencePack.expansionPlan` 是补证据计划，包含 `status`、`label_zh`、`reason_zh`、`suggestedQueries[]`、`missingSourceTypes[]` 和 `actions[]`。当前端展示证据不足、来源偏薄或覆盖过于集中时，应把 `suggestedQueries` 渲染成可复制或可一键填入 RAG 检索框的按钮，帮助用户继续补证据。
- `/writing-workbench/context` 支持可选 `evidenceQuery`。当用户点击推荐检索词并重新评估生产可用性时，前端应把当前 RAG 检索框内容作为 `evidenceQuery` 发送，让证据包、写作计划和生产可用性门禁基于新的检索词重新计算，而不是继续使用原始任务文本检索。
- `evidencePack.items[].quality` 是单条证据可用性判断，包含 `level`、`label_zh`、`score_100`、`directQuoteSafe`、`claimTemplate_zh`、`warnings_zh`、`recommendedUse_zh` 和 `mustNotUseFor_zh`。正式前端应把它展示在片段附近，提醒用户该片段是“可直接用于局部引用”“采纳前核对”还是“只能作为线索”。
- `evidencePack.items[].notFor` 必须展示或进入发送给 AI 的提示词。它防止模型把一个片段扩展成作者、年份、DOI、会议、实验结论等未被片段支持的内容。
- `rag.evidencePack` 与顶层 `evidencePack` 内容相同，方便只消费 `rag` 对象的前端读取。
- 普通 AI 接口 `/api/ai/send` 和 `/api/ai/stream` 在启用或自动触发 RAG 时，也会把通用 `ragUsageGuidance` 注入模型消息，并在响应字段里返回 `ragUsageGuidance`。这保证绕过工作台直接聊天时，模型仍会收到“只引用命中片段、不得推断作者/年份/DOI/venue、区分证据和推测”的约束。
- `acceptanceChecklist` 是输出验收清单。前端应显示每个 `items[]` 的 `label_zh`、`detail_zh` 和是否 `blocking`。`blocking: true` 的项目不通过时，不应建议用户直接采纳 AI 输出；复制或发送给 AI 的提示词也必须包含这份清单。
- `writingPrompt` 是后端生成的 Markdown 工作包，已经合并任务、推荐模式、推荐 Skill、RAG 证据、引用安全、上下文准备度、下一步动作和验收清单。正式前端应优先使用 `writingPrompt.text` 作为复制/发送给 AI 的提示词，只有旧后端没有该字段时才在前端 fallback 拼装。
- `writingPrompt.text` 已包含 `# 证据写作包` 章节，会把 `evidencePack.rules`、每条证据的 `supports_zh`、`notFor` 和 `citationInstruction_zh` 写入发送内容。正式前端不要只把原始 `rag.evidence.results` 发给 AI，否则会丢失“不能支持什么”的约束。
- `aiDraftRequest` 是创建会话和发送 AI 的建议请求模板。它必须只在用户显式点击后使用，不得由任务分析自动触发。正式前端可用 `aiDraftRequest.conversation` 调用 `POST /api/conversations/:projectId`，再把返回的 `conversation.id` 合并到 `aiDraftRequest.send` 后调用 `POST /api/ai/send`。
- `aiDraftRequest.send.userMessage` 与 `writingPrompt.text` 保持一致，也包含证据写作包。发送前如果前端允许用户编辑提示词，应保留该章节或明确提示移除后会降低引用安全。
- `aiDraftRequest.send.rag.query` 必须与当前正式证据包使用的 `evidenceQuery` / `evidencePack.query` 保持一致。正式前端如果允许用户在发送前修改 RAG 检索框，应先重新生成工作台上下文，或显式用当前检索框值覆盖发送请求中的 `rag.query`；不能让生成草稿和后续审查/采纳使用不同检索语义。
- `workbenchBundle` 是面向人类复现和交接的完整工作包，不等同于只发给 AI 的 `writingPrompt`。它会合并上下文摘要、Skill 决策、证据库修复计划、证据写作包、写作计划、验收清单和最终 AI 提示词，并提供 `copyText`。正式前端应提供“复制完整工作包”，方便用户把当前状态带到新会话、代码 Agent 或协作者。
- `uiModel` 是面向前端的渲染模型。正式前端应优先使用它决定面板顺序、状态徽标、主操作、Skill Picker 展示字段和 Evidence Drawer 动作，再从 `source` 指向的业务字段读取详情。这样前端不需要重复推导“什么时候阻塞、什么时候危险、哪个按钮是主动作”。
- `uiModel.primaryAction` 是当前页面最应该显示的主操作。它始终带 `requiresExplicitUserAction: true`，不能自动执行。若含 `blockedBy`，前端应把按钮展示为补上下文或救场动作，而不是直接发送给 AI。
- `uiModel.panels[].tone` 取值为 `neutral`、`success`、`warning`、`danger`。前端应把 `danger` 用于阻塞或高风险状态，例如缺证据、引用不安全、严格验收未满足；不要只用灰色信息提示弱化这些风险。
- `uiModel.skillPicker.display.showChineseTitleFirst: true` 表示 Skill 卡片必须中文主标题优先，英文只作为副标题；hover/focus 弹层应先展示 `skill.hoverGuide` 的快速判断，再按 `hoverFields` 展示输入、输出、适用、不适用和任务模板。
- `uiModel.evidenceDrawer` 统一描述证据抽屉的标题、状态、命中数量和可用动作；正式前端可以继续使用 `rag.evidence.results` 渲染片段，但抽屉入口状态应以 `uiModel.evidenceDrawer.statusLabel_zh` 和 `tone` 为准。

AI 输出审查接口：

```http
POST /api/projects/:id/writing-workbench/review-answer
```

请求：

```json
{
  "task": "帮我根据证据写 related work",
  "answer": "AI 返回正文..."
}
```

返回：

```json
{
  "review": {
    "status": "reject",
    "label_zh": "暂不建议采纳",
    "message_zh": "发现 1 个阻塞问题。请先修改 AI 输出或补充证据，不建议直接采纳。",
    "summary": {
      "blockingCount": 1,
      "warningCount": 2,
      "sourceReferenceCount": 0,
      "evidenceCount": 2
    },
    "findings": [
      {
        "id": "missing-source-numbers",
        "severity": "high",
        "label_zh": "缺少来源编号",
        "detail_zh": "当前任务依赖文献证据，但 AI 输出没有使用 [1]、[2] 等来源编号。",
        "blocking": true
      }
    ],
    "nextActions": [
      { "type": "revise-answer", "label_zh": "让 AI 按证据包重写" }
    ],
    "revisionPlan": {
      "status": "reject",
      "label_zh": "按步骤修复后重写",
      "summary_zh": "当前输出有阻塞问题，需要完成 2 个修复步骤后再让 AI 重写。",
      "steps": [
        {
          "id": "add-source-numbers",
          "label_zh": "补齐来源编号",
          "detail_zh": "把文献事实改写为只引用证据包中的编号。",
          "action": { "type": "revise-answer", "label_zh": "按证据编号修订" },
          "blocking": true
        }
      ],
      "copyText": "# AI 输出修订计划\n状态：reject\n..."
    },
    "revisionPrompt": {
      "available": true,
      "label_zh": "按证据包重写",
      "text": "# 请修订下面的 AI 输出\n\n# 审查发现\n- 阻塞：缺少来源编号..."
    },
    "revisionLoop": {
      "status": "rewrite-required",
      "label_zh": "需要重写并复审",
      "summary_zh": "当前输出有 1 个阻塞项。先重写，再把新输出重新审查；不要直接采纳旧版本。",
      "iterationHint_zh": "每次得到新版本后，都应再次点击“审查当前输出”。",
      "nextAction": { "type": "use-revision-prompt", "label_zh": "用修订提示词重写后重新审查" },
      "canExitLoop": false,
      "recheckRequiredAfter": ["使用修订提示词生成新版本后。"],
      "stopCriteria": ["审查结果不再是 reject。"],
      "copyText": "# AI 输出修订闭环\n..."
    },
    "claimCheckQueue": {
      "status": "needs-check",
      "label_zh": "有句子需要优先检查",
      "summary_zh": "已提取 1 个候选句；写入正文前建议逐句运行单句证据检查。",
      "items": [
        {
          "id": "claim-1",
          "claim": "Inspectable evidence workflows help cite sources in related work.",
          "priority": "high",
          "reason_zh": "像文献事实陈述，但缺少来源编号。",
          "suggestedAction": { "type": "review-claim", "label_zh": "放入单句证据检查" }
        }
      ],
      "copyText": "# 待单句检查队列\n..."
    },
    "adoptionGate": {
      "status": "blocked",
      "label_zh": "不得采纳",
      "canUseAsDraft": false,
      "canUseForCitableText": false,
      "canWriteToPaper": false,
      "requiresHumanConfirmation": true,
      "requiredConfirmations": ["人工通读整段，确认语义、语气和目标章节匹配。"],
      "forbiddenUntilConfirmed": ["不得自动写入或覆盖论文正文文件。"]
    }
  }
}
```

该审查是启发式采纳建议，不替代人工事实核对。它会检查空回复、缺少来源编号、引用证据包之外的编号、证据包编号不稳定、无证据时疑似假引用、可能未被片段支持的作者/年份/venue/DOI 信息、证据覆盖不足却写完整 related work/领域趋势/强综述结论，以及验收清单中的阻塞项。正式前端应在 AI 输出后展示 `review.label_zh`、`findings`、`nextActions`、`revisionPlan`、`revisionPrompt`、`revisionLoop`、`claimCheckQueue` 和 `adoptionGate`，不要只显示模型文本。`findings[].id === "evidence-coverage-too-thin-for-strong-conclusion"` 必须作为阻塞项显示，并引导用户补充不同来源证据或把输出收窄为局部观点。`findings[].id === "unstable-evidence-ranks"` 也必须作为阻塞项显示：证据包编号必须是唯一正整数，否则 `[1]`、`[2]` 这类引用无法可靠追溯。`revisionPlan.steps[]` 是面向用户的修订步骤，应展示步骤标题、说明、推荐动作和是否阻塞；`revisionPlan.copyText` 可提供“复制修订计划”。`revisionLoop` 是多轮修订状态，应展示当前是否需要重写/修订/终审、下一步动作、何时必须重新审查、退出条件和“复制修订闭环”。`claimCheckQueue.items[]` 是从 AI 输出中提取的重点待核对句子，前端应展示优先级、原因和“放入单句检查”按钮；该按钮只能填入单句检查框，不能自动写入正文。`revisionPrompt.available` 为 true 时，应同时提供“使用修订提示词”和“复制修订提示词”入口；“使用修订提示词”只能把提示词放入发送预览或输入框，必须等待用户再次显式点击发送，不能自动调用模型。`adoptionGate.canWriteToPaper` 当前必须按 false 处理：即使 `status` 是 `adoptable`，也只表示可作为待确认草稿，写入正文必须经过人工确认、来源核对和目标章节检查。

单句证据检查接口：

```http
POST /api/projects/:id/writing-workbench/claim-review
```

请求：

```json
{
  "task": "帮我根据证据写 related work",
  "claim": "Inspectable evidence workflows help cite sources in related work.",
  "contextAnswers": {
    "target_section_or_file": "chapters/related_work.tex"
  },
  "evidenceLimit": 5
}
```

返回：

```json
{
  "review": {
    "status": "reject",
    "label_zh": "暂不建议写入正文",
    "message_zh": "这句话目前不适合直接写入正文。先处理阻塞问题，尤其是来源编号、证据缺失或超出片段支持范围。",
    "summary": {
      "sourceReferenceCount": 0,
      "evidenceCount": 1,
      "matchCount": 1,
      "blockingCount": 1,
      "warningCount": 0
    },
    "matches": [
      {
        "rank": 1,
        "sourceLabel": "research_corpus/related-work.md:L1-L1",
        "snippet": "Inspectable evidence workflows help cite sources in related work.",
        "overlapTerms": ["inspectable", "evidence", "workflows"],
        "missingTerms": ["claim 中未被证据覆盖的关键词"],
        "coverage": 0.6,
        "supports_zh": ["可用于 related work 的主题归纳或代表性观点。"],
        "notFor": ["不能推导作者、年份、会议或 DOI，除非片段中明确出现。"]
      }
    ],
    "findings": [
      {
        "id": "missing-source-number",
        "label_zh": "缺少来源编号",
        "blocking": true
      }
    ],
    "suggestedRewrite": "Inspectable evidence workflows help cite sources in related work [1]。",
    "writeGate": {
      "status": "blocked",
      "label_zh": "不得写入正文",
      "canUseAsDraft": false,
      "canUseForCitableText": false,
      "canWriteToPaper": false,
      "requiresHumanConfirmation": true,
      "requiredConfirmations": ["人工核对这句话的语义没有超出匹配证据片段。"],
      "forbiddenUntilConfirmed": ["不得自动写入或覆盖论文正文文件。"]
    },
    "copyText": "# 单句证据检查\n..."
  }
}
```

该接口用于检查“一句话能不能被当前证据包支持”，不是全文审查。正式前端应在证据写作包附近提供输入框，让用户粘贴准备写入论文的 claim。`status: reject` 时，不应鼓励用户直接写入正文；应展示阻塞 `findings`、匹配证据、建议改写和 `writeGate`。`matches[].notFor` 必须展示在匹配证据旁，避免用户把片段扩展成作者、年份、venue、DOI、实验结论等未支持信息。`findings[].id === "unstable-evidence-ranks"` 表示证据包自身编号不可追溯，前端应要求重新生成证据包，而不是让用户手动猜测 `[1]` 指向哪个片段。`writeGate.canWriteToPaper` 当前必须按 false 处理：即使 `status` 是 `supported`，也只表示可作为待确认句子，写入正文必须人工核对原文、来源编号和目标段落。
`matches[].coverage` 和 `matches[].missingTerms` 用于解释 claim 与证据的匹配强度。`findings[].id === "weak-evidence-match"` 表示虽然有重合关键词或来源编号，但 claim 中仍有关键事实没有被片段直接支撑；正式前端应把它显示为阻塞项，并引导用户改写为证据直接表达的局部事实或先补充更直接的证据。

## 2. Skill Picker

接口：

```http
GET /api/skills
GET /api/skills/navigation
GET /api/skills/:name
POST /api/skills/navigation
POST /api/skills/recommend
```

Skill 必须中文优先显示：

- 主标题：`display_name_zh`
- 副标题：`subtitle_en`
- 分类：`category_zh`
- 标签：`tags`
- 悬停或键盘 focus 弹层：`inputs`、`outputs`、`best_for`、`not_for`、`risk_level`、`estimated_time`

推荐接口响应：

```json
{
  "recommendations": [
    {
      "skill": {
        "name": "literature-review",
        "display_name_zh": "文献综述",
        "subtitle_en": "Literature Review",
        "category_zh": "文献",
        "task_templates": [
          "基于证据库里的论文，帮我按主题梳理 related work，并指出每个主题下的代表论文和 research gap。"
        ]
      },
      "score": 23,
      "reasons": ["适合相关工作和文献综合"],
      "missingContext": ["rag_documents_or_references"],
      "suggestedTask": "我的任务是：帮我写 related work\n\n基于证据库里的论文，帮我按主题梳理 related work，并指出每个主题下的代表论文和 research gap。"
    }
  ]
}
```

工作台聚合接口还会返回 `skills.decisionGuide`，用于解释“为什么默认选这个 Skill，以及什么时候应该改选别的”：

```json
{
  "skills": {
    "decisionGuide": {
      "status": "needs-context",
      "label_zh": "推荐可用但需补材料",
      "summary_zh": "当前任务更适合在 Agent 建议修改中使用“文献综述”。但还缺 1 类材料。另有 2 个备选 Skill。",
      "primary": {
        "name": "literature-review",
        "title_zh": "文献综述",
        "subtitle_en": "Literature Review",
        "why_zh": ["适合相关工作和文献综合", "可使用已索引文献证据"],
        "avoid_when_zh": ["单段润色", "实验结果统计"],
        "nextAction_zh": "先补充：目标章节或文件。",
        "suggestedTask": "我的任务是..."
      },
      "alternatives": [
        {
          "name": "writing-introduction",
          "title_zh": "引言写作",
          "choose_if_zh": "如果你要把 related work 的 gap 转成 Introduction 动机和贡献表述，选它。",
          "tradeoff_zh": "它更适合专项任务；若要写完整 related work，仍建议先用文献综述 Skill 做主题结构和证据边界。"
        }
      ],
      "questions_zh": ["这次要写作或修改哪一个章节/文件？"],
      "copyText": "# Skill 决策指南\n..."
    }
  }
}
```

正式前端应把 `decisionGuide.primary` 放在推荐卡片之前展示，避免用户只看到多个 Skill 名称却不知道为什么首选它。`alternatives[]` 应展示“什么时候选”和“取舍”，`copyText` 可提供“复制 Skill 决策”。

Skill 导航接口用于独立 Skill Picker，不要求先进入工作台：

```http
GET /api/skills/navigation?selectedSkill=literature-review
```

返回：

```json
{
  "navigator": {
    "title_zh": "Skill 导航",
    "subtitle_en": "Skill Navigator",
    "selectedSkill": "literature-review",
    "categories": [],
    "tagChips": [],
    "contextFilters": [],
    "riskFilters": [],
    "cards": []
  }
}
```

如果前端已经有用户任务，希望自动高亮推荐 Skill，使用：

```http
POST /api/skills/navigation
```

请求：

```json
{
  "task": "帮我根据 PDF 写 related work 和 research gap",
  "projectState": { "hasRagDocuments": true, "hasReferences": true },
  "limit": 5
}
```

返回会同时包含 `recommendations` 和按推荐结果高亮排序后的 `navigator`。正式前端的 Skill Picker 可以优先调用这个接口，直接渲染中文分类、标签、上下文需求、风险筛选和 Skill 卡片。

前端行为：

- 分类 chips 使用后端 `categories` 或 `category_zh`，不要在前端硬编码 skill 分类。
- 推荐理由必须可见，不能只放在 tooltip。
- Skill 详情必须支持鼠标悬停和键盘 focus；至少展示输入、输出、适用场景、不适用场景、风险和预计时间。
- `missingContext` 要转成下一步动作，例如提示上传 PDF、补 references.bib、选择章节。
- `skill.task_templates` 是该 Skill 的中文任务模板；推荐结果中的 `suggestedTask` 是结合当前用户任务生成的可直接使用版本。前端应提供“填入任务框”和“复制模板”两个动作，降低用户选择 Skill 后不知道怎么问的成本。

## 3. Evidence Library

接口：

```http
GET /api/projects/:id/rag/documents
POST /api/projects/:id/rag/upload
POST /api/projects/:id/rag/index
GET /api/projects/:id/rag/search?q=...
POST /api/projects/:id/rag/context
```

文档状态字段：

- `parseStatus`: `parsed` / `indexed` / `metadata-only` / `failed`
- `parser`
- `extractedTextChars`
- `chunks`
- `extractionError`
- `warnings`

聚合诊断字段：

- `rag.health.status`: `healthy` / `needs-attention` / `unusable`
- `rag.health.label_zh`: 用户可见中文状态，例如“证据可用”“需要处理”“证据不可用”
- `rag.health.score`: 0-100 的健康分，用于排序或仪表盘展示，不应作为唯一决策依据
- `rag.health.message_zh`: 一句话解释当前证据库是否能支撑写作
- `rag.health.issues[]`: 具体问题列表，包含 `severity`、`code`、`message_zh`

前端应优先展示 `rag.health.label_zh` 和 `message_zh`。`summary.indexedChunks`、`metadataOnly`、`failed` 等数字用于辅助排查，不应要求普通用户理解这些指标后才能判断 RAG 是否可用。

前端文案规则：

- `parsed`: “已抽取正文并索引”
- `indexed`: “文本已索引”
- `metadata-only`: “仅保存文件信息，未抽取正文”
- `failed`: “解析失败”

不要在 `metadata-only` 或 `failed` 状态下显示“PDF 已索引正文”。这会让用户误以为 RAG 可以读取论文内容。

基础操作：

- 上传文献：`POST /api/projects/:id/rag/upload`，使用 multipart 字段 `file`。
- 上传请求只手动追加 `Authorization`，不要设置 `Content-Type`，让浏览器生成 multipart boundary。
- 重建索引：`POST /api/projects/:id/rag/index`。
- 检索证据：`GET /api/projects/:id/rag/search?q=<query>&limit=8`。
- 删除文档：`DELETE /api/projects/:id/rag/documents?path=<encoded path>`。删除前必须二次确认，并在成功后刷新工作台上下文。
- 上传或重建索引完成后，应刷新 `/writing-workbench/context`，让 RAG 健康摘要、最近文档和 Skill 推荐同步更新。

## 4. Chat Evidence Drawer

AI 接口：

```http
POST /api/ai/send
POST /api/ai/stream
```

RAG 响应字段：

- `ragContext`: 旧版字符串字段，保留兼容。
- `ragEvidence`: 结构化证据对象。
- SSE `rag_context` 事件：`{ "evidence": ... }`
- SSE `done` 事件：包含 `ragEvidence`

`ragEvidence.results[]` 字段：

- `rank`
- `score`
- `text`
- `source.path`
- `source.title`
- `source.lineStart`
- `source.lineEnd`

前端行为：

- 回答旁边显示“使用了 N 条证据”。
- 证据抽屉按 `rank` 展示 snippet、路径、行号和分数。
- 每条证据应提供复制来源和复制片段操作；证据抽屉应提供复制全部证据上下文操作，便于粘贴到 Chat 或审稿记录里。
- 如果 `ragEvidence.query` 存在但 `results` 为空，显示“已检索证据库，但没有找到匹配片段”。
- 如果没有 `ragEvidence`，显示“本次回答未使用 RAG 证据”，避免用户误以为回答基于文献。

## 5. 写作提示词

工作台应提供一个可复制提示词区域，便于用户把当前状态直接带入 Chat / Agent。

提示词至少包含：

- 论文写作任务
- 推荐执行模式及是否需要确认
- 推荐 Skill 的中文名和英文副标题
- Skill 需要的输入
- Skill 会产出的内容
- 当前 RAG 证据，按 `[rank] source` 格式展示
- 缺失上下文
- 下一步动作
- 写作要求：引用证据、不要编造引用、修改正文前先给建议或 diff

当没有 RAG 命中时，提示词必须明确写出“不要编造引用；请先提示补充文献或换关键词”。

RAG 检索助手：

- 工作台响应的 `rag.queryAssistant` 必须独立展示，不能只藏在证据写作包里。
- 面板必须显示当前状态、当前检索词、命中片段数、已索引 chunks、推荐检索词和检索步骤。
- 推荐检索词必须可点击填入 RAG 搜索框，并应提供一个明确的“检索”动作来执行 `/rag/search`。检索完成后，前端应提示用户重新评估生产可用性；重新评估时把该检索词作为 `evidenceQuery` 发送。
- `needs-upload` 和 `needs-repair` 状态优先提示上传或修复 PDF 解析；`no-hit` 和 `can-improve` 状态优先提示换关键词和补不同来源。
- 用户不应需要理解 embedding、chunk 或 parser 细节才能知道下一步该搜什么。
- `rag.queryRewriteGuide` 是检索失败或证据偏薄时的 query 改写层。正式前端应把 `groups[]` 按“主题范围 / 方法对比 / 局限与 Gap / 实验与结果 / 引用线索”等分组展示，每个 `queries[]` 都应能一键填入 RAG 搜索框，并提供显式检索按钮。
- `rag.queryRewriteGuide.copyText` 用于“复制改写方案”。点击改写 query 只能填入检索框或触发用户明确点击后的检索，不能自动生成论文正文。

可选发送流程：

1. `POST /api/conversations/:projectId` 创建会话。
2. 会话 `mode` 使用 `taskRouting.mode`，只允许 `chat`、`agent`、`tools`。
3. 会话 `active_skills` 使用推荐列表第一项的 `skill.name`。
4. `POST /api/ai/send` 发送生成提示词。
5. 页面必须显示 AI 返回或错误；不要静默失败。
6. 发送必须由用户显式点击触发，不能在任务分析后自动调用模型。

## 6. 模式边界

模式说明：

- `chat`: 解释、总结、建议，不修改文件。
- `agent`: 读取上下文并提出论文修改建议，必须展示 diff 或确认态。
- `tools`: 编译、运行脚本、处理代码或实验数据，风险最高，必须展示工具调用和结果。

前端必须把模式边界显示在输入区域附近，而不是藏在设置里。用户需要在提交前知道这次请求会不会改文件、会不会运行工具、会不会引用 RAG 证据。
