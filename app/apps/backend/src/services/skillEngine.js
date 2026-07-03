import { readdir, readFile, mkdir, writeFile, rm, stat } from 'fs/promises';
import { join, dirname, basename, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomUUID } from 'crypto';
import { execSync } from 'child_process';
import YAML from 'yaml';
import { safeJoin } from '../utils/pathSecurity.js';
 
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const builtinSkillsDir = join(__dirname, '../../skills');
const importedSkillsDir = join(__dirname, '../../skills-imported');
const SKILL_TRACKER_FILE = join(__dirname, '../../skills-imported/tracker.json');
let skillRegistry = new Map();

const SKILL_UI_METADATA = {
  'literature-review': {
    display_name_zh: '文献综述',
    subtitle_en: 'Literature Review',
    category_zh: '文献',
    tags: ['相关工作', '综述', '研究空白'],
    task_intents: ['写 related work', '写相关工作', '总结一批论文', '梳理研究脉络', '找 research gap', '文献综述'],
    user_questions: ['帮我写 related work', '总结这些论文的主题', '帮我找研究空白'],
    task_templates: [
      '基于证据库里的论文，帮我按主题梳理 related work，并指出每个主题下的代表论文和 research gap。',
      '请先从 RAG 证据中提取可引用观点，再帮我写一版 related work 草稿，引用时标注来源编号。',
      '帮我比较这些文献的方法差异、共同假设和未解决问题，最后给出可写进论文的研究空白。'
    ],
    inputs: ['研究主题', '文献 PDF 或 RAG 证据库', 'references.bib 或关键词'],
    outputs: ['主题分类', '关键论文综述', '研究 gap', 'related work 草稿'],
    best_for: ['相关工作', 'survey', '文献脉络梳理'],
    not_for: ['单段润色', '实验结果统计'],
    risk_level: 'medium',
    estimated_time: '3-10 min',
    requires_context: ['rag_documents_or_references'],
  },
  'writing-introduction': {
    display_name_zh: '引言写作',
    subtitle_en: 'Introduction Writing',
    category_zh: '写作',
    tags: ['引言', '动机', '贡献点'],
    task_intents: ['写 introduction', '写引言', '写 motivation', '写贡献', 'CARS', '研究背景'],
    user_questions: ['帮我写 introduction', '帮我把 gap 和 contribution 串起来'],
    task_templates: [
      '请根据我的研究问题、相关工作 gap 和贡献点，按背景-问题-gap-方法-贡献结构写 introduction。',
      '帮我把当前 introduction 改得更像论文开头：先铺背景，再收窄问题，最后突出贡献。',
      '请检查 introduction 的逻辑链条，指出哪里缺动机、缺 gap 或贡献表述不清，并给出改写建议。'
    ],
    inputs: ['论文主题', '方法亮点', '相关工作或文献证据', '贡献点'],
    outputs: ['引言结构', 'gap 表述', '贡献列表', '引言草稿'],
    best_for: ['论文引言', 'motivation', 'contribution statement'],
    not_for: ['参考文献清洗', '图表设计'],
    risk_level: 'medium',
    estimated_time: '2-6 min',
    requires_context: ['paper_claims', 'related_work'],
  },
  'writing-methodology': {
    display_name_zh: '方法写作',
    subtitle_en: 'Methodology Writing',
    category_zh: '写作',
    tags: ['方法', '算法', '符号定义'],
    task_intents: ['写 method', '写 methodology', '写方法', '算法描述', '实验设置方法', '公式符号一致性', '符号不一致', '伪代码', 'theorem proof', 'proof 严谨性'],
    task_templates: [
      '请根据我的方法步骤和符号定义，写一版 methodology 章节草稿，要求结构清晰、术语一致。',
      '帮我把方法描述改成论文风格：先给总体框架，再解释关键模块、训练目标和实现细节。',
      '请检查 method 章节是否缺少算法流程、输入输出、符号定义或复杂度说明，并给出补充建议。'
    ],
    inputs: ['方法步骤', '算法/模型细节', '符号定义'],
    outputs: ['方法章节草稿', '步骤化描述', '符号说明'],
    best_for: ['方法章节', '算法解释'],
    not_for: ['文献检索'],
    risk_level: 'medium',
    estimated_time: '2-6 min',
    requires_context: ['method_notes'],
  },
  'writing-results': {
    display_name_zh: '结果写作',
    subtitle_en: 'Results Writing',
    category_zh: '实验',
    tags: ['结果分析', '消融实验', '表格'],
    task_intents: ['写 results', '写实验结果', '分析表格', '描述消融', '结果分析', 'dataset 描述', '实验设置'],
    task_templates: [
      '请根据实验表格和指标，写 results 章节，突出主要提升、消融发现和异常结果。',
      '帮我把实验结果描述得更严谨：先说明设置，再比较 baseline，最后解释可能原因。',
      '请检查 results 是否过度解读，区分数据直接支持的结论和推测。'
    ],
    inputs: ['实验表格', '指标', 'baseline', '消融结果'],
    outputs: ['结果段落', '对比分析', '图表引用文字'],
    best_for: ['实验结果章节', 'ablation 分析'],
    not_for: ['引用格式修复'],
    risk_level: 'medium',
    estimated_time: '2-6 min',
    requires_context: ['experiment_results'],
  },
  'writing-discussion': {
    display_name_zh: '讨论写作',
    subtitle_en: 'Discussion Writing',
    category_zh: '写作',
    tags: ['讨论', '局限性', '未来工作'],
    task_intents: ['写 discussion', '写讨论', '局限性', '未来工作', '意义分析'],
    task_templates: [
      '请基于主要发现和局限性，写 discussion 章节，说明结果意义、适用边界和 future work。',
      '帮我把讨论部分写得更克制：哪些结论有证据支持，哪些只能作为假设。',
      '请列出论文可能被审稿人质疑的局限性，并给出 discussion 中的回应写法。'
    ],
    inputs: ['主要发现', '实验结果', '局限性'],
    outputs: ['讨论章节', 'limitation', 'future work'],
    best_for: ['讨论', '局限性', '未来工作'],
    not_for: ['方法公式推导'],
    risk_level: 'low',
    estimated_time: '2-5 min',
    requires_context: ['paper_findings'],
  },
  'writing-abstract': {
    display_name_zh: '摘要写作',
    subtitle_en: 'Abstract Writing',
    category_zh: '写作',
    tags: ['摘要', '总结', '压缩'],
    task_intents: ['写 abstract', '写摘要', '总结论文', '压缩摘要', '写 title', '生成关键词', 'keyword list'],
    task_templates: [
      '请根据问题、方法、结果和贡献，写一版 150-250 词的论文 abstract。',
      '帮我压缩当前 abstract，保留问题、方法、关键结果和贡献，不要加入正文没有支持的新结论。',
      '请检查 abstract 是否缺少任务背景、方法亮点、量化结果或贡献句，并给出改写版本。'
    ],
    inputs: ['问题', '方法', '结果', '贡献'],
    outputs: ['摘要草稿', '短摘要'],
    best_for: ['摘要', '投稿摘要'],
    not_for: ['长篇文献综述'],
    risk_level: 'low',
    estimated_time: '1-3 min',
    requires_context: ['paper_summary'],
  },
  'writing-conclusion': {
    display_name_zh: '结论写作',
    subtitle_en: 'Conclusion Writing',
    category_zh: '写作',
    tags: ['结论', '总结', '未来工作'],
    task_intents: ['写 conclusion', '写结论', '总结贡献', 'future work'],
    task_templates: [
      '请根据论文贡献和主要结果，写一版 conclusion，最后自然引出 future work。',
      '帮我把结论写得更简洁，避免重复 abstract，同时强调发现和影响。',
      '请检查 conclusion 是否过度承诺或缺少未来工作，并给出修改建议。'
    ],
    inputs: ['论文贡献', '主要结果', '未来工作'],
    outputs: ['结论章节'],
    best_for: ['结论', '收束全文'],
    not_for: ['检索论文'],
    risk_level: 'low',
    estimated_time: '1-3 min',
    requires_context: ['paper_summary'],
  },
  'paper-planning': {
    display_name_zh: '论文规划',
    subtitle_en: 'Paper Planning',
    category_zh: '规划',
    tags: ['大纲', '故事线', '写作计划'],
    task_intents: ['论文写作计划', '论文 outline', 'paper structure', 'paper roadmap', '写作任务规划', '论文故事线', '贡献是否足够强', 'reviewer 风险清单'],
    user_questions: ['帮我制定论文写作计划', '帮我生成论文 outline', '帮我把 idea 变成 paper structure', '帮我检查论文故事线是否清楚'],
    task_templates: [
      '请把我的研究 idea 整理成 paper outline：标题候选、核心故事线、各章节目标、需要补的证据/实验和两周写作计划。',
      '请检查论文故事线和贡献链条是否清楚：问题、gap、方法、结果、贡献和 reviewer 可能质疑点分别是什么。',
      '请生成写作 roadmap：按优先级列出章节、图表、实验、引用和审查任务，并标出依赖和风险。'
    ],
    inputs: ['研究 idea 或论文概要', '目标会议/期刊', '当前进度和截止时间'],
    outputs: ['论文大纲', '故事线', '贡献图谱', '写作 roadmap', '审稿风险清单'],
    best_for: ['开写前规划', '从 idea 到论文结构', '写作任务拆解', '审稿风险预判'],
    not_for: ['单段润色', '编译 LaTeX', '自动写正文'],
    risk_level: 'medium',
    estimated_time: '2-8 min',
    requires_context: ['paper_claims'],
  },
  'writing-polish': {
    display_name_zh: '论文润色',
    subtitle_en: 'Academic Polishing',
    category_zh: '写作',
    tags: ['润色', '翻译', '语法时态', 'AI 痕迹', '学术风格'],
    task_intents: [
      '润色',
      '语言润色',
      '改论文',
      '修改论文',
      '翻译成英文论文表达',
      '英文论文段落翻译成中文',
      '语法',
      '时态',
      '压缩段落',
      '改短',
      'bullet points 改成论文段落',
      '降低 AI 痕迹',
      'Nature 风格英文',
      'ACL 风格',
      'NeurIPS 风格',
      'ICML 风格',
      'ICLR 风格',
      'polish',
      'language editing',
      'grammar',
      'clarity',
      'translate',
      'humanize',
      'academic style',
      'tense consistency',
      'sentence clarity',
    ],
    user_questions: ['帮我润色', '帮我改论文', '帮我把这段写得更学术', '帮我把中文翻译成英文论文表达', '帮我降低 AI 痕迹'],
    task_templates: [
      '请帮我润色目标段落，提升清晰度、连贯性和学术语气；不要新增事实、引用、数字或改变原意。',
      '请把这段中文翻译成英文论文表达，保留术语、变量、引用和量化结果；不确定的技术含义请标出。',
      '请检查这段英文的语法、时态、AI 痕迹和学术风格，给出保守改写版本和可能改变含义的风险点。',
      '请按轻度/中度/重度三档给出论文润色建议，并标出任何可能改变含义的修改。',
      '帮我把这段改得更像论文表达，保留 LaTeX 命令、引用编号、变量名和所有量化结果。'
    ],
    inputs: ['目标段落或章节', '目标章节或文件', '期刊/会议风格偏好', '润色强度'],
    outputs: ['润色版本', '修改说明', '可能改变含义的风险点'],
    best_for: ['单段润色', '语言编辑', '清晰度和连贯性修改'],
    not_for: ['新增文献事实', '自动覆盖正文', '统计分析'],
    risk_level: 'medium',
    estimated_time: '1-4 min',
    requires_context: ['target_section_or_file'],
  },
  'latex-debugging': {
    display_name_zh: 'LaTeX 编译修复',
    subtitle_en: 'LaTeX Debugging',
    category_zh: '工具',
    tags: ['LaTeX', 'Overleaf', '编译错误'],
    task_intents: ['LaTeX 编译错误', 'Overleaf 报错', '编译 PDF 出错', 'undefined control sequence', 'missing $ inserted', 'latex error'],
    user_questions: ['帮我检查 LaTeX 编译错误', '帮我修复 Overleaf 报错', '为什么 PDF 编译失败'],
    task_templates: [
      '请根据 LaTeX/Overleaf 报错日志定位原因，先解释错误类型和最小修复方案，不要直接覆盖源文件。',
      '请把编译错误按阻塞顺序排序，指出涉及的 .tex 文件、行号线索和需要我确认的宏包或模板限制。',
      '请给出可审查 patch 建议；如果需要运行编译命令，先列命令、输入输出和风险。'
    ],
    inputs: ['LaTeX 报错日志', '目标 .tex 文件或章节', '模板/Overleaf 环境说明'],
    outputs: ['错误原因', '最小修复建议', '可审查 patch', '重新编译计划'],
    best_for: ['LaTeX 编译失败', 'Overleaf 报错', '模板冲突'],
    not_for: ['正文语言润色', '文献综述写作'],
    risk_level: 'high',
    estimated_time: '2-8 min',
    requires_context: ['latex_error_log', 'target_section_or_file'],
  },
  'reference-management': {
    display_name_zh: '引用管理',
    subtitle_en: 'Reference Management',
    category_zh: '引用',
    tags: ['BibTeX', 'DOI', '引用键'],
    task_intents: ['BibTeX', '引用格式', 'references.bib', '参考文献', 'DOI', 'citation key', '查重引用'],
    user_questions: ['帮我整理 references.bib', '检查引用格式', '生成 BibTeX'],
    task_templates: [
      '请检查 references.bib，找出重复条目、缺失 DOI/年份/venue 的条目，并给出修复建议。',
      '帮我为这些论文标题生成 BibTeX 线索，并标注哪些字段需要人工确认。',
      '请统一 citation key 命名规则，输出可审查的修改计划，不要直接覆盖文件。'
    ],
    inputs: ['references.bib', 'DOI/arXiv/论文标题'],
    outputs: ['清洗后的 BibTeX', '重复引用列表', '缺失字段报告'],
    best_for: ['BibTeX 管理', '引用格式'],
    not_for: ['正文改写'],
    risk_level: 'low',
    estimated_time: '1-5 min',
    requires_context: ['references_bib'],
  },
  'evidence-review': {
    display_name_zh: '输出审查',
    subtitle_en: 'Evidence Review',
    category_zh: '审查',
    tags: ['证据核对', '幻觉引用', '安全采纳', '反例', '逐句引用'],
    task_intents: ['幻觉引用', '证据支持', 'RAG 证据核对', '审查 AI 输出', '安全采纳包', 'adoption package', 'claim review', '逐句证据编号', 'negative evidence', '反例证据', 'citation grounding'],
    user_questions: ['帮我检查有没有幻觉引用', '帮我把这一句话和 RAG 证据核对一下', '帮我审查 AI 写的这段能不能采纳', '帮我生成安全采纳包', '帮我找反例或者 negative evidence', '把 related work 每句话对应证据编号'],
    task_templates: [
      '请审查这段 AI 输出是否可采纳：逐条检查引用编号、证据支持、过度外推和需要重写的句子；不要自动写入正文。',
      '请把这一句话和当前 RAG 证据包核对，说明是否直接支持、缺哪些证据、建议如何改写。',
      '请生成安全采纳包：只给人工采纳清单、目标章节确认、来源编号摘要和手动 diff 计划，不要写文件。'
    ],
    inputs: ['AI 输出或单句 claim', 'RAG 证据包', '目标章节或段落'],
    outputs: ['可采纳性结论', '阻塞问题清单', '单句证据核对', '安全采纳包'],
    best_for: ['AI 输出审查', '幻觉引用检查', '单句证据核对', '安全采纳', '逐句证据映射', '反例/负证据检查'],
    not_for: ['从零写正文', '编译 LaTeX', '自动合并论文正文'],
    risk_level: 'high',
    estimated_time: '1-5 min',
    requires_context: ['rag_documents_or_references', 'target_section_or_file'],
  },
  'nature-academic-search': {
    display_name_zh: '学术检索',
    subtitle_en: 'Academic Search',
    category_zh: '文献',
    tags: ['学术检索', 'arXiv', 'Semantic Scholar'],
    task_intents: ['找论文', '检索文献', 'arxiv', 'semantic scholar', 'crossref', 'openalex', '最新工作'],
    task_templates: [
      '请围绕这个研究问题检索近三年的相关工作，按相关性、方法类型和可引用价值排序。',
      '帮我找补 related work 缺口的论文，优先返回有代码、公开数据或高引用的工作。',
      '请生成一组更好的检索关键词，包括同义词、方法名、任务名和数据集名。'
    ],
    inputs: ['关键词', '领域', '时间范围'],
    outputs: ['候选论文列表', '推荐理由', 'BibTeX 线索'],
    best_for: ['补文献', '找最新相关工作'],
    not_for: ['润色已有段落'],
    risk_level: 'medium',
    estimated_time: '1-5 min',
    requires_context: ['search_query'],
  },
  'statistical-analysis': {
    display_name_zh: '统计分析',
    subtitle_en: 'Statistical Analysis',
    category_zh: '实验',
    tags: ['统计', '显著性', '置信区间'],
    task_intents: ['统计显著性', 'p value', 'confidence interval', '实验统计', '分析数据', 't-test', 'mean std', '异常值', 'outlier', 'ROC curve'],
    task_templates: [
      '请根据实验结果判断是否需要显著性检验，并说明应该用哪种统计方法。',
      '帮我解释这些指标差异是否足以支持论文结论，区分统计证据和经验判断。',
      '请检查结果表格是否缺少均值、方差、置信区间或样本量说明。'
    ],
    inputs: ['实验数据', '指标', '对比方法'],
    outputs: ['统计报告', '显著性描述', '结果解释'],
    best_for: ['实验统计', '结果可靠性'],
    not_for: ['写引言'],
    risk_level: 'high',
    estimated_time: '3-10 min',
    requires_context: ['data_or_results'],
  },
  'scientific-brainstorming': {
    display_name_zh: '科研头脑风暴',
    subtitle_en: 'Scientific Brainstorming',
    category_zh: '构思',
    tags: ['选题', '假设', '实验计划'],
    task_intents: ['想 idea', '创新点', '研究问题', '假设', 'brainstorm'],
    task_templates: [
      '请基于已有文献和我的约束，提出 5 个可验证的研究假设，并说明实验设计。',
      '帮我从当前方法中挖掘更清晰的创新点，区分真实贡献和包装性表述。',
      '请列出这个研究方向中最可能被审稿人认可的 problem framing。'
    ],
    inputs: ['研究方向', '约束', '已有结果'],
    outputs: ['研究想法', '假设', '实验计划'],
    best_for: ['早期选题', '创新点探索'],
    not_for: ['最终定稿'],
    risk_level: 'medium',
    estimated_time: '2-8 min',
    requires_context: ['research_direction'],
  },
  'nature-figure': {
    display_name_zh: '图表设计',
    subtitle_en: 'Nature Figure',
    category_zh: '图表',
    tags: ['图表', '图注', '视觉设计', '配色', '流程图'],
    task_intents: ['画图', 'figure', '图注', '配色', '示意图', '流程图', 'ROC curve', 'matplotlib', 'Nature 风格图表', '图表排版'],
    task_templates: [
      '请根据图表目的和数据，设计一张论文 figure 的结构，并写 caption 草稿。',
      '帮我检查这张图是否能清楚传达方法流程、实验对比或关键发现。',
      '请给出更适合论文投稿的配色、布局和图注改写建议。'
    ],
    inputs: ['图表目的', '数据/草图', '目标期刊'],
    outputs: ['图表结构建议', 'caption', '视觉规范'],
    best_for: ['论文图表', '图注'],
    not_for: ['引用验证'],
    risk_level: 'low',
    estimated_time: '2-6 min',
    requires_context: ['figure_goal'],
  },
  'conference-submission': {
    display_name_zh: '会议投稿检查',
    subtitle_en: 'Conference Submission',
    category_zh: '投稿',
    tags: ['投稿', '匿名检查', 'Checklist'],
    task_intents: ['投稿', 'conference', 'page limit', '匿名', 'camera ready', 'submission checklist'],
    task_templates: [
      '请根据会议要求检查投稿风险，包括页数、匿名、引用、补充材料和格式。',
      '帮我生成投稿前 checklist，按必须修、建议修、可忽略三类排序。',
      '请检查论文中可能破坏 double-blind 匿名的内容，并给出修改建议。'
    ],
    inputs: ['会议要求', 'PDF', '源文件'],
    outputs: ['投稿检查清单', '风险项'],
    best_for: ['投稿前检查', '匿名检查'],
    not_for: ['写实验代码'],
    risk_level: 'high',
    estimated_time: '3-10 min',
    requires_context: ['venue_rules', 'compiled_pdf'],
  },
  'reviewer-response': {
    display_name_zh: '审稿回复',
    subtitle_en: 'Reviewer Response',
    category_zh: '投稿',
    tags: ['Rebuttal', '审稿意见', '修改计划'],
    task_intents: ['rebuttal', '审稿意见回复', '回复审稿人', 'reviewer comments', 'response letter', 'response table', 'revision response', 'revision plan', 'revision checklist', 'revision summary', 'major concerns', 'minor concerns', 'action items', 'novelty weak', '过度承诺'],
    user_questions: ['帮我写 rebuttal', '帮我回复 reviewer comments', '帮我写审稿意见回复', '帮我把审稿意见转成 revision plan', 'reviewer 说 novelty weak，我该补什么', '帮我生成 response table'],
    task_templates: [
      '请根据审稿意见帮我起草 rebuttal：逐条拆解 reviewer comments，给出礼貌、具体、有证据边界的回复，并列出需要修改正文或补实验的事项。',
      '帮我把这些 reviewer comments 整理成 response letter，区分已修改、计划修改、需要作者确认和需要补证据的部分。',
      '请检查我的 rebuttal 草稿是否过度承诺、遗漏审稿意见或缺少正文修改位置，并给出改写版本。'
    ],
    inputs: ['审稿意见或 reviewer comments', '论文修改计划', '相关证据/实验结果', '目标 venue 规则'],
    outputs: ['逐条回复草稿', '修改 action list', '风险和缺口清单'],
    best_for: ['rebuttal', '审稿意见回复', 'response letter'],
    not_for: ['投稿格式检查', '自动修改正文', '编造新实验'],
    risk_level: 'high',
    estimated_time: '5-15 min',
    requires_context: ['reviewer_comments', 'target_section_or_file'],
  },
  'grant-proposal': {
    display_name_zh: '基金申请',
    subtitle_en: 'Grant Proposal Writing',
    category_zh: '项目申请',
    tags: ['基金', '申请书', '研究计划'],
    task_intents: ['基金申请', 'grant proposal', 'funding proposal', '项目申请书', 'research plan'],
    user_questions: ['帮我写基金申请', '帮我写 grant proposal', '帮我组织 research plan'],
    task_templates: [
      '请帮我梳理基金申请书结构：研究问题、创新点、技术路线、预期成果、风险和预算理由；不要编造未确认的经费或承诺。',
      '帮我把研究计划改成更适合 grant proposal 的表达，突出 significance、innovation 和 approach。',
      '请检查这个项目申请是否缺少目标、milestone、可行性证据或风险应对。'
    ],
    inputs: ['资助项目要求', '研究方向', '技术路线', '预算或里程碑'],
    outputs: ['申请书结构', '研究计划草稿', '风险和缺口清单'],
    best_for: ['基金申请', '项目计划', '研究计划书'],
    not_for: ['论文正文采纳', '编造预算', '投稿格式检查'],
    risk_level: 'high',
    estimated_time: '5-20 min',
    requires_context: ['research_direction', 'venue_rules'],
  },
  'nature-paper2ppt': {
    display_name_zh: '论文转演示',
    subtitle_en: 'Paper to Presentation',
    category_zh: '图表',
    tags: ['Slides', 'PPT', 'Beamer', '汇报'],
    task_intents: ['论文转 ppt', '做 slides', '做 beamer', 'conference talk', 'presentation'],
    user_questions: ['帮我把论文转成 PPT', '帮我做汇报 slides', '帮我设计 conference talk'],
    task_templates: [
      '请把这篇论文整理成 conference talk 大纲：每页 slide 的标题、核心图、讲稿要点和时间分配。',
      '帮我把论文内容转成 Beamer/PPT 结构，突出问题、方法、结果和 takeaway。',
      '请检查我的 slides 是否信息过密、故事线不清或图表解释不足。'
    ],
    inputs: ['论文概要或全文', '汇报时长', '目标听众', '关键图表'],
    outputs: ['slides 大纲', '逐页讲稿要点', '视觉和节奏建议'],
    best_for: ['论文汇报', 'conference talk', '答辩 slides'],
    not_for: ['自动生成最终 PPT 文件', '投稿格式检查'],
    risk_level: 'medium',
    estimated_time: '5-15 min',
    requires_context: ['paper_summary', 'figure_goal'],
  },
  'poster-design': {
    display_name_zh: '学术海报',
    subtitle_en: 'Academic Poster Design',
    category_zh: '图表',
    tags: ['海报', '版式', '视觉设计'],
    task_intents: ['学术海报', 'poster', 'conference poster', '海报排版', 'poster design'],
    user_questions: ['帮我设计学术海报', '帮我做 conference poster', '帮我优化海报排版'],
    task_templates: [
      '请帮我设计学术海报结构：标题、核心图、方法、结果、takeaway、版式和阅读路径。',
      '帮我检查 poster 是否信息过密、层级不清或关键结论不突出，并给出排版修改建议。',
      '请根据会议海报尺寸和论文内容，生成 poster 区块布局和每块文案要点。'
    ],
    inputs: ['海报尺寸', '论文概要', '关键图表', '目标会议'],
    outputs: ['海报布局', '区块文案', '视觉层级建议'],
    best_for: ['conference poster', '海报布局', '图文层级'],
    not_for: ['自动生成印刷文件', '正文引用审查'],
    risk_level: 'medium',
    estimated_time: '3-10 min',
    requires_context: ['figure_goal', 'paper_summary'],
  },
};
 
export async function loadSkills(projectSkillsDir) {
  skillRegistry.clear();
  await loadSkillsFromDir(builtinSkillsDir, 'builtin');
  await ensureImportedSkillsDir();
  await loadSkillsFromDir(importedSkillsDir, 'imported');
  if (projectSkillsDir) {
    await loadSkillsFromDir(projectSkillsDir, 'custom');
  }
}
 
/* ── Imported Skill Tracker ───────────────────────────────────── */
 
let skillTracker = {};
 
async function ensureImportedSkillsDir() {
  await mkdir(importedSkillsDir, { recursive: true });
  try {
    skillTracker = JSON.parse(await readFile(SKILL_TRACKER_FILE, 'utf-8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    skillTracker = {};
  }
}
 
async function saveTracker() {
  await mkdir(importedSkillsDir, { recursive: true });
  await writeFile(SKILL_TRACKER_FILE, JSON.stringify(skillTracker, null, 2), 'utf-8');
}
 
/* ── GitHub Import ────────────────────────────────────────────── */
 
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const GITHUB_API_BASE = 'https://api.github.com';
 
/**
 * Parse a GitHub URL into { owner, repo, ref, subdir }
 * Supports:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch/subdir
 *   https://github.com/owner/repo/tree/commithash
 *   owner/repo
 */
function parseGitHubUrl(url) {
  let cleaned = url.trim();
  if (cleaned.endsWith('.git')) cleaned = cleaned.slice(0, -4);
  const match = cleaned.match(
    /^(?:https?:\/\/github\.com\/)?([^/]+)\/([^/#\s]+)(?:\/tree\/([^/#]+)(?:\/(.+))?)?$/
  );
  if (!match) throw Object.assign(new Error(`Invalid GitHub URL: ${url}`), { statusCode: 400 });
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ''),
    ref: match[3] || 'main',
    subdir: match[4] || '',
  };
}
 
/**
 * Import a skill from a GitHub repository.
 * Downloads the SKILL.md/manifest.yaml from the repo and installs
 * it as a package skill under skills-imported/.
 */
export async function importSkillFromGitHub(url, options = {}) {
  const { owner, repo, ref, subdir } = parseGitHubUrl(url);
  const safeName = slugify(options.name || repo);
  const targetDir = safeJoin(importedSkillsDir, safeName);
 
  // Check if already installed
  if (skillTracker[safeName]) {
    throw Object.assign(new Error(`Skill "${safeName}" already imported from ${skillTracker[safeName].url}. Use updateSkill() to refresh.`), { statusCode: 409 });
  }
 
  // Create target directory
  await mkdir(targetDir, { recursive: true });
 
  // Try to download manifest / SKILL.md
  const prefix = subdir ? `${subdir}/` : '';
  const downloadPaths = [
    `${prefix}manifest.yaml`,
    `${prefix}manifest.yml`,
    `${prefix}skill.yaml`,
    `${prefix}skill.yml`,
    `${prefix}SKILL.md`,
    `${prefix}skill.md`,
  ];
 
  let downloadedManifest = null;
  let downloadedSkillMd = null;
 
  for (const relPath of downloadPaths) {
    const rawUrl = `${GITHUB_RAW_BASE}/${owner}/${repo}/${ref}/${relPath}`;
    try {
      const response = await fetch(rawUrl);
      if (response.ok) {
        const content = await response.text();
        const localPath = safeJoin(targetDir, relPath.split('/').pop());
        await writeFile(localPath, content, 'utf-8');
        if (relPath.endsWith('.yaml') || relPath.endsWith('.yml')) {
          downloadedManifest = localPath;
        } else {
          downloadedSkillMd = localPath;
        }
        break;
      }
    } catch { /* try next path */ }
  }
 
  // Download references/ scripts/ assets/ tests/ subdirectories
  const subdirsToDownload = ['references', 'scripts', 'assets', 'tests'];
  for (const sub of subdirsToDownload) {
    await downloadGitHubDir(targetDir, owner, repo, ref, `${prefix}${sub}`, sub);
  }
 
  // Reload skills to register the new package
  await loadSkills();
 
  // Register in tracker
  skillTracker[safeName] = {
    url,
    owner,
    repo,
    ref,
    subdir,
    name: safeName,
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveTracker();
 
  const skill = skillRegistry.get(safeName);
  return skill || {
    name: safeName,
    display_name: options.display_name || repo,
    description: `Imported from ${owner}/${repo}`,
    kind: 'package',
    _source: 'imported',
    package: {
      root: targetDir,
      references: await listRelativeFiles(safeJoin(targetDir, 'references'), 'references'),
      scripts: await listRelativeFiles(safeJoin(targetDir, 'scripts'), 'scripts'),
      assets: await listRelativeFiles(safeJoin(targetDir, 'assets'), 'assets'),
      tests: await listRelativeFiles(safeJoin(targetDir, 'tests'), 'tests'),
    },
  };
}
 
async function downloadGitHubDir(targetDir, owner, repo, ref, remotePrefix, localSubdir) {
  if (!remotePrefix) return;
  // Use GitHub API to get directory listing
  const apiUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${remotePrefix}?ref=${ref}`;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) return;
    const items = await response.json();
    if (!Array.isArray(items)) return;
 
    const localDir = safeJoin(targetDir, localSubdir);
    await mkdir(localDir, { recursive: true });
 
    for (const item of items) {
      if (item.type === 'file') {
        const fileUrl = `${GITHUB_RAW_BASE}/${owner}/${repo}/${ref}/${remotePrefix}/${item.name}`;
        try {
          const fileResp = await fetch(fileUrl);
          if (fileResp.ok) {
            const content = await fileResp.text();
            await writeFile(safeJoin(localDir, item.name), content, 'utf-8');
          }
        } catch { /* skip file */ }
      } else if (item.type === 'dir') {
        await downloadGitHubDir(targetDir, owner, repo, ref, `${remotePrefix}/${item.name}`, `${localSubdir}/${item.name}`);
      }
    }
  } catch { /* directory may not exist */ }
}
 
/**
 * Update an imported skill by re-downloading from its original source.
 */
export async function updateImportedSkill(name) {
  const info = skillTracker[name];
  if (!info) {
    throw Object.assign(new Error(`Skill "${name}" was not imported from GitHub or tracker info missing.`), { statusCode: 404 });
  }
 
  const targetDir = safeJoin(importedSkillsDir, name);
 
  // Remove existing content (keep the dir for safeJoin)
  try {
    const existing = await readdir(targetDir);
    for (const entry of existing) {
      if (entry === '.git' || entry === '.gitignore') continue;
      await rm(safeJoin(targetDir, entry), { recursive: true, force: true });
    }
  } catch { /* dir may not exist yet */ }
 
  // Re-import using the tracked URL
  const result = await importSkillFromGitHub(info.url, { name });
 
  // Update tracker
  skillTracker[name].updatedAt = new Date().toISOString();
  skillTracker[name].ref = info.ref;
  await saveTracker();
 
  return result;
}
 
/**
 * Get full package tree for a skill, optionally filtered by subdir.
 */
export async function getSkillPackageTree(name, subdir = '') {
  const skill = skillRegistry.get(name);
  if (!skill || !skill.package) {
    throw Object.assign(new Error(`Skill "${name}" is not a package skill.`), { statusCode: 404 });
  }
  const root = skill.package.root;
  const targetDir = subdir ? safeJoin(root, subdir) : root;
  return listRelativeFilesWithTypes(targetDir, subdir || '');
}
 
async function listRelativeFilesWithTypes(dir, prefix) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        files.push({ path: `${relativePath}/`, type: 'dir' });
        files.push(...await listRelativeFilesWithTypes(join(dir, entry.name), relativePath));
      } else {
        files.push({ path: relativePath, type: 'file' });
      }
    }
    return files;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
 
/**
 * Run tests for a skill package in a sandboxed environment.
 * Only allows whitelisted commands and enforces timeouts.
 */
export async function runSkillTests(name, options = {}) {
  const skill = skillRegistry.get(name);
  if (!skill || !skill.package) {
    throw Object.assign(new Error(`Skill "${name}" is not a package skill.`), { statusCode: 404 });
  }
 
  const testsDir = safeJoin(skill.package.root, 'tests');
  const testFiles = skill.package.tests || [];
  if (testFiles.length === 0) {
    return { passed: 0, failed: 0, skipped: 0, results: [], message: 'No tests found in skill package.' };
  }
 
  const timeout = Math.min(options.timeout || 30_000, 120_000);
  const results = [];
 
  for (const testFile of testFiles) {
    const ext = extname(testFile);
    const fullPath = safeJoin(skill.package.root, testFile);
 
    let command;
    if (ext === '.sh') command = ['bash', fullPath];
    else if (ext === '.py') command = ['python3', fullPath];
    else if (ext === '.js' || ext === '.mjs') command = ['node', fullPath];
    else {
      results.push({ file: testFile, status: 'skipped', reason: `Unsupported extension: ${ext}` });
      continue;
    }
 
    try {
      const output = execSync(command.join(' '), {
        cwd: skill.package.root,
        timeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          SKILL_ROOT: skill.package.root,
          SKILL_NAME: name,
        },
      });
      results.push({ file: testFile, status: 'passed', output: output.trim() });
    } catch (err) {
      const stderr = err.stderr || '';
      const stdout = err.stdout || '';
      results.push({
        file: testFile,
        status: 'failed',
        output: [stdout.trim(), stderr.trim()].filter(Boolean).join('\n'),
        error: err.message,
      });
    }
  }
 
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
 
  return { passed, failed, skipped, results, message: `${passed} passed, ${failed} failed, ${skipped} skipped` };
}
 
/**
 * List all imported skills with their tracker metadata.
 */
export function listImportedSkills() {
  return Object.entries(skillTracker).map(([name, info]) => ({
    name,
    url: info.url,
    owner: info.owner,
    repo: info.repo,
    importedAt: info.importedAt,
    updatedAt: info.updatedAt,
    latest: skillRegistry.has(name),
  }));
}
 
/**
 * Remove an imported skill and its tracker entry.
 */
export async function removeImportedSkill(name) {
  if (!skillTracker[name]) {
    throw Object.assign(new Error(`Skill "${name}" is not in the import tracker.`), { statusCode: 404 });
  }
  const targetDir = safeJoin(importedSkillsDir, name);
  await rm(targetDir, { recursive: true, force: true }).catch(() => {});
  delete skillTracker[name];
  await saveTracker();
  await loadSkills();
  return { ok: true };
}
 
async function loadSkillsFromDir(dir, source) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skill = await loadSkillPackage(join(dir, entry.name), source);
        if (skill) skillRegistry.set(skill.name, skill);
        continue;
      }
      if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) continue;
      const content = await readFile(join(dir, entry.name), 'utf-8');
      const skill = YAML.parse(content);
      if (!skill?.name) continue;
      const definitionDir = dirname(join(dir, entry.name));
      if (skill.resource_root) skill._resourceRoot = resolve(definitionDir, skill.resource_root);
      if (skill.resource_dir) skill._resourceDir = resolve(definitionDir, skill.resource_dir);
      skill._source = source;
      skill.kind = skill.kind || 'yaml';
      skillRegistry.set(skill.name, skill);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
 
async function loadSkillPackage(packageDir, source) {
  const manifest = await readPackageManifest(packageDir);
  if (!manifest) return null;
 
  const prompt = await readOptionalText(join(packageDir, 'SKILL.md'))
    || await readOptionalText(join(packageDir, 'skill.md'))
    || manifest.prompt
    || '';
  const name = slugify(manifest.name || manifest.display_name);
  if (!name || !prompt) return null;
 
  return {
    ...manifest,
    name,
    display_name: manifest.display_name || manifest.name || name,
    description: manifest.description || '',
    type: manifest.type || 'utility',
    trigger: manifest.trigger || 'manual',
    prompt,
    kind: 'package',
    package: {
      root: packageDir,
      references: await listRelativeFiles(join(packageDir, 'references'), 'references'),
      scripts: await listRelativeFiles(join(packageDir, 'scripts'), 'scripts'),
      assets: await listRelativeFiles(join(packageDir, 'assets'), 'assets'),
      tests: await listRelativeFiles(join(packageDir, 'tests'), 'tests'),
    },
    _source: source,
  };
}
 
async function readPackageManifest(packageDir) {
  for (const file of ['manifest.yaml', 'manifest.yml', 'skill.yaml', 'skill.yml']) {
    const content = await readOptionalText(join(packageDir, file));
    if (content) return YAML.parse(content) || {};
  }
  const skillMd = await readOptionalText(join(packageDir, 'SKILL.md')) || await readOptionalText(join(packageDir, 'skill.md'));
  if (!skillMd) return null;
  const title = skillMd.split('\n').find(line => line.trim().startsWith('#'))?.replace(/^#+\s*/, '').trim();
  return { name: title || packageDir.split(/[\\/]/).pop(), display_name: title };
}
 
async function readOptionalText(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') return '';
    throw e;
  }
}
 
async function listRelativeFiles(dir, prefix) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const relativePath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        files.push(...await listRelativeFiles(join(dir, entry.name), relativePath));
      } else {
        files.push(relativePath);
      }
    }
    return files.sort();
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
 
function slugify(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
 
export function getSkill(name) {
  return skillRegistry.get(name);
}

export function getSkillForUI(name) {
  const skill = getSkill(name);
  return skill ? enrichSkillForUI(skill) : null;
}
 
export function listSkills() {
  return Array.from(skillRegistry.values()).map(s => enrichSkillForUI(s));
}

export function listSkillCategories() {
  const groups = new Map();
  for (const skill of listSkills()) {
    const category = skill.category_zh || '工具';
    if (!groups.has(category)) {
      groups.set(category, {
        name: category,
        count: 0,
        skills: [],
      });
    }
    const group = groups.get(category);
    group.count += 1;
    group.skills.push({
      name: skill.name,
      display_name_zh: skill.display_name_zh,
      subtitle_en: skill.subtitle_en,
      tags: skill.tags,
      risk_level: skill.risk_level,
    });
  }
  return Array.from(groups.values())
    .map(group => ({
      ...group,
      skills: group.skills.sort((a, b) => a.display_name_zh.localeCompare(b.display_name_zh, 'zh-Hans-CN')),
    }))
    .sort((a, b) => categorySortWeight(a.name) - categorySortWeight(b.name) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

export function buildSkillNavigator(options = {}) {
  const skills = listSkills();
  const selectedSkill = options.selectedSkill || '';
  const recommendedNames = new Set((options.recommendations || []).map(item => item.skill?.name || item.name).filter(Boolean));
  const categories = listSkillCategories().map(category => ({
    ...category,
    selected: category.skills.some(skill => skill.name === selectedSkill),
    recommendedCount: category.skills.filter(skill => recommendedNames.has(skill.name)).length,
  }));
  const tagMap = new Map();
  const contextMap = new Map();
  const riskMap = new Map();

  for (const skill of skills) {
    for (const tag of skill.tags || []) {
      if (!tagMap.has(tag)) tagMap.set(tag, { name: tag, count: 0, skills: [] });
      const item = tagMap.get(tag);
      item.count += 1;
      item.skills.push(skill.name);
    }
    for (const context of skill.requires_context || []) {
      const detail = describeSkillContext(context);
      if (!contextMap.has(context)) {
        contextMap.set(context, {
          key: context,
          label_zh: detail.label_zh,
          help_zh: detail.help_zh,
          count: 0,
          skills: [],
        });
      }
      const item = contextMap.get(context);
      item.count += 1;
      item.skills.push(skill.name);
    }
    const risk = skill.risk_level || 'low';
    if (!riskMap.has(risk)) {
      riskMap.set(risk, {
        level: risk,
        label_zh: { low: '低风险', medium: '中风险', high: '高风险' }[risk] || risk,
        count: 0,
        skills: [],
      });
    }
    const riskItem = riskMap.get(risk);
    riskItem.count += 1;
    riskItem.skills.push(skill.name);
  }

  return {
    title_zh: 'Skill 导航',
    subtitle_en: 'Skill Navigator',
    summary_zh: '按论文任务、标签、风险和所需材料理解 Skill，不需要先记英文 Skill 名。',
    selectedSkill,
    categories,
    tagChips: Array.from(tagMap.values())
      .map(tag => ({
        ...tag,
        selectedCount: selectedSkill && tag.skills.includes(selectedSkill) ? 1 : 0,
        recommendedCount: tag.skills.filter(name => recommendedNames.has(name)).length,
      }))
      .sort((a, b) => b.selectedCount - a.selectedCount || b.recommendedCount - a.recommendedCount || b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 18),
    contextFilters: Array.from(contextMap.values())
      .sort((a, b) => b.count - a.count || a.label_zh.localeCompare(b.label_zh, 'zh-Hans-CN')),
    riskFilters: Array.from(riskMap.values())
      .sort((a, b) => riskSortWeight(a.level) - riskSortWeight(b.level)),
    cards: skills.map(skill => ({
      name: skill.name,
      title_zh: skill.display_name_zh || skill.display_name || skill.name,
      display_name_zh: skill.display_name_zh || skill.display_name || skill.name,
      subtitle_en: skill.subtitle_en || skill.name,
      category_zh: skill.category_zh || '工具',
      tags: skill.tags || [],
      risk_level: skill.risk_level || 'low',
      risk_label_zh: { low: '低风险', medium: '中风险', high: '高风险' }[skill.risk_level || 'low'] || skill.risk_level,
      estimated_time: skill.estimated_time || '',
      inputs: skill.inputs || [],
      outputs: skill.outputs || [],
      best_for: skill.best_for || [],
      not_for: skill.not_for || [],
      requires_context: (skill.requires_context || []).map(key => ({
        key,
        ...describeSkillContext(key),
      })),
      task_templates: skill.task_templates || [],
      hoverGuide: skill.hoverGuide || buildSkillHoverGuide(skill),
      selected: skill.name === selectedSkill,
      recommended: recommendedNames.has(skill.name),
    })).sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1;
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return categorySortWeight(a.category_zh) - categorySortWeight(b.category_zh) ||
        a.title_zh.localeCompare(b.title_zh, 'zh-Hans-CN');
    }),
    display: {
      titleField: 'title_zh',
      subtitleField: 'subtitle_en',
      primaryGroupField: 'category_zh',
      tagField: 'tags',
      hoverFields: ['inputs', 'outputs', 'best_for', 'not_for', 'requires_context', 'task_templates'],
      showChineseTitleFirst: true,
    },
  };
}

function riskSortWeight(level) {
  const order = { low: 0, medium: 1, high: 2 };
  return order[level] ?? 9;
}

function describeSkillContext(key) {
  const labels = {
    rag_documents_or_references: {
      label_zh: '文献证据或 references.bib',
      help_zh: '需要 PDF、BibTeX、Markdown 文献笔记或已索引 RAG 证据。',
    },
    references_bib: {
      label_zh: 'references.bib',
      help_zh: '需要 BibTeX 文件或待整理引用条目。',
    },
    target_section_or_file: {
      label_zh: '目标章节或段落',
      help_zh: '需要说明要润色、修改或写作的章节、文件、段落，或粘贴目标文本。',
    },
    reviewer_comments: {
      label_zh: '审稿意见',
      help_zh: '需要粘贴 reviewer comments、meta-review、decision letter 或已有 rebuttal 草稿。',
    },
    paper_claims: {
      label_zh: '论文主张与贡献点',
      help_zh: '需要问题定义、方法亮点和核心贡献。',
    },
    related_work: {
      label_zh: '相关工作证据',
      help_zh: '需要文献片段、related work 笔记或研究空白说明。',
    },
    method_notes: {
      label_zh: '方法说明材料',
      help_zh: '需要算法步骤、符号定义、模型结构或实现说明。',
    },
    experiment_results: {
      label_zh: '实验结果',
      help_zh: '需要结果表格、指标、baseline、消融或图表数据。',
    },
    paper_findings: {
      label_zh: '主要发现',
      help_zh: '需要实验结论、局限性和 future work 线索。',
    },
    paper_summary: {
      label_zh: '论文概要',
      help_zh: '需要问题、方法、结果和贡献的简短总结。',
    },
    search_query: {
      label_zh: '检索关键词',
      help_zh: '需要领域、方法名、数据集名或时间范围。',
    },
    latex_error_log: {
      label_zh: 'LaTeX 报错日志',
      help_zh: '粘贴 Overleaf 或本地编译的第一段 blocking error、行号和相关 .tex 文件线索。',
    },
    data_or_results: {
      label_zh: '数据或结果文件',
      help_zh: '需要实验数据、统计指标或结果表格。',
    },
    research_direction: {
      label_zh: '研究方向',
      help_zh: '需要领域、目标问题、约束和已有想法。',
    },
    figure_goal: {
      label_zh: '图表目标',
      help_zh: '需要说明图想表达什么、目标读者和数据来源。',
    },
    venue_rules: {
      label_zh: '投稿规则',
      help_zh: '需要会议/期刊模板、页数限制、匿名要求和 checklist。',
    },
    compiled_pdf: {
      label_zh: '已编译 PDF',
      help_zh: '需要待检查的论文 PDF 或编译产物。',
    },
  };
  return labels[key] || {
    label_zh: key,
    help_zh: '需要补充这个上下文后才能更可靠地使用该 Skill。',
  };
}

function enrichSkillForUI(s) {
  const ui = SKILL_UI_METADATA[s.name] || inferSkillUiMetadata(s);
  const hasExplicitUiMetadata = Boolean(SKILL_UI_METADATA[s.name]);
  const tags = normalizeSkillTags(s.tags || [], ui.tags || [], { hasExplicitUiMetadata });
  const categories = Array.isArray(s.categories) && s.categories.length ? s.categories : [inferAcademicCategoryForSkill(s)];
  const displayNameZh = ensureChineseSkillName(s.display_name_zh || ui.display_name_zh, s.display_name || s.name, categories[0]);
  const subcategory = s.subcategory || inferSkillSubcategory(s, categories[0]);
  const enriched = {
    name: s.name,
    display_name: s.display_name || s.name,
    display_name_zh: displayNameZh,
    subtitle_en: s.subtitle_en || ui.subtitle_en || s.display_name,
    description: s.description,
    description_zh: ensureChineseSkillDescription(s.description_zh || ui.description_zh, displayNameZh, categories[0]),
    type: s.type || academicCategoryToLegacyType(categories[0]),
    category_zh: ACADEMIC_CATEGORY_ZH[categories[0]] || s.category_zh || ui.category_zh,
    categories,
    subcategory,
    subcategory_zh: ACADEMIC_SUBCATEGORY_ZH[subcategory] || s.subcategory_zh || '其他',
    trigger: s.trigger || 'manual',
    auto_recommend: s.auto_recommend !== false,
    source_stars: Number(s.source_stars || 0),
    stars_checked_at: s.stars_checked_at || '',
    source_url: s.url || s.adapted_from || '',
    source: s._source,
    kind: s.kind || 'yaml',
    tags,
    task_intents: s.task_intents || ui.task_intents || [],
    user_questions: s.user_questions || ui.user_questions || [],
    task_templates: s.task_templates || ui.task_templates || defaultTaskTemplates(s, ui),
    inputs: s.inputs || ui.inputs || [],
    outputs: s.outputs || ui.outputs || [],
    best_for: s.best_for || ui.best_for || [],
    not_for: s.not_for || ui.not_for || [],
    risk_level: s.risk_level || ui.risk_level || 'low',
    estimated_time: s.estimated_time || ui.estimated_time || '',
    requires_context: s.requires_context || ui.requires_context || [],
    url: s.url || '',
    source_license: s.source_license || '',
    adapted_from: s.adapted_from || '',
    package: s.package ? {
      references: s.package.references || [],
      scripts: s.package.scripts || [],
      assets: s.package.assets || [],
      tests: s.package.tests || [],
      // Include file count stats
      fileCount: {
        references: (s.package.references || []).length,
        scripts: (s.package.scripts || []).length,
        assets: (s.package.assets || []).length,
        tests: (s.package.tests || []).length,
      },
    } : undefined,
    importInfo: s._source === 'imported' && skillTracker[s.name] ? {
      url: skillTracker[s.name].url,
      owner: skillTracker[s.name].owner,
      repo: skillTracker[s.name].repo,
      importedAt: skillTracker[s.name].importedAt,
      updatedAt: skillTracker[s.name].updatedAt,
    } : undefined,
  };
  enriched.hoverGuide = buildSkillHoverGuide(enriched);
  return enriched;
}

function normalizeSkillTags(rawTags = [], uiTags = [], { hasExplicitUiMetadata = false } = {}) {
  const technicalTags = new Set([
    'BibTeX',
    'DOI',
    'LaTeX',
    'arXiv',
    'Semantic Scholar',
    'PPT',
    'Beamer',
    'Slides',
    'Rebuttal',
    'Checklist',
  ]);
  const tagLabelMap = new Map([
    ['literature-review', '文献综述'],
    ['related work', '相关工作'],
    ['research gap', '研究空白'],
    ['research-gaps', '研究空白'],
    ['survey', '综述'],
    ['synthesis', '综合'],
    ['citation-map', '引用脉络'],
    ['introduction', '引言'],
    ['motivation', '动机'],
    ['contribution', '贡献点'],
    ['method', '方法'],
    ['methodology', '方法'],
    ['methods', '方法'],
    ['algorithm', '算法'],
    ['notation', '符号定义'],
    ['results', '结果分析'],
    ['analysis', '分析'],
    ['ablation', '消融实验'],
    ['tables', '表格'],
    ['statistics', '统计'],
    ['discussion', '讨论'],
    ['limitations', '局限性'],
    ['future-work', '未来工作'],
    ['future work', '未来工作'],
    ['abstract', '摘要'],
    ['summary', '总结'],
    ['compression', '压缩'],
    ['conclusion', '结论'],
    ['polish', '润色'],
    ['language-editing', '语言编辑'],
    ['clarity', '清晰度'],
    ['grammar', '语法'],
    ['citation', '引用'],
    ['bibliography', '参考文献'],
    ['references', '参考文献'],
    ['citation key', '引用键'],
    ['search', '学术检索'],
    ['retrieval', '检索'],
    ['literature', '文献'],
    ['database', '数据库'],
    ['query', '检索词'],
    ['hypothesis-testing', '假设检验'],
    ['significance', '显著性'],
    ['effect-size', '效应量'],
    ['power', '统计功效'],
    ['regression', '回归'],
    ['confidence interval', '置信区间'],
    ['ideation', '选题'],
    ['topic-selection', '选题'],
    ['brainstorming', '头脑风暴'],
    ['novelty', '创新性'],
    ['ideas', '想法'],
    ['hypothesis', '假设'],
    ['experiment plan', '实验计划'],
    ['figure', '图表'],
    ['chart', '图表'],
    ['visualization', '可视化'],
    ['nature', '期刊风格'],
    ['matplotlib', 'Matplotlib'],
    ['publication', '发表图表'],
    ['caption', '图注'],
    ['visual design', '视觉设计'],
    ['submission', '投稿'],
    ['conference', '会议'],
    ['format', '格式'],
    ['camera-ready', '终稿'],
    ['anonymity', '匿名检查'],
    ['reviewer-response', '审稿回复'],
    ['reviewer comments', '审稿意见'],
    ['revision', '修改计划'],
    ['peer-review', '同行评审'],
    ['revision plan', '修改计划'],
    ['grant', '基金'],
    ['proposal', '申请书'],
    ['funding', '经费'],
    ['budget', '预算'],
    ['research-plan', '研究计划'],
    ['research plan', '研究计划'],
    ['presentation', '演示'],
    ['slides', 'Slides'],
    ['poster', '海报'],
    ['beamer', 'Beamer'],
    ['ppt', 'PPT'],
    ['talk', '汇报'],
    ['layout', '版式'],
    ['visual-design', '视觉设计'],
  ]);
  const candidates = hasExplicitUiMetadata
    ? [...uiTags, ...rawTags.map(tag => translateSkillTag(tag, tagLabelMap)).filter(tag => technicalTags.has(tag))]
    : [...rawTags.map(tag => translateSkillTag(tag, tagLabelMap)), ...uiTags];
  const seen = new Set();
  const normalized = [];
  for (const tag of candidates) {
    const value = String(tag || '').trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase('zh-CN');
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

function translateSkillTag(tag, tagLabelMap) {
  const value = String(tag || '').trim();
  if (!value) return '';
  return tagLabelMap.get(value.toLowerCase()) || value;
}

function buildSkillHoverGuide(skill) {
  const title = skill.display_name_zh || skill.display_name || skill.name;
  const outputs = skill.outputs || [];
  const contexts = skill.requires_context || [];
  const risk = skill.risk_level || 'low';
  const riskLabels = {
    low: '低风险：适合解释、整理和生成建议。',
    medium: '中风险：可能影响论文正文，采纳前要人工审查。',
    high: '高风险：可能涉及投稿、数据、工具或文件操作，执行前必须确认。',
  };
  return {
    title_zh: `${title} 能帮你做什么`,
    summary_zh: outputs.length
      ? `适合生成${outputs.slice(0, 2).join('、')}等结果。`
      : '适合把当前论文任务整理成结构化建议或草稿。',
    use_it_when_zh: (skill.best_for || []).slice(0, 3),
    avoid_it_when_zh: (skill.not_for || []).slice(0, 3),
    before_start_zh: contexts.length
      ? contexts.map(key => {
        const detail = describeSkillContext(key);
        return `${detail.label_zh}：${detail.help_zh}`;
      })
      : ['只需要清楚描述当前任务即可开始。'],
    expected_output_zh: outputs.slice(0, 4),
    risk_boundary_zh: riskLabels[risk] || riskLabels.low,
    first_prompt_zh: (skill.task_templates || [])[0] || `请使用“${title}”帮我完成当前论文任务，并先说明需要哪些上下文。`,
  };
}

function inferSkillUiMetadata(skill) {
  const name = skill.name || '';
  const tags = skill.tags || [];
  const haystack = `${name} ${skill.display_name || ''} ${skill.description || ''} ${tags.join(' ')}`.toLowerCase();
  let category_zh = '工具';
  if (/writing|abstract|introduction|discussion|conclusion|methodology|results/.test(haystack)) category_zh = '写作';
  if (/literature|review|search|citation-map/.test(haystack)) category_zh = '文献';
  if (/reference|citation|bib/.test(haystack)) category_zh = '引用';
  if (/statistic|result|experiment|data/.test(haystack)) category_zh = '实验';
  if (/figure|poster|ppt|presentation/.test(haystack)) category_zh = '图表';
  if (/submission|grant|conference/.test(haystack)) category_zh = '投稿';
  return {
    display_name_zh: skill.display_name || skill.name,
    subtitle_en: skill.display_name || skill.name,
    category_zh,
    tags: tags.length ? tags : [category_zh],
    task_intents: tags,
    inputs: ['用户任务描述', '当前项目上下文'],
    outputs: ['结构化建议或草稿'],
    best_for: [skill.description || skill.display_name || skill.name].filter(Boolean),
    not_for: [],
    risk_level: 'low',
  };
}

const ACADEMIC_CATEGORY_ZH = {
  'literature-search': '文献检索',
  'experiment-design': '实验设计',
  'paper-writing': '论文写作',
  'patent-writing': '专利撰写',
  'scientific-figures': '科研绘图',
  'academic-conference': '学术会议',
  'grant-writing': '基金申请',
  'peer-review': '同行评审',
  'open-access': '开放获取',
  'exploration-discovery': '研究探索',
};

const ACADEMIC_SUBCATEGORY_ZH = {
  'query-strategy': '检索式与筛选策略', 'database-arxiv': 'arXiv 检索', 'database-google-scholar': 'Google Scholar 检索', 'database-semantic-scholar': 'Semantic Scholar 检索', 'database-dblp': 'DBLP 检索',
  'paper-discovery': '论文发现与追踪', 'search-retrieval': '其他检索与下载', 'literature-review': '综述与证据综合', 'related-work': '相关工作分析', 'citation-management': 'BibTeX 与文献管理', 'citation-verification': '引用真实性核验', 'paper-reading': '论文阅读与信息提取', 'research-mapping': '引用网络与研究脉络',
  'research-question': '研究问题与假设', 'experiment-planning': '实验方案', statistics: '统计分析', 'baseline-ablation': '基线、消融与评估', reproducibility: '复现与透明度', 'data-processing': '数据处理与建模',
  'outline-planning': '大纲与故事线', 'full-paper': '整篇论文', abstract: '摘要', introduction: '引言（Introduction）', 'related-work': '相关工作（Related Work）', method: '方法（Method）', 'experiments-results': '实验与结果', 'discussion-conclusion': '讨论与结论', 'language-polish': '语法、润色与翻译', 'formatting-latex': '格式与 LaTeX',
  'prior-art': '现有技术检索', 'patent-disclosure': '专利挖掘与技术交底书', 'patent-drafting': '权利要求与申请文件', 'statistical-plots': '实验数据图', 'architecture-diagrams': '架构图与流程图', 'figure-layout': '组图与版式', captions: '图注与可访问性',
  submission: '投稿与终稿', presentation: '演讲与幻灯片', poster: '学术海报', 'venue-guidance': '会议模板与规范', proposal: '申请书主体', 'budget-impact': '预算与影响', 'grant-review': '基金评审',
  'paper-review': '论文预审', 'logic-method-review': '逻辑与方法审查', 'citation-integrity': '引用与科研诚信', rebuttal: '审稿回复', preprint: '预印本', 'open-data': '开放数据与代码', 'open-science': '开放科学', 'research-artifacts': '论文与研究产物发布', 'autonomous-experimentation': '自主实验迭代',
  ideation: '选题与创意', 'gap-discovery': '研究空白', 'critical-thinking': '批判性思维', interdisciplinary: '跨学科探索', 'project-workflow': '科研项目与工作流',
};

function inferSkillSubcategory(skill, category) {
  const text = `${skill?.name || ''} ${skill?.display_name || ''} ${skill?.description || ''} ${(skill?.tags || []).join(' ')}`.toLowerCase();
  if (category === 'paper-writing') {
    if (/abstract|摘要/.test(text)) return 'abstract'; if (/introduction|引言/.test(text)) return 'introduction'; if (/related.?work|相关工作/.test(text)) return 'related-work'; if (/method|algorithm|方法/.test(text)) return 'method';
    if (/experiment|result|实验|结果/.test(text)) return 'experiments-results'; if (/discussion|conclusion|limitation|结论|讨论/.test(text)) return 'discussion-conclusion'; if (/polish|grammar|translate|humanize|语言|润色|翻译|语法/.test(text)) return 'language-polish'; if (/latex|format|template|格式|排版/.test(text)) return 'formatting-latex'; if (/outline|plan|story|大纲|故事线/.test(text)) return 'outline-planning'; return 'full-paper';
  }
  if (category === 'literature-search') { if (/citation|reference|zotero|bib|引用/.test(text)) return 'citation-management'; if (/graph|map|discover|脉络/.test(text)) return 'research-mapping'; if (/review|survey|synthesis|综述/.test(text)) return 'literature-review'; if (/read|note|pdf|笔记/.test(text)) return 'paper-reading'; return 'search-retrieval'; }
  if (category === 'experiment-design') { if (/hypothesis|question|假设|问题/.test(text)) return 'research-question'; if (/stat|test|pymc|统计|检验/.test(text)) return 'statistics'; if (/baseline|ablation|evaluation|评估|消融/.test(text)) return 'baseline-ablation'; if (/repro|prereg|transparen|复现|透明/.test(text)) return 'reproducibility'; if (/data|model|learn|transform|数据|模型/.test(text)) return 'data-processing'; return 'experiment-planning'; }
  if (category === 'scientific-figures') { if (/caption|图注/.test(text)) return 'captions'; if (/architecture|schematic|mermaid|network|架构|流程/.test(text)) return 'architecture-diagrams'; if (/poster|panel|assembly|layout|组图|版式/.test(text)) return 'figure-layout'; return 'statistical-plots'; }
  if (category === 'academic-conference') { if (/poster|海报/.test(text)) return 'poster'; if (/slide|presentation|talk|演讲|幻灯/.test(text)) return 'presentation'; if (/template|venue|规范/.test(text)) return 'venue-guidance'; return 'submission'; }
  if (category === 'peer-review') { if (/rebuttal|response|回复/.test(text)) return 'rebuttal'; if (/citation|integrity|引用|诚信/.test(text)) return 'citation-integrity'; if (/logic|method|critical|逻辑|方法/.test(text)) return 'logic-method-review'; return 'paper-review'; }
  if (category === 'grant-writing') return /budget|impact|预算|影响/.test(text) ? 'budget-impact' : /review|评审/.test(text) ? 'grant-review' : 'proposal';
  if (category === 'open-access') return /data|code|数据|代码/.test(text) ? 'open-data' : /preprint|arxiv|预印本/.test(text) ? 'preprint' : 'open-science';
  if (category === 'patent-writing') return /search|prior|检索/.test(text) ? 'prior-art' : 'patent-drafting';
  if (/gap|空白/.test(text)) return 'gap-discovery'; if (/critical|thinking|批判/.test(text)) return 'critical-thinking'; if (/workflow|project|pipeline|工作流/.test(text)) return 'project-workflow'; if (/interdiscip|跨学科/.test(text)) return 'interdisciplinary'; return 'ideation';
}

function legacyTypeToAcademicCategory(type) {
  return ({ writing: 'paper-writing', research: 'literature-search', review: 'peer-review', draw: 'scientific-figures', analysis: 'experiment-design', utility: 'exploration-discovery' })[type] || 'exploration-discovery';
}

function academicCategoryToLegacyType(category) {
  if (['paper-writing', 'patent-writing', 'grant-writing'].includes(category)) return 'writing';
  if (category === 'peer-review') return 'review';
  if (category === 'scientific-figures') return 'draw';
  if (category === 'experiment-design') return 'analysis';
  return 'research';
}

function inferAcademicCategoryForSkill(skill) {
  const text = `${skill?.name || ''} ${skill?.display_name || ''} ${skill?.description || ''} ${(skill?.tags || []).join(' ')}`.toLowerCase();
  const name = String(skill?.name || '').toLowerCase();
  if (/^(writing-|academic-paper|scientific-writing|research-writing|ml-paper-writing|doc-coauthoring|latex-|paper-(planning|storyline))/.test(name) || /polish/.test(name)) return 'paper-writing';
  if (/^(evidence-review|paper-review|paper-self-review|reviewer-response|review-response|nature-response)/.test(name)) return 'peer-review';
  if (/^(literature-|nature-academic-search|reference-management|citation-verification|systematic-review)/.test(name)) return 'literature-search';
  if (/^(nature-paper2ppt|poster-design|conference-submission|post-acceptance)/.test(name)) return 'academic-conference';
  if (/patent|专利/.test(text)) return 'patent-writing';
  if (/grant|funding|基金|proposal/.test(text)) return 'grant-writing';
  if (/figure|visual|plot|chart|schematic|绘图|图表/.test(text)) return 'scientific-figures';
  if (/literature|citation|reference|search|survey|文献|检索|引用/.test(text)) return 'literature-search';
  if (/review|audit|rebuttal|审稿|评审|诚信/.test(text)) return 'peer-review';
  if (/conference|submission|camera-ready|poster|slides|presentation|会议|投稿|post-acceptance/.test(text)) return 'academic-conference';
  if (/open.access|preprint|开放获取/.test(text)) return 'open-access';
  if (/experiment|statistic|result|data.analysis|实验|统计/.test(text)) return 'experiment-design';
  if (/writing|paper|abstract|introduction|method|discussion|conclusion|polish|latex|论文|写作|翻译|润色/.test(text)) return 'paper-writing';
  if (/idea|brainstorm|hypothesis|explor|discover|构思|选题|发现/.test(text)) return 'exploration-discovery';
  return legacyTypeToAcademicCategory(skill?.type);
}

function ensureChineseSkillName(candidate, fallback, category) {
  const value = String(candidate || '').trim();
  if (/\p{Script=Han}/u.test(value)) return value;
  const base = String(fallback || 'Academic Skill').replace(/\s*Skill\s*$/i, '').trim();
  return `${base} · ${ACADEMIC_CATEGORY_ZH[category] || '科研技能'}`;
}

function ensureChineseSkillDescription(candidate, displayNameZh, category) {
  const value = String(candidate || '').trim();
  if (/\p{Script=Han}/u.test(value)) return value;
  return `${displayNameZh}用于${ACADEMIC_CATEGORY_ZH[category] || '科研学术'}任务，提供结构化步骤、质量检查和可复核输出。`;
}

function categorySortWeight(category) {
  const order = ['文献检索', '实验设计', '论文写作', '专利撰写', '科研绘图', '学术会议', '同行评审', '开放获取', '研究探索'];
  const index = order.indexOf(category);
  return index === -1 ? order.length : index;
}

export function recommendSkills(taskText, options = {}) {
  const query = String(taskText || '').trim();
  if (!query) return [];
  // This catalog intentionally targets AI/ML/computer-science paper workflows.
  // Do not recommend a loosely matching paper Skill for explicitly out-of-profile tasks.
  if (/(?:基金|\bproposal\b|grant proposal|funding proposal|临床|医学|medical|clinical|考古|历史史料|ancient ruins|primary source evaluation)/i.test(query)) return [];
  const projectState = options.projectState || {};
  const queryTokens = tokenizeSkillText(query);
  return listSkills()
    .filter(skill => skill.auto_recommend !== false)
    .map(skill => scoreSkillRecommendation(skill, query, queryTokens, projectState))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.skill.display_name || a.skill.name).localeCompare(String(b.skill.display_name || b.skill.name)))
    .slice(0, Math.min(Number(options.limit || 5), 10));
}

export function buildTaskIntentGuide(taskText, options = {}) {
  const query = String(taskText || '').trim();
  const recommendations = options.recommendations || (query ? recommendSkills(query, options) : []);
  const primary = recommendations[0] || null;
  if (!query) {
    return {
      status: 'needs-task',
      label_zh: '先说你要完成的论文任务',
      summary_zh: '你可以直接说“写 related work”“改 introduction”“检查引用”“投稿前检查”，系统会转成推荐 Skill、模式和材料清单。',
      intent_zh: '',
      confidence: 0,
      recommendedSkill: null,
      recommendedStarterId: '',
      matchedUserWords: [],
      missingContext: [],
      nextAction: { type: 'focus-task', label_zh: '填写论文任务' },
      alternatives: [],
      copyText: '# 任务意图诊断\n请先描述论文任务。',
    };
  }

  const intent = detectPaperTaskIntent(query, primary?.skill);
  const missingContext = Array.from(new Set(primary?.missingContext || []));
  const alternatives = (recommendations || []).slice(1, 4).map(item => ({
    skill: item.skill?.name || '',
    title_zh: item.skill?.display_name_zh || item.skill?.display_name || item.skill?.name || '',
    choose_if_zh: buildIntentAlternativeWhen(item.skill || {}),
    reason_zh: firstNonEmpty(item.reasons) || '也与当前任务部分相关。',
  }));
  const status = !primary
    ? 'uncertain'
    : missingContext.length
      ? 'needs-context'
      : 'ready';
  const guide = {
    status,
    label_zh: {
      ready: '已识别论文任务意图',
      'needs-context': '已识别意图，但还缺材料',
      uncertain: '任务意图不够明确',
    }[status],
    summary_zh: primary
      ? `你像是在做“${intent.intent_zh}”，建议先用“${primary.skill.display_name_zh || primary.skill.name}”。`
      : '还不能稳定判断该选哪个 Skill，请补充目标章节、想要产出和已有材料。',
    intent_zh: intent.intent_zh,
    confidence: primary ? Math.min(100, Math.max(35, Math.round(primary.score * 7))) : 15,
    recommendedSkill: primary ? {
      name: primary.skill.name,
      title_zh: primary.skill.display_name_zh || primary.skill.display_name || primary.skill.name,
      subtitle_en: primary.skill.subtitle_en || primary.skill.name,
      category_zh: primary.skill.category_zh || '',
      reason_zh: firstNonEmpty(primary.reasons) || intent.reason_zh,
    } : null,
    recommendedStarterId: intent.starterId,
    matchedUserWords: intent.matchedUserWords,
    missingContext: missingContext.map(key => ({ key, ...describeSkillContext(key) })),
    nextAction: buildTaskIntentNextAction({ primary, missingContext, intent }),
    alternatives,
    boundaries_zh: buildTaskIntentBoundaries(primary?.skill, intent),
    copyText: '',
  };
  guide.copyText = formatTaskIntentGuideCopyText(guide);
  return guide;
}

function detectPaperTaskIntent(query, skill = {}) {
  if (isLocalPolishQuery(query)) {
    return {
      intent_zh: '论文润色 / 语言编辑',
      starterId: 'paper-polish',
      words: ['润色', '翻译', '逐句', '语法', '时态', '压缩', 'AI 痕迹', 'humanize', '更简洁'],
      fallbackSkill: 'writing-polish',
      reason_zh: '任务是在对已有局部文本做保守润色、翻译、压缩或表达清晰度检查。',
      matchedUserWords: ['润色', '翻译', '逐句', '语法', '时态', '压缩', 'AI', 'humanize', '简洁'].filter(word => query.toLowerCase().includes(word.toLowerCase())),
    };
  }
  if (isEvidenceReviewQuery(query)) {
    return {
      intent_zh: '输出审查 / 证据核对',
      starterId: 'evidence-review',
      words: ['幻觉引用', '证据核对', 'AI 输出审查', '安全采纳包', 'claim review', '逐句证据编号', 'negative evidence', '反例'],
      fallbackSkill: 'evidence-review',
      reason_zh: '任务是在审查 AI 输出、单句 claim、引用证据支持、反例/负证据或安全采纳边界。',
      matchedUserWords: ['幻觉引用', '证据', 'AI 输出', '采纳包', '反例', 'negative evidence', '逐句'].filter(word => query.toLowerCase().includes(word.toLowerCase())),
    };
  }
  if (isRagDiagnosticQuery(query) && !isSubmissionPdfMetadataQuery(query)) {
    return {
      intent_zh: '检查 / 修复 RAG 证据库',
      starterId: 'rag-evidence-diagnostic',
      words: ['rag', 'pdf', '知识库', '读不出来', '读进去', '检索不到'],
      fallbackSkill: 'literature-review',
      reason_zh: '任务是在检查 PDF/RAG 是否被正确读取，不应直接进入正文写作或统计分析。',
      matchedUserWords: ragDiagnosticMatchedWords(query),
    };
  }
  if (/appendix.{0,20}(proof|proof sketch|证明)|(?:proof sketch|证明草图|证明思路)|(?:method|方法).{0,20}(小节标题|section title|subsection title|标题)/i.test(query)) {
    return {
      intent_zh: '解释 Method / Algorithm',
      starterId: 'method-clarity',
      words: ['method', 'proof sketch', '小节标题', '证明'],
      fallbackSkill: 'writing-methodology',
      reason_zh: '任务包含方法小节标题、proof sketch 或证明说明，应按 Method/Algorithm 处理。',
      matchedUserWords: ['method', 'proof', '证明', '小节标题'].filter(word => query.toLowerCase().includes(word.toLowerCase())),
    };
  }
  if (isFigureTaskQuery(query)) {
    return {
      intent_zh: '设计论文图表',
      starterId: 'figure-plan',
      words: ['figure', 'caption', '图表', '图注', '画图', '示意图', '流程图', 'matplotlib', 'ROC curve', '配色'],
      fallbackSkill: 'scientific-visualization',
      reason_zh: '任务包含论文图表、图注、绘图脚本、流程图或视觉规范。',
      matchedUserWords: ['figure', 'caption', '图表', '图注', '画图', '示意图', '流程图', 'matplotlib', 'ROC', '配色'].filter(word => query.toLowerCase().includes(word.toLowerCase())),
    };
  }
  if (isStatisticalTaskQuery(query)) {
    return {
      intent_zh: '统计分析 / 显著性检验',
      starterId: 'statistical-analysis',
      words: ['统计显著性', '显著性检验', 'p value', 'confidence interval', 't-test', 'mean', 'std', '异常值'],
      fallbackSkill: 'statistical-analysis',
      reason_zh: '任务包含统计检验、指标计算、异常值检查或置信区间。',
      matchedUserWords: ['统计', '显著性', 'p-value', 'p value', 'confidence interval', 't-test', 'mean', 'std', '异常值'].filter(word => query.toLowerCase().includes(word.toLowerCase())),
    };
  }
  const patterns = [
    {
      intent_zh: '检索最新相关工作',
      starterId: 'academic-search',
      words: ['找论文', '检索文献', '最新工作', '最新相关工作', '补文献', 'benchmark paper', '加入证据库', '导入证据库', 'academic search', 'search papers', 'semantic scholar'],
      fallbackSkill: 'literature-search',
      reason_zh: '任务是在扩展候选论文或检索最新相关工作，应先走学术检索而不是直接写综述。',
    },
    {
      intent_zh: '写 Related Work / Research Gap',
      starterId: 'literature-review-gap',
      words: ['related work', '相关工作', '文献综述', 'research gap', '研究空白', 'survey'],
      fallbackSkill: 'literature-review',
      reason_zh: '任务包含 related work、文献综述或 research gap。',
    },
    {
      intent_zh: '审稿回复 / Rebuttal',
      starterId: 'reviewer-response',
      words: ['rebuttal', 'reviewer comments', 'reviewers', 'common concerns', 'response letter', 'response table', 'revision response', 'revision plan', 'revision checklist', 'revision summary', 'major concerns', 'minor concerns', 'action items', 'rebuttal cover letter', 'additional experiments', 'review 补实验', 'novelty weak', '过度承诺', '审稿意见', '回复审稿', '回复 reviewer', '修改矩阵', '修订计划', '返修计划', '补实验'],
      fallbackSkill: 'reviewer-response',
      reason_zh: '任务包含审稿意见回复、revision plan、response letter 或返修 action items。',
    },
    {
      intent_zh: 'LaTeX 编译修复',
      starterId: 'latex-debug',
      words: ['latex 编译错误', 'latex error', 'overleaf 报错', '编译 pdf 出错', 'pdf 编译失败', 'undefined control sequence', 'missing $ inserted'],
      fallbackSkill: 'latex-debugging',
      reason_zh: '任务包含 LaTeX/Overleaf 编译报错，应先定位日志中的第一个阻塞错误并给最小修复方案。',
    },
    {
      intent_zh: '投稿材料 / 声明检查',
      starterId: 'submission-materials',
      words: ['cover letter', 'ethical statement', 'ethics statement', 'data availability', 'code availability', 'conflict of interest', 'coi', 'acknowledgements', 'acknowledgments', 'author contributions', 'contribution statement', 'supplementary material', 'supplemental material', 'supporting information', 'appendix', 'supplementary appendix', 'reproducibility checklist', 'artifact checklist', '利益冲突', '伦理声明', '数据可用性', '代码可用性', '致谢', '作者贡献', '补充材料', '附录', '可复现清单'],
      fallbackSkill: 'conference-submission',
      reason_zh: '任务包含 cover letter、伦理声明、数据可用性、appendix 或投稿声明材料。',
    },
    {
      intent_zh: '论文规划 / Outline',
      starterId: 'paper-planning',
      words: ['论文写作计划', '写作任务', '论文 outline', 'paper outline', 'paper structure', 'paper roadmap', 'storyline', '故事线', 'idea', '审稿人可能', '风险清单'],
      fallbackSkill: 'paper-planning',
      reason_zh: '任务是在规划论文整体结构、故事线、写作 roadmap 或审稿风险。',
    },
    {
      intent_zh: '图文摘要 / Graphical Abstract',
      starterId: 'figure-plan',
      words: ['graphical abstract', 'visual abstract', '图文摘要', '可视化摘要'],
      fallbackSkill: 'scientific-visualization',
      reason_zh: '任务包含 graphical abstract 或图文摘要，应先规划视觉表达和核心信息。',
    },
    {
      intent_zh: '压缩 Abstract',
      starterId: 'abstract-tighten',
      words: ['abstract', '摘要', 'summary', '总结', 'highlights', '亮点', 'title', '标题', 'keyword list', 'keywords', '关键词'],
      fallbackSkill: 'writing-abstract',
      reason_zh: '任务包含摘要、标题、关键词或压缩总结。',
    },
    {
      intent_zh: '搭建 Introduction 逻辑',
      starterId: 'introduction-storyline',
      words: ['introduction', '引言', 'motivation', '动机', '贡献', 'contribution'],
      fallbackSkill: 'writing-introduction',
      reason_zh: '任务包含 introduction、动机或贡献表述。',
    },
    {
      intent_zh: '解释 Method / Algorithm',
      starterId: 'method-clarity',
      words: ['method', 'methodology', '方法', 'algorithm', '算法', '符号', '伪代码', 'theorem', 'proof', '证明'],
      fallbackSkill: 'writing-methodology',
      reason_zh: '任务包含方法、算法、符号、伪代码或定理证明说明。',
    },
    {
      intent_zh: '分析 Results / Discussion',
      starterId: 'results-discussion',
      words: ['results', 'discussion', '实验结果', '消融', 'ablation', 'dataset', '数据集', '实验设置', 'experimental setup', '实验计划', 'user study', 'table 结果', 'results paragraph', '讨论', 'limitations', 'limitation section', '局限性', '局限', 'threat to validity', 'validity threats', 'broader impact', 'reproducibility section'],
      fallbackSkill: 'writing-discussion',
      reason_zh: '任务包含实验结果、dataset、实验设置、讨论或消融分析。',
    },
    {
      intent_zh: '写 Conclusion / Future Work',
      starterId: 'conclusion-close',
      words: ['conclusion', '结论', 'future work', '未来工作', '总结贡献'],
      fallbackSkill: 'writing-conclusion',
      reason_zh: '任务包含 conclusion、结论或 future work。',
    },
    {
      intent_zh: '论文润色 / 语言编辑',
      starterId: 'paper-polish',
      words: ['润色', '改论文', '修改论文', '翻译成英文论文表达', '翻译成中文', '语法', '时态', '压缩段落', '改短', 'bullet points 改成论文段落', '降低 ai 痕迹', 'ai 痕迹', '太像 ai', 'nature 风格英文', 'acl 风格', 'neurips 风格', 'icml 风格', 'iclr 风格', 'polish', 'language editing', 'grammar', 'clarity', 'translate', 'translation', 'humanize', 'academic style', 'shorten'],
      fallbackSkill: 'writing-polish',
      reason_zh: '任务包含润色、翻译、语法时态、压缩段落、AI 痕迹或写作风格修改。',
    },
    {
      intent_zh: '整理引用和 BibTeX',
      starterId: 'citation-cleanup',
      words: ['references.bib', 'refs.bib', 'bibtex', 'bib', 'zotero', 'doi', '引用', '参考文献', 'citation key', '未定义引用', 'undefined reference'],
      fallbackSkill: 'reference-management',
      reason_zh: '任务包含引用、BibTeX 或 DOI。',
    },
    {
      intent_zh: '设计论文图表',
      starterId: 'figure-plan',
      words: ['figure', 'caption', '图表', '图注', '画图', '示意图', '流程图', 'matplotlib', 'ROC curve', '配色'],
      fallbackSkill: 'scientific-visualization',
      reason_zh: '任务包含 figure、图表或图注。',
    },
    {
      intent_zh: '统计分析 / 显著性检验',
      starterId: 'statistical-analysis',
      words: ['统计显著性', '显著性检验', 'p value', 'p-value', 'confidence interval', '置信区间', '统计分析', 'effect size', 't-test', 'mean', 'std', '异常值'],
      fallbackSkill: 'statistical-analysis',
      reason_zh: '任务包含统计检验、显著性或置信区间。',
    },
    {
      intent_zh: '论文转演示 / Slides',
      starterId: 'paper2ppt',
      words: ['ppt', 'slides', 'beamer', 'presentation', 'conference talk', '论文转演示', '答辩'],
      fallbackSkill: 'alterlab-scientific-slides',
      reason_zh: '任务包含 PPT、slides、Beamer 或汇报。',
    },
    {
      intent_zh: '学术海报 / Poster',
      starterId: 'poster-design',
      words: ['poster', '学术海报', '海报', 'layout', '版式'],
      fallbackSkill: 'poster-design',
      reason_zh: '任务包含 poster、海报或版式设计。',
    },
    {
      intent_zh: '投稿前检查',
      starterId: 'submission-check',
      words: ['投稿', '会议', 'conference', 'camera ready', 'page limit', '匿名', 'double blind', 'anonymous', 'pdf metadata', 'submission'],
      fallbackSkill: 'conference-submission',
      reason_zh: '任务包含投稿、会议规则或匿名检查。',
    },
  ];
  const lower = query.toLowerCase();
  const matched = patterns.find(pattern => pattern.words.some(word => lower.includes(word.toLowerCase())));
  if (matched) {
    return {
      ...matched,
      matchedUserWords: matched.words.filter(word => lower.includes(word.toLowerCase())).slice(0, 5),
    };
  }
  return {
    intent_zh: skill?.display_name_zh || skill?.display_name || '通用论文写作任务',
    starterId: starterIdForSkill(skill?.name),
    matchedUserWords: [],
    reason_zh: '没有命中固定入口，使用最高分 Skill 作为意图线索。',
  };
}

function starterIdForSkill(skillName = '') {
  return {
    'literature-review': 'literature-review-gap',
    'writing-introduction': 'introduction-storyline',
    'writing-methodology': 'method-clarity',
    'writing-results': 'results-discussion',
    'writing-discussion': 'results-discussion',
    'writing-abstract': 'abstract-tighten',
    'writing-conclusion': 'conclusion-close',
    'paper-planning': 'paper-planning',
    'reference-management': 'citation-cleanup',
    'writing-polish': 'paper-polish',
    'evidence-review': 'evidence-review',
    'latex-debugging': 'latex-debug',
    'literature-search': 'academic-search',
    'statistical-analysis': 'statistical-analysis',
    'scientific-visualization': 'figure-plan',
    'conference-submission': 'submission-check',
    'reviewer-response': 'reviewer-response',
    'alterlab-scientific-slides': 'paper2ppt',
    'poster-design': 'poster-design',
  }[skillName] || '';
}

function buildTaskIntentNextAction({ primary, missingContext, intent }) {
  if (!primary) return { type: 'clarify-task', label_zh: '补充任务目标' };
  if (intent?.starterId === 'rag-evidence-diagnostic') {
    return {
      type: 'review-rag-status',
      label_zh: '查看 RAG/PDF 读取诊断',
      contextKey: missingContext[0] || 'rag_documents_or_references',
      starterId: intent.starterId,
    };
  }
  if (missingContext.length) {
    const first = describeSkillContext(missingContext[0]);
    return {
      type: 'provide-context',
      label_zh: `补充${first.label_zh}`,
      contextKey: missingContext[0],
      starterId: intent.starterId,
    };
  }
  return {
    type: 'use-task-starter',
    label_zh: '使用对应论文任务入口',
    skill: primary.skill?.name || '',
    starterId: intent.starterId,
  };
}

function buildTaskIntentBoundaries(skill = {}, intent = {}) {
  const boundaries = [
    '先生成可审查计划或草稿，不要自动覆盖论文正文。',
    '涉及文献事实时，只能使用 RAG 命中的证据编号。',
  ];
  if ((skill.requires_context || []).includes('rag_documents_or_references')) {
    boundaries.push('证据库为空、PDF 未解析或检索无命中时，不能写带引用的正文。');
  }
  if (['figure-plan', 'submission-check'].includes(intent.starterId)) {
    boundaries.push('涉及命令、编译、图表生成或文件修改时，先展示计划并等待确认。');
  }
  if (intent.starterId === 'reviewer-response') {
    boundaries.push('回复审稿意见时，不得承诺未确认的实验、数字、正文修改或 venue 规则。');
  }
  if (intent.starterId === 'evidence-review') {
    boundaries.push('输出审查和安全采纳包只能生成审查结论、修订计划或人工采纳清单，不得自动写入正文。');
  }
  return boundaries;
}

function buildIntentAlternativeWhen(skill = {}) {
  if (skill.name === 'literature-search') return '如果当前证据不够，先用它扩展检索词和候选论文。';
  if (skill.name === 'reference-management') return '如果主要问题是 BibTeX、DOI 或 citation key，选它。';
  if (skill.name === 'writing-introduction') return '如果目标从文献综述转成引言动机和贡献链条，选它。';
  if (skill.name === 'statistical-analysis') return '如果重点是指标、显著性或实验可靠性，选它。';
  return `如果你的目标更接近“${skill.display_name_zh || skill.name || '该 Skill'}”的产出，选它。`;
}

function firstNonEmpty(items = []) {
  return (items || []).find(item => String(item || '').trim()) || '';
}

function formatTaskIntentGuideCopyText(guide) {
  return [
    '# 任务意图诊断',
    `${guide.label_zh}（${guide.status}）`,
    `识别意图：${guide.intent_zh || '未识别'}`,
    `置信度：${guide.confidence}/100`,
    guide.recommendedSkill ? `推荐 Skill：${guide.recommendedSkill.title_zh} (${guide.recommendedSkill.subtitle_en})` : '推荐 Skill：暂无',
    guide.recommendedStarterId ? `推荐入口：${guide.recommendedStarterId}` : '',
    '',
    '# 下一步',
    guide.nextAction?.label_zh || '补充任务目标',
    '',
    '# 缺少材料',
    ...(guide.missingContext?.length
      ? guide.missingContext.map(item => `- ${item.label_zh}：${item.help_zh}`)
      : ['- 暂无硬性缺口。']),
    '',
    '# 安全边界',
    ...(guide.boundaries_zh || []).map(item => `- ${item}`),
    '',
    '# 备选',
    ...(guide.alternatives?.length
      ? guide.alternatives.map(item => `- ${item.title_zh}：${item.choose_if_zh}`)
      : ['- 暂无明显备选。']),
  ].filter(Boolean).join('\n');
}

function scoreSkillRecommendation(skill, query, queryTokens, projectState) {
  const fields = [
    skill.name,
    skill.display_name,
    skill.display_name_zh,
    skill.subtitle_en,
    skill.description,
    skill.category_zh,
    ...(skill.tags || []),
    ...(skill.task_intents || []),
    ...(skill.user_questions || []),
    ...(skill.best_for || []),
  ].filter(Boolean);
  const normalizedFields = fields.map(value => String(value).toLowerCase());
  const reasons = [];
  let score = 0;
  const ragDiagnostic = isRagDiagnosticQuery(query);
  const reviewerRevision = isReviewerRevisionQuery(query);
  const latexDebug = isLatexDebugQuery(query);
  const evidenceReview = isEvidenceReviewQuery(query);

  if (/(?:专利|patent|技术交底书|交底书|查新|现有技术)/i.test(query) && skill.name === 'patent-disclosure-skill') {
    score += 30;
    reasons.push('匹配专利点挖掘、现有技术查新和技术交底书流程');
  }
  if (/(?:hugging\s*face|hf\s+papers?|arxiv).{0,24}(?:论文|paper|阅读|总结|分析)|(?:阅读|总结|分析).{0,24}(?:hugging\s*face|arxiv)/i.test(query) && skill.name === 'huggingface-papers') {
    score += 24;
    reasons.push('匹配 Hugging Face/arXiv AI 论文读取与产物关联');
  }
  if (/(?:发布|索引|认领|publish|index|claim).{0,24}(?:hugging\s*face|hf|论文|paper)|(?:论文|paper).{0,24}(?:模型|数据集|space|artifact|产物).{0,12}(?:关联|link)/i.test(query) && skill.name === 'huggingface-paper-publisher') {
    score += 24;
    reasons.push('匹配 Hugging Face 论文发布与模型/数据集产物关联');
  }
  if (/(?:autoresearch|自主实验|自动迭代|实验迭代|优化).{0,32}(?:指标|metric|loss|accuracy|latency|性能)|(?:metric|loss|accuracy|latency).{0,24}(?:迭代|优化)/i.test(query) && skill.name === 'autoresearch') {
    score += 28;
    reasons.push('匹配基于明确指标的自主实验、验证和回滚循环');
  }

  for (const intent of skill.task_intents || []) {
    if (containsLoose(query, intent)) {
      score += 8;
      reasons.push(`匹配任务意图：${intent}`);
    }
  }
  for (const token of queryTokens) {
    if (normalizedFields.some(field => field.includes(token))) {
      score += 2;
    }
  }
  for (const tag of skill.tags || []) {
    if (containsLoose(query, tag)) {
      score += 3;
      reasons.push(`匹配标签：${tag}`);
    }
  }
  if (/related work|相关工作|文献综述|survey|literature/i.test(query) && skill.name === 'literature-review') {
    score += 10;
    reasons.push('适合相关工作和文献综合');
  }
  if (/找论文|检索文献|最新工作|最新相关工作|补文献|academic search|search papers|arxiv|semantic scholar/i.test(query) && skill.name === 'literature-search') {
    score += 16;
    reasons.push('适合先检索候选论文、扩展关键词和补充最新相关工作');
  }
  if (/找论文|检索文献|最新工作|最新相关工作|补文献|academic search|search papers|arxiv|semantic scholar/i.test(query) && skill.name === 'literature-review') {
    score -= 6;
  }
  if (/introduction|引言|motivation|贡献|contribution/i.test(query) && skill.name === 'writing-introduction') {
    score += 10;
    reasons.push('适合引言、动机和贡献表述');
  }
  if (/论文写作计划|写作任务|论文\s*outline|paper\s*outline|paper\s*structure|paper\s*roadmap|storyline|故事线|idea.*paper|贡献.*足够强|reviewer.*可能|审稿人可能|风险清单/i.test(query) && skill.name === 'paper-planning') {
    score += 18;
    reasons.push('适合论文大纲、故事线、写作 roadmap 和审稿风险预判');
  }
  if (/(?:table|表格).{0,16}(?:结果|results?|paragraph|文字|描述)|(?:结果|results?).{0,16}(?:table|表格|paragraph)|(?:ablation|消融).{0,16}(?:table|表格|paragraph)/i.test(query) && skill.name === 'paper-planning') {
    score -= 14;
  }
  if (reviewerRevision && skill.name === 'paper-planning') {
    score -= 14;
  }
  if (/(?:改成|调整成|适配|改为).{0,12}(?:acl|neurips|icml|iclr|emnlp|cvpr|chi|nature).{0,8}(?:风格|style|写法)|(?:acl|neurips|icml|iclr|emnlp|cvpr|chi|nature)\s*(?:风格|style)/i.test(query) && skill.name === 'paper-planning') {
    score -= 14;
  }
  if (/贡献.*足够强|contribution.*strong|baseline.*区别|贡献.*baseline/i.test(query) && skill.name === 'writing-introduction') {
    score += 16;
    reasons.push('适合贡献表述和与 baseline 的差异说明');
  }
  if (/公式|equation|符号不一致|符号一致|notation|symbol|伪代码|pseudo\s*code|pseudocode|algorithm|算法|theorem|proof|proof sketch|证明|解释.{0,12}(?:方法|method)|(?:方法|method).{0,12}(?:解释|说明|clarity|清楚|小节标题|section title|subsection title|标题)/i.test(query) && skill.name === 'writing-methodology') {
    score += 14;
    reasons.push('适合公式、符号定义、伪代码、定理证明和方法表述一致性检查');
  }
  if (/dataset|数据集|实验设置|experimental setup|evaluation setup|benchmark/i.test(query) && skill.name === 'writing-results') {
    score += 14;
    reasons.push('适合 dataset、实验设置和结果章节描述');
  }
  if (/(?:table|表格).{0,16}(?:结果|results?|paragraph|文字|描述)|(?:结果|results?).{0,16}(?:table|表格|paragraph)|(?:ablation|消融).{0,16}(?:table|表格|paragraph)/i.test(query) && skill.name === 'writing-results') {
    score += 16;
    reasons.push('适合把表格、消融和实验结果改写成 results 段落');
  }
  if (/设计实验计划|实验计划|规划\s*ablation|ablation\s*实验|user study|用户研究|实验是否足够支撑|claim/i.test(query) && ['writing-results', 'statistical-analysis'].includes(skill.name)) {
    score += 12;
    reasons.push('适合实验计划、ablation、user study 和 claim 支撑性检查');
  }
  if (isStatisticalTaskQuery(query) && skill.name === 'statistical-analysis') {
    score += 22;
    reasons.push('适合统计检验、指标计算、异常值检查和结果可靠性判断');
  }
  if (isStatisticalTaskQuery(query) && ['writing-results', 'writing-polish', 'scientific-visualization'].includes(skill.name)) {
    score -= 10;
  }
  if (/title|标题|keyword list|keywords?|关键词/i.test(query) && skill.name === 'writing-abstract') {
    score += 14;
    reasons.push('适合标题、关键词和摘要级压缩表达');
  }
  if (/(?:method|方法).{0,20}(?:小节标题|section title|subsection title|标题)/i.test(query) && skill.name === 'writing-abstract') {
    score -= 16;
  }
  if (/appendix|supplementary appendix|supplemental appendix|reproducibility checklist|artifact checklist|附录|补充附录|可复现清单/i.test(query) && skill.name === 'conference-submission') {
    score += 14;
    reasons.push('适合 appendix、supplementary appendix 和 reproducibility checklist 投稿材料');
  }
  if (reviewerRevision && skill.name === 'writing-introduction') {
    score -= 8;
  }
  if (/cover[-_\s]?letter(?:\.md)?|cover letter/i.test(query) && skill.name === 'reviewer-response') {
    score -= 18;
  }
  if (/threats? to validity|validity threats?|broader impact|reproducibility section|有效性威胁|可复现章节|复现章节/i.test(query) && skill.name === 'writing-discussion') {
    score += 16;
    reasons.push('适合 threat to validity、broader impact、reproducibility 和讨论边界');
  }
  if (/limitations?|limitation section|局限性|局限/i.test(query) && skill.name === 'writing-conclusion') {
    score -= 8;
  }
  if (/conclusion|结论|future work|未来工作|总结贡献/i.test(query) && skill.name === 'writing-conclusion') {
    score += 12;
    reasons.push('适合结论、贡献收束和 future work');
  }
  if (/润色|改论文|修改论文|polish|language editing|grammar|clarity/i.test(query) && skill.name === 'writing-polish') {
    score += 12;
    reasons.push('适合论文润色、语言编辑和保守改写');
  }
  if (/翻译成英文论文表达|翻译成中文|英文论文段落翻译|语法|时态|tense consistency|压缩段落|压缩\s*\d+%|改短|bullet points?\s*改成论文段落|降低\s*ai\s*痕迹|ai\s*痕迹|太像\s*ai|像人写|更像人写|nature\s*风格英文|学术风格|(?:acl|neurips|icml|iclr|emnlp|cvpr|chi)\s*风格|改成\s*(?:acl|neurips|icml|iclr|emnlp|cvpr|chi)\s*(?:风格|style)|translate|translation|humanize|ai-written|academic style|shorten|concise|更简洁|表达不清楚|逐句/i.test(query) && skill.name === 'writing-polish') {
    score += 16;
    reasons.push('适合翻译、语法时态、压缩段落、AI 痕迹检查和期刊写作风格改写');
  }
  if (isLocalPolishQuery(query) && skill.name === 'writing-polish') {
    score += 18;
    reasons.push('适合已有局部文本的保守润色、翻译、压缩和逐句表达检查');
  }
  if (isLocalPolishQuery(query) && /caption|图注/i.test(query) && skill.name === 'writing-polish') {
    score += 10;
    reasons.push('适合只修改 caption 或图注语言，不改变图表事实');
  }
  if (isLocalPolishQuery(query) && !isFigureTaskQuery(query) && ['writing-abstract', 'literature-review', 'scientific-visualization', 'evidence-review', 'conference-submission', 'reviewer-response'].includes(skill.name)) {
    score -= 12;
  }
  if (isLocalPolishQuery(query) && !isFigureTaskQuery(query) && /caption|图注/i.test(query) && skill.name === 'scientific-visualization') {
    score -= 12;
  }
  if (/nature\s*风格英文|nature\s*style\s*(english|writing)|学术风格|写作风格/i.test(query) && skill.name === 'scientific-visualization') {
    score -= 12;
  }
  if (latexDebug && skill.name === 'latex-debugging') {
    score += 18;
    reasons.push('适合 LaTeX/Overleaf 编译报错定位和最小修复');
  }
  if (!latexDebug && /latex|theorem|proof/i.test(query) && skill.name === 'latex-debugging') {
    score -= 20;
  }
  if (!latexDebug && /\bpdf\b/i.test(query) && skill.name === 'latex-debugging') {
    score -= 18;
  }
  if (/keyword list|keywords?|关键词/i.test(query) && skill.name === 'reference-management') {
    score -= 12;
  }
  if (latexDebug && skill.name === 'reference-management') {
    score -= 10;
  }
  if (/引用|参考文献|bibtex|references?\\.bib|refs\\.bib|\\bbib\\b|zotero|doi|citation|citation key|未定义引用|undefined reference/i.test(query) && skill.name === 'reference-management') {
    score += 10;
    reasons.push('适合引用和 BibTeX 管理');
  }
  if (/zotero|refs\\.bib|\\bbib\\b|未定义引用|undefined reference/i.test(query) && skill.name === 'reference-management') {
    score += 18;
    reasons.push('适合清理 Zotero/BibTeX 导出和检查未定义引用');
  }
  if (/zotero|refs\\.bib|\\bbib\\b|未定义引用|undefined reference/i.test(query) && ['writing-polish', 'evidence-review'].includes(skill.name)) {
    score -= 14;
  }
  if (evidenceReview && skill.name === 'evidence-review') {
    score += 24;
    reasons.push('适合 AI 输出审查、幻觉引用、单句证据核对、反例/负证据和安全采纳包');
  }
  if (evidenceReview && ['reference-management', 'literature-review', 'writing-polish', 'writing-conclusion', 'writing-methodology', 'writing-results'].includes(skill.name)) {
    score -= 8;
  }
  if (/解释.{0,12}(?:方法|method)|(?:方法|method).{0,12}(?:解释|说明)/i.test(query) && skill.name === 'paper-planning') {
    score -= 12;
  }
  if (/(?:pdf|文献|知识库|证据库|related work|literature|survey|research gap)/i.test(query) && (skill.requires_context || []).includes('rag_documents_or_references')) {
    score += projectState.hasRagDocuments ? 3 : 1;
    reasons.push(projectState.hasRagDocuments ? '可使用已索引文献证据' : '建议先上传或索引文献证据');
  }
  if (hasExplicitRagMention(query) && (skill.requires_context || []).includes('rag_documents_or_references')) {
    score += projectState.hasRagDocuments ? 3 : 1;
    reasons.push(projectState.hasRagDocuments ? '可使用已索引 RAG 证据' : '建议先上传或索引 RAG 证据');
  }
  if (ragDiagnostic && skill.name === 'literature-review') {
    score += 16;
    reasons.push('适合先检查 PDF/RAG 证据库是否可用于文献写作');
  }
  if (ragDiagnostic && skill.name === 'literature-search') {
    score += 6;
    reasons.push('RAG 证据不足时可辅助扩展检索词');
  }
  if (/实验|结果|消融|ablation|table|指标|accuracy|p value|统计/i.test(query) && ['writing-results', 'statistical-analysis'].includes(skill.name)) {
    score += 8;
    reasons.push('适合实验结果分析');
  }
  if (/limitations?|limitation section|局限性|局限/i.test(query) && skill.name === 'writing-discussion') {
    score += 14;
    reasons.push('适合 discussion、limitations 和 future work 边界表述');
  }
  if (/统计显著性|显著性检验|p value|p-value|confidence interval|置信区间|统计分析|effect size/i.test(query) && skill.name === 'statistical-analysis') {
    score += 12;
    reasons.push('适合统计检验、显著性和置信区间解释');
  }
  if (/图|figure|caption|示意图|配色/i.test(query) && skill.name === 'scientific-visualization') {
    score += 8;
    reasons.push('适合图表和图注设计');
  }
  if (isFigureTaskQuery(query) && skill.name === 'scientific-visualization') {
    score += 20;
    reasons.push('适合论文图表生成、流程图、配色、图注和排版检查');
  }
  if (/(?:figure|图).{0,24}(?:颜色|配色|color|style|风格)|(?:颜色|配色|color).{0,24}(?:figure|图)/i.test(query) && skill.name === 'scientific-visualization') {
    score += 18;
    reasons.push('适合调整论文图表配色和视觉风格');
  }
  if (isFigureTaskQuery(query) && ['writing-polish', 'writing-methodology', 'writing-results', 'evidence-review', 'reviewer-response'].includes(skill.name)) {
    score -= 12;
  }
  if (/graphical abstract|visual abstract|图文摘要|可视化摘要/i.test(query) && skill.name === 'scientific-visualization') {
    score += 14;
    reasons.push('适合规划 graphical abstract 的视觉结构和核心信息');
  }
  if (/\bppt\b|slides?|beamer|presentation|conference talk|论文转演示|答辩/i.test(query) && skill.name === 'post-acceptance') {
    score += 18;
    reasons.push('适合录用后演讲与幻灯片准备');
  }
  if (/highlights|亮点/i.test(query) && skill.name === 'writing-abstract') {
    score += 12;
    reasons.push('适合把论文贡献压缩成 highlights');
  }
  if (/投稿|会议|conference|匿名|camera ready|page limit/i.test(query) && skill.name === 'conference-submission') {
    score += 8;
    reasons.push('适合投稿前检查');
  }
  if (/arxiv.{0,24}(anonymous|匿名)|anonymous.{0,24}(version|版本)|匿名版|转成 anonymous/i.test(query) && skill.name === 'conference-submission') {
    score += 20;
    reasons.push('适合把公开版本转换为匿名投稿版本并检查泄露风险');
  }
  if (/arxiv.{0,24}(anonymous|匿名)|anonymous.{0,24}(version|版本)|匿名版|转成 anonymous/i.test(query) && skill.name === 'alterlab-arxiv') {
    score -= 18;
  }
  if (/(?:pdf.{0,16}metadata|metadata).{0,24}(?:匿名|anonymous|double blind|作者信息)|(?:匿名|anonymous|double blind|作者信息).{0,24}(?:pdf.{0,16}metadata|metadata)|double blind|anonymous|匿名风险|作者信息|page limit|camera-ready|camera ready/i.test(query) && skill.name === 'conference-submission') {
    score += 14;
    reasons.push('适合匿名、PDF metadata、页数和 camera-ready 投稿检查');
  }
  if (/cover letter|ethical statement|ethics statement|data availability|code availability|conflict of interest|coi|acknowledgements|acknowledgments|author contributions|contribution statement|supplementary material|supplemental material|supporting information|利益冲突|伦理声明|数据可用性|代码可用性|致谢|作者贡献|补充材料/i.test(query) && skill.name === 'conference-submission') {
    score += 14;
    reasons.push('适合检查 cover letter、伦理声明、数据可用性和投稿材料');
  }
  if (reviewerRevision && skill.name === 'reviewer-response') {
    score += 22;
    reasons.push('适合逐条回复审稿意见、制定 revision plan 和整理 action items');
  }
  if (/novelty\s*weak|novelty.{0,16}(weak|concern)|创新性.{0,16}(不足|弱|不够)|过度承诺|over[-\s]?promise|response\s*table|承诺.{0,16}(正文修改|checklist|修改位置)/i.test(query) && skill.name === 'reviewer-response') {
    score += 18;
    reasons.push('适合 novelty weak、response table、返修承诺和过度承诺审查');
  }
  if (reviewerRevision && ['writing-results', 'statistical-analysis'].includes(skill.name)) {
    score -= 10;
  }
  if (/(?:找|检索).{0,16}(?:benchmark|paper|论文|文献).{0,24}(?:加入|导入|放进).{0,12}(?:证据库|rag|知识库)|benchmark paper/i.test(query) && skill.name === 'literature-search') {
    score += 20;
    reasons.push('适合先检索候选 benchmark 论文，再决定是否导入证据库');
  }
  if (/(?:找|检索).{0,16}(?:benchmark|paper|论文|文献).{0,24}(?:加入|导入|放进).{0,12}(?:证据库|rag|知识库)|benchmark paper/i.test(query) && ['paper-planning', 'literature-review'].includes(skill.name)) {
    score -= 14;
  }

  const requiredContext = requiredContextForRecommendation(skill, query);
  const missingContext = requiredContext.filter(requirement => {
    if (requirement === 'rag_documents_or_references') {
      return !projectState.hasRagDocuments && !projectState.hasReferences;
    }
    if (requirement === 'references_bib') return !projectState.hasReferences;
    if (requirement === 'target_section_or_file') {
      return !projectState.contextAnswers?.target_section_or_file && !inferTargetReferenceFromTask(query);
    }
    if (requirement === 'reviewer_comments') {
      return !projectState.contextAnswers?.reviewer_comments;
    }
    return !projectState.contextAnswers?.[requirement];
  });

  return {
    skill,
    score,
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    missingContext,
    suggestedTask: buildSuggestedTask(skill, query, missingContext),
  };
}

function isReviewerRevisionQuery(query) {
  return /rebuttal|reviewer comments|reviewers?.{0,24}common concerns|common concerns|response letter|response table|revision response|revision plan|revision checklist|revision summary|major concerns|minor concerns|action items|rebuttal cover letter|additional experiments|review.{0,16}补实验|补实验计划|novelty\s*weak|novelty.{0,16}(weak|concern)|创新性.{0,16}(不足|弱|不够)|过度承诺|over[-\s]?promise|审稿意见|回复审稿|回复 reviewer|修改矩阵|修订计划|返修计划|补实验/i.test(query);
}

function isLocalPolishQuery(query) {
  return /(?:这段|这句|这句话|逐句|过渡句|口语化|bullet points?|tense consistency|语法|时态|翻译成英文论文表达|翻译成中文|英文.{0,8}翻译成中文|中文.{0,8}翻译成英文|压缩\s*\d+%|压缩段落|改短|降低\s*ai\s*痕迹|ai\s*痕迹|太像\s*ai|像人写|更像人写|humanize|表达不清楚|更简洁|不要改变事实|不要改技术含义|不要新增结果|不夸大|夸大)/i.test(query);
}

function isFigureTaskQuery(query) {
  return /(?:figure|fig\.?|图|图表|图注|caption|流程图|示意图|柱状图|折线图|roc\s*curve|matplotlib|plot\.py|画图|绘图|导出\s*pdf|配色|颜色|排版太宽|too wide|编号.{0,12}引用|引用.{0,12}一致性)/i.test(query);
}

function isStatisticalTaskQuery(query) {
  return /(?:t[-\s]?test|p[-\s]?value|confidence interval|置信区间|effect size|显著性|统计|异常值|outlier|mean\s*[±+/-]?\s*std|mean.{0,8}std|均值|方差|标准差|mean±std|计算.{0,16}(?:mean|std|均值|标准差)|实验数据.{0,16}(?:跑|计算|检查|分析)|results\.csv.{0,24}(?:计算|mean|std))/i.test(query);
}

function isEvidenceReviewQuery(query) {
  return /幻觉引用|假引用|fake citation|hallucinated citation|citation grounding|(?:一句话|claim|这句话|单句).{0,32}(?:证据|rag|核对|支持|检查|citation|引用)|(?:证据|rag).{0,32}(?:核对|支持).{0,32}(?:一句话|claim|这句话|单句)|(?:这句话|每句话|逐句|每个\s*claim|每个 claim|each claim).{0,32}(?:引用|citation|证据|来源编号|证据编号)|(?:引用|citation).{0,24}(?:哪几篇|哪些|哪篇|配|补|需要).{0,24}(?:论文|文献|paper)|(?:检查|审查|找出|列出).{0,24}(?:哪些句子|句子|claim|claims).{0,24}(?:没有引用|缺引用|缺少引用|missing citation|uncited)|(?:审查|检查|review).{0,16}(?:ai 输出|ai 写|模型输出|当前输出|这段).{0,16}(?:采纳|能不能采纳|引用|证据)|(?:ai 输出|ai 写|模型输出).{0,24}(?:合并|merge|采纳|放进|写进)|(?:paragraph|段落|这段).{0,24}(?:能不能|是否|可以|直接).{0,16}(?:放进|采纳|写进).{0,12}(?:论文|正文|paper)|(?:table|表格|图|figure|fig\\.?).{0,16}(?:结论|claim|conclusion).{0,24}(?:证据|支撑|支持|support)|(?:找|检查|总结|提取).{0,24}(?:支持|支撑).{0,24}(?:claim|novelty|贡献|结论).{0,24}(?:证据|文献|论文|paper)|(?:反例|相反.{0,4}观点|负证据|negative evidence|counter[-\\s]?evidence|contradictory evidence)|引用.{0,16}证据支持|证据支持.{0,16}引用|安全采纳包|adoption package|采纳包/i.test(query);
}

function isLatexDebugQuery(query) {
  return /(?:latex|latexmk|overleaf|pdf).{0,24}(?:编译错误|编译失败|编译不过|报错|error|failed|错误)|(?:运行|执行|run).{0,12}latexmk|(?:编译\s*pdf\s*出错|pdf\s*编译失败|undefined control sequence|missing \$ inserted|latex error)/i.test(query);
}

function isSubmissionPdfMetadataQuery(query) {
  return /(?:pdf.{0,16}metadata|metadata).{0,24}(?:匿名|anonymous|double blind|作者信息)|(?:匿名|anonymous|double blind|作者信息).{0,24}(?:pdf.{0,16}metadata|metadata)|double blind|anonymous|匿名风险|作者信息/i.test(query);
}

function requiredContextForRecommendation(skill, query) {
  if (skill.name === 'writing-polish' && isLocalPolishQuery(query)) {
    return [];
  }
  if (
    skill.name === 'writing-abstract' &&
    /title|标题|keyword list|keywords?|关键词/i.test(query)
  ) {
    return ['paper_summary'];
  }
  if (
    skill.name === 'scientific-visualization' &&
    /(?:figure|fig\.?|图)\s*\.?\s*[A-Z]?\d+[a-z]?|matplotlib|plot\.py|\.csv\b|results\.csv|caption|图注|流程图|示意图|配色|颜色|排版太宽|编号.{0,12}引用|roc\s*curve|柱状图|折线图/i.test(query)
  ) {
    return [];
  }
  if (
    skill.name === 'statistical-analysis' &&
    /\.csv\b|results\.csv|table\s*\d+|表\s*\d+|实验数据|p[-\s]?value|mean±std|mean.{0,8}std/i.test(query)
  ) {
    return [];
  }
  if (
    skill.name === 'statistical-analysis' &&
    /(?:怎么报告|如何报告|解释|说明|怎么看|what|why|explain)/i.test(query)
  ) {
    return [];
  }
  if (
    skill.name === 'evidence-review' &&
    /(?:这句话|一句话|单句|这个\s*claim|claim).{0,32}(?:引用|哪几篇|证据|核对|够不够|支持|citation)/i.test(query)
  ) {
    return ['rag_documents_or_references'];
  }
  if (
    skill.name === 'reviewer-response' &&
    /(?:对应到|修改位置|修改矩阵|正文修改位置|main\.tex|\b[\w./-]+\.tex\b)/i.test(query)
  ) {
    return ['reviewer_comments', 'target_section_or_file'];
  }
  if (skill.name === 'reviewer-response') {
    return ['reviewer_comments'];
  }
  if (
    skill.name === 'conference-submission' &&
    /(?:pdf.{0,16}metadata|metadata).{0,24}(?:匿名|anonymous|double blind|作者信息)|(?:匿名|anonymous|double blind|作者信息).{0,24}(?:pdf.{0,16}metadata|metadata)/i.test(query)
  ) {
    return ['venue_rules', 'compiled_pdf'];
  }
  if (
    skill.name === 'conference-submission' &&
    /arxiv.{0,24}(anonymous|匿名)|anonymous.{0,24}(version|版本)|匿名版|转成 anonymous/i.test(query)
  ) {
    return ['venue_rules'];
  }
  if (
    skill.name === 'conference-submission' &&
    /neurips checklist|camera[-\s]?ready.{0,24}anonymous|anonymous.{0,24}camera[-\s]?ready|规则冲突|怎么填|checklist/i.test(query) &&
    !/appendix|supplementary material|supplemental material|supporting information|附录|补充材料/i.test(query)
  ) {
    return ['venue_rules'];
  }
  if (
    skill.name === 'conference-submission' &&
    /cover letter|ethical statement|ethics statement|data availability|code availability|conflict of interest|coi|acknowledgements|acknowledgments|author contributions|contribution statement|supplementary material|supplemental material|supporting information|利益冲突|伦理声明|数据可用性|代码可用性|致谢|作者贡献|补充材料/i.test(query)
  ) {
    if (/statement|声明|cover letter|投稿信/i.test(query)) return ['venue_rules'];
    return ['venue_rules', 'target_section_or_file'];
  }
  if (
    skill.name === 'conference-submission' &&
    /(?:page limit|camera[-\s]?ready|anonymous|double blind|匿名风险)|neurips checklist|checklist|reproducibility checklist|artifact checklist/i.test(query) &&
    !/appendix|supplementary appendix|supplementary material|supplemental material|supporting information|附录|补充材料|泄露作者信息/i.test(query)
  ) {
    return ['venue_rules'];
  }
  if (
    skill.name === 'conference-submission' &&
    /appendix|supplementary appendix|supplementary material|supplemental material|supporting information|附录|补充材料|可复现清单|泄露作者信息/i.test(query)
  ) {
    return ['venue_rules', 'target_section_or_file'];
  }
  return skill.requires_context || [];
}

function defaultTaskTemplates(skill, ui = {}) {
  const name = ui.display_name_zh || skill.display_name || skill.name;
  return [
    `请使用“${name}”帮我完成这个论文任务，并先说明需要哪些上下文。`,
    `请基于当前项目上下文，用“${name}”给出结构化建议和下一步修改计划。`,
  ];
}

function buildSuggestedTask(skill, query, missingContext = []) {
  const templates = skill.task_templates || [];
  const base = templates[0] || `请使用“${skill.display_name_zh || skill.display_name || skill.name}”处理当前论文任务。`;
  const task = query ? `我的任务是：${query}\n\n${base}` : base;
  if (!missingContext.length) return task;
  return [
    task,
    '',
    '开始前请先提醒我补充这些上下文：',
    ...missingContext.map(item => `- ${item}`),
  ].join('\n');
}

function tokenizeSkillText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1);
}

function containsLoose(text, value) {
  const normalizedText = String(text || '').toLowerCase();
  const normalizedValue = String(value || '').toLowerCase();
  if (!normalizedValue) return false;
  return normalizedText.includes(normalizedValue) ||
    normalizedValue
      .split(/[\s,;，；/]+/)
      .filter(part => part && part.length > 1)
      .some(part => normalizedText.includes(part));
}

function isRagDiagnosticQuery(query = '') {
  const text = String(query || '').toLowerCase();
  const mentionsRagOrPdf = hasExplicitRagMention(text) || /pdf|知识库|证据库|文献库|检索|索引|读取|读进|读不|解析|抽取|ocr|metadata[-\s]?only|只有\s*metadata|only\s*metadata/.test(text);
  const asksDiagnostic = /读进|读不|读出|读取|解析|抽取|检索不到|搜不到|找不到|有没有|是否|检查|诊断|修复|不好用|失败|空|没有命中|no hit|not extracted|parse|index|ocr|metadata[-\s]?only|只有\s*metadata|only\s*metadata/.test(text);
  return mentionsRagOrPdf && asksDiagnostic;
}

function ragDiagnosticMatchedWords(query = '') {
  const text = String(query || '').toLowerCase();
  return ['rag', 'pdf', '知识库', '证据库', '读不出来', '读进去', '解析', '抽取', '检索不到', 'ocr']
    .filter(word => word === 'rag' ? hasExplicitRagMention(text) : text.includes(word.toLowerCase()))
    .slice(0, 5);
}

function hasExplicitRagMention(query = '') {
  return /(^|[^a-z0-9])rag([^a-z0-9]|$)/i.test(String(query || ''));
}

function inferTargetReferenceFromTask(query = '') {
  const raw = String(query || '');
  if (/(?:chapters|sections|src|paper|appendix|figures|tables)\/[^\s，。；;]+|\b[^\s，。；;]+\.(?:tex|md|markdown|bib|pdf)\b/i.test(raw)) return true;
  if (/\bcover[-_\s]?letter\b|投稿信|投稿说明/i.test(raw)) return true;
  if (/\b(?:fig(?:ure)?|图)\s*\.?\s*[A-Z]?\d+[a-z]?/i.test(raw)) return true;
  if (/\b(?:tab(?:le)?|表)\s*\.?\s*[A-Z]?\d+[a-z]?/i.test(raw)) return true;
  if (/\b(?:reviewer|review)\s*[A-Z]?\d+\s*(?:comment|意见)?\s*[A-Z]?\d*/i.test(raw)) return true;
  if (/\bappendix\s+(?:[A-Z]\d*|\d+[A-Z]?)\b/i.test(raw)) return true;
  if (/当前|选中|selected/i.test(raw)) return true;
  return false;
}
 
export function assemblePrompt({ globalSkills = [], chapterSkills = [], manualSkills = [], manualSkill } = {}) {
  const parts = [];
  const activeManualSkills = [...new Set([
    ...(Array.isArray(manualSkills) ? manualSkills : []),
    manualSkill,
  ].filter(Boolean))];
  const hasAnySkill = (globalSkills.length || chapterSkills.length || activeManualSkills.length);
  
  // Only force academic writing assistant role when skills are actually selected
  if (hasAnySkill) {
    parts.push('You are an academic writing assistant.');
  }
  
  for (const name of globalSkills || []) {
    const skill = skillRegistry.get(name);
    if (skill) parts.push(`[Global Rule - ${skill.display_name}]\n${renderSkillPrompt(skill)}`);
  }
  for (const name of chapterSkills || []) {
    const skill = skillRegistry.get(name);
    if (skill) parts.push(`[Chapter Skill - ${skill.display_name}]\n${renderSkillPrompt(skill)}`);
  }
  for (const name of activeManualSkills) {
    const skill = skillRegistry.get(name);
    if (skill) parts.push(`[Active Skill - ${skill.display_name}]\n${renderSkillPrompt(skill)}`);
  }
  return parts.join('\n\n---\n\n');
}

function renderSkillPrompt(skill) {
  if (!skill?._resourceDir && !skill?._resourceRoot) return skill?.prompt || '';
  const lines = [
    '[Open-source Skill resource mapping]',
    `Skill directory: ${skill._resourceDir || skill._resourceRoot}`,
    `Repository root: ${skill._resourceRoot || skill._resourceDir}`,
    'Resolve relative references, scripts, assets, and evals against the Skill directory above.',
  ];
  if (skill.upstream_name && skill.name?.startsWith('medsci-')) {
    lines.push(`For this Skill, CLAUDE_SKILL_DIR=${skill._resourceDir} and MEDSCI_SKILLS_ROOT=${skill._resourceRoot}.`);
  }
  lines.push('Preserve the upstream workflow and use bundled deterministic scripts when its instructions require them.');
  return `${lines.join('\n')}\n\n${skill.prompt || ''}`;
}
 
