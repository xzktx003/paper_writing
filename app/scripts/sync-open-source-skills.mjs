#!/usr/bin/env node

import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { basename, dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(appRoot, 'apps/backend/skills');
const resourcesDir = join(appRoot, 'apps/backend/skill-resources');
const manifestPath = join(skillsDir, 'open-source-skills.manifest.json');
const now = new Date().toISOString();

const categoryNames = {
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

const githubSources = [
  {
    id: 'snl-paper-writing',
    repo: 'https://github.com/SNL-UCSB/paper-writing-skill.git',
    web: 'https://github.com/SNL-UCSB/paper-writing-skill',
    skillRoot: '.',
    select: path => path === 'SKILL.md',
    names: { 'paper-writing': ['AI/ML 顶会论文写作', '面向 NeurIPS、ICLR、ICML 等顶会的五阶段论文写作流程，覆盖构思、结构、章节起草、整合、压缩和审稿回复。'] },
    categories: { 'paper-writing': 'paper-writing' },
    subcategories: { 'paper-writing': 'full-paper' },
  },
  {
    id: 'ai4s-skills',
    repo: 'https://github.com/ai4s-research/ai4s-skills.git',
    web: 'https://github.com/ai4s-research/ai4s-skills',
    skillRoot: 'skills',
    select: path => path.endsWith('/SKILL.md'),
    names: {
      'research-explorer': ['AI 科研方向探索', '从问题空间、研究空白和可行性出发探索 AI 研究方向。'],
      'literature-survey': ['AI 文献综述', '检索、筛选并综合 AI 领域文献，形成可追溯的综述与研究空白。'],
      'integrity-auditor': ['科研诚信审计', '检查论文中的引用、论断、实验来源、复现性和学术诚信风险。'],
      'paper-writer': ['AI 科研论文生成', '组织证据、图表和章节，生成可投稿的 AI 科研论文并执行质量门禁。'],
      'ai4s-agent': ['AI4S 科研代理', '编排方向探索、文献、实验、写作和诚信检查的完整科研流程。'],
      'experiment-suite': ['AI 实验套件', '规划并执行基线、消融、敏感性和误差分析等 AI 论文实验。'],
      'mindmap-render': ['科研思维导图', '把研究问题、方法、证据和实验关系整理为科研思维导图。'],
    },
    categories: {
      'research-explorer': 'exploration-discovery', 'literature-survey': 'literature-search', 'integrity-auditor': 'peer-review',
      'paper-writer': 'paper-writing', 'ai4s-agent': 'exploration-discovery', 'experiment-suite': 'experiment-design', 'mindmap-render': 'scientific-figures',
    },
    subcategories: {
      'research-explorer': 'gap-discovery', 'literature-survey': 'literature-review', 'integrity-auditor': 'citation-integrity',
      'paper-writer': 'full-paper', 'ai4s-agent': 'project-workflow', 'experiment-suite': 'baseline-ablation', 'mindmap-render': 'architecture-diagrams',
    },
    excludeNames: new Set(['paper-writer']),
  },
  {
    id: 'researchpilot',
    repo: 'https://github.com/LMDHQ-0420/ResearchPilot-Skills.git',
    web: 'https://github.com/LMDHQ-0420/ResearchPilot-Skills',
    skillRoot: 'skills/ResearchPilot-Skills-zh',
    select: path => path.endsWith('/SKILL.md'),
    names: {},
    categories: {
      'research[START]': 'exploration-discovery', 'research[A]-exploration': 'literature-search', 'research[B]-idea': 'experiment-design',
      'research[C]-experiment': 'experiment-design', 'research[D]-implementation': 'experiment-design', 'research[E]-coding': 'experiment-design',
      'research[F]-iteration': 'experiment-design', 'research[G.0]-plan': 'paper-writing', 'research[G.1]-method': 'paper-writing',
      'research[G.2]-experiments': 'paper-writing', 'research[G.3]-abstract': 'paper-writing', 'research[G.4]-introduction': 'paper-writing',
      'research[G.5]-related': 'paper-writing', 'research[G.6]-conclusion': 'paper-writing', 'research[G.7]-review': 'peer-review',
      'research[G.8]-translate': 'paper-writing',
    },
    subcategories: {
      'research[START]': 'project-workflow', 'research[A]-exploration': 'query-strategy', 'research[B]-idea': 'research-question',
      'research[C]-experiment': 'experiment-planning', 'research[D]-implementation': 'data-processing', 'research[E]-coding': 'data-processing',
      'research[F]-iteration': 'baseline-ablation', 'research[G.0]-plan': 'outline-planning', 'research[G.1]-method': 'method',
      'research[G.2]-experiments': 'experiments-results', 'research[G.3]-abstract': 'abstract', 'research[G.4]-introduction': 'introduction',
      'research[G.5]-related': 'related-work', 'research[G.6]-conclusion': 'discussion-conclusion', 'research[G.7]-review': 'paper-review',
      'research[G.8]-translate': 'language-polish',
    },
  },
  {
    id: 'popular-patent-disclosure',
    repo: 'https://github.com/handsomestWei/patent-disclosure-skill.git',
    web: 'https://github.com/handsomestWei/patent-disclosure-skill',
    skillRoot: '.',
    select: path => path === 'SKILL.md',
    names: {
      'patent-disclosure-skill': ['专利挖掘与技术交底书', '扫描 AI/软件项目材料挖掘可专利技术点，执行现有技术查新与差异化分析，生成含流程图、公式和实施例的中文技术交底书，并完成一致性自检与 DOCX 交付。'],
    },
    displayNames: { 'patent-disclosure-skill': 'Patent Mining & Technical Disclosure' },
    categories: { 'patent-disclosure-skill': 'patent-writing' },
    subcategories: { 'patent-disclosure-skill': 'patent-disclosure' },
    canonicalNames: { 'patent-disclosure-skill': 'patent-disclosure-skill' },
    license: 'MIT',
    stars: 3374,
    autoRecommend: true,
    copySelectedOnly: false,
  },
  {
    id: 'popular-huggingface-skills',
    repo: 'https://github.com/huggingface/skills.git',
    web: 'https://github.com/huggingface/skills',
    skillRoot: 'skills',
    select: path => ['huggingface-papers/SKILL.md', 'huggingface-paper-publisher/SKILL.md'].includes(path),
    names: {
      'huggingface-papers': ['Hugging Face AI 论文阅读', '通过 Hugging Face Papers 与 arXiv 页面读取 AI 论文正文和结构化元数据，并关联作者、模型、数据集、Space、代码仓库与项目主页。'],
      'huggingface-paper-publisher': ['Hugging Face 论文与产物发布', '将 arXiv 论文发布或索引到 Hugging Face，认领作者身份，并把论文与模型、数据集、Space 和项目资料建立可核验关联。'],
    },
    displayNames: {
      'huggingface-papers': 'Hugging Face AI Paper Reader',
      'huggingface-paper-publisher': 'Hugging Face Paper & Artifact Publisher',
    },
    categories: { 'huggingface-papers': 'literature-search', 'huggingface-paper-publisher': 'open-access' },
    subcategories: { 'huggingface-papers': 'paper-reading', 'huggingface-paper-publisher': 'research-artifacts' },
    canonicalNames: { 'huggingface-papers': 'huggingface-papers', 'huggingface-paper-publisher': 'huggingface-paper-publisher' },
    license: 'Apache-2.0',
    stars: 10761,
    autoRecommend: true,
    copySelectedOnly: true,
  },
  {
    id: 'popular-autoresearch',
    repo: 'https://github.com/uditgoenka/autoresearch.git',
    web: 'https://github.com/uditgoenka/autoresearch',
    skillRoot: '.agents/skills',
    select: path => path === 'autoresearch/SKILL.md',
    names: {
      autoresearch: ['自主实验迭代 Autoresearch', '围绕明确指标执行有界的修改、验证、保留或回滚循环，记录每轮实验与评估结果，并在平台期、失败或预算耗尽时安全停止。'],
    },
    displayNames: { autoresearch: 'Autoresearch — Metric-Driven Experiment Loop' },
    categories: { autoresearch: 'experiment-design' },
    subcategories: { autoresearch: 'autonomous-experimentation' },
    canonicalNames: { autoresearch: 'autoresearch' },
    license: 'MIT',
    stars: 5235,
    autoRecommend: true,
    copySelectedOnly: true,
  },
];

const alterlabSource = {
  id: 'alterlab',
  repo: 'https://github.com/AlterLab-IEU/AlterLab-Academic-Skills.git',
  web: 'https://github.com/AlterLab-IEU/AlterLab-Academic-Skills',
};

// Keep only capabilities that directly support AI/ML/LLM research, experiments,
// paper production, or conference communication. An explicit allowlist prevents
// broad upstream collections from reintroducing medical, materials, humanities,
// patent, teaching, or general-purpose web research Skills on the next sync.
const alterlabAllowlist = new Set([
  'alterlab-arxiv', 'alterlab-dask', 'alterlab-generate-image',
  'alterlab-infographics', 'alterlab-latex-posters', 'alterlab-markitdown', 'alterlab-matplotlib', 'alterlab-mermaid',
  'alterlab-networkx', 'alterlab-open-notebook', 'alterlab-paper-2-web', 'alterlab-pdf-extract',
  'alterlab-plotly', 'alterlab-polars', 'alterlab-pptx-posters', 'alterlab-preregistration-discipline', 'alterlab-pufferlib',
  'alterlab-pymc', 'alterlab-pymoo', 'alterlab-pytorch-lightning', 'alterlab-pyzotero',
  'alterlab-results-transparency', 'alterlab-scientific-schematics', 'alterlab-scientific-slides', 'alterlab-scikit-learn',
  'alterlab-seaborn', 'alterlab-shap', 'alterlab-stable-baselines3', 'alterlab-statsmodels',
  'alterlab-test-selection-guard', 'alterlab-timesfm', 'alterlab-torch-geometric', 'alterlab-transformers',
  'alterlab-umap', 'alterlab-workflow-orchestration', 'alterlab-zarr',
]);
const alterlabNonCommercial = new Set(['alterlab-deep-research', 'alterlab-paper-writer', 'alterlab-paper-reviewer', 'alterlab-research-pipeline']);
const ALTERLAB_CATEGORY_OVERRIDES = {
  'alterlab-academic-career': 'exploration-discovery', 'alterlab-citation-mgmt': 'literature-search', 'alterlab-citation-verifier': 'literature-search',
  'alterlab-deep-research': 'literature-search', 'alterlab-hypothesis-gen': 'experiment-design', 'alterlab-latex-posters': 'academic-conference',
  'alterlab-literature-review': 'literature-search', 'alterlab-paper-2-web': 'paper-writing', 'alterlab-paper-reviewer': 'peer-review',
  'alterlab-paper-writer': 'paper-writing', 'alterlab-peer-review': 'peer-review', 'alterlab-pptx-posters': 'academic-conference',
  'alterlab-research-grants': 'grant-writing', 'alterlab-research-pipeline': 'paper-writing', 'alterlab-scholar-eval': 'peer-review',
  'alterlab-scientific-slides': 'academic-conference', 'alterlab-scientific-writing': 'paper-writing', 'alterlab-thesis-supervisor': 'paper-writing',
  'alterlab-venue-templates': 'academic-conference',
  'alterlab-open-science': 'open-access', 'alterlab-preregistration-discipline': 'experiment-design',
  'alterlab-results-transparency': 'experiment-design', 'alterlab-research-ethics': 'peer-review',
  'alterlab-markitdown': 'literature-search', 'alterlab-workflow-orchestration': 'exploration-discovery',
};
const ALTERLAB_NAMES_ZH = {
  'alterlab-arxiv': 'arXiv 文献检索',
  'alterlab-latex-posters': 'LaTeX 学术海报', 'alterlab-literature-review': '系统文献综述', 'alterlab-paper-2-web': '论文转学术网页',
  'alterlab-peer-review': '论文同行评审', 'alterlab-pptx-posters': 'PPTX 学术海报', 'alterlab-research-grants': '科研基金申请',
  'alterlab-scholar-eval': '学术成果量化评估', 'alterlab-scientific-slides': '科研演讲幻灯片', 'alterlab-scientific-writing': '科学论文写作',
  'alterlab-paper-writer': '整篇论文写作代理', 'alterlab-paper-reviewer': '多角色论文评审', 'alterlab-deep-research': '深度研究与证据综合',
  'alterlab-venue-templates': 'AI 顶会模板与投稿规范', 'alterlab-citation-mgmt': '引用与 BibTeX 管理', 'alterlab-citation-verifier': '引用真实性核验',
  'alterlab-scientific-viz': '发表级科研可视化', 'alterlab-scientific-schematics': '科研架构图与流程图', 'alterlab-statistical-analysis': '科研统计分析',
};
const ALTERLAB_NAMES_EN = {
  'alterlab-arxiv': 'arXiv Literature Search',
};
const ALTERLAB_SUBCATEGORY_OVERRIDES = {
  'alterlab-arxiv': 'database-arxiv',
  'alterlab-citation-graph': 'research-mapping', 'alterlab-open-notebook': 'paper-reading', 'alterlab-pdf-extract': 'paper-reading',
  'alterlab-pyzotero': 'citation-management', 'alterlab-open-science': 'open-science',
  'alterlab-preregistration-discipline': 'reproducibility', 'alterlab-results-transparency': 'reproducibility',
  'alterlab-research-ethics': 'citation-integrity',
  'alterlab-markitdown': 'paper-reading', 'alterlab-workflow-orchestration': 'project-workflow',
  'alterlab-dask': 'data-processing', 'alterlab-polars': 'data-processing', 'alterlab-networkx': 'data-processing',
  'alterlab-pufferlib': 'data-processing', 'alterlab-pytorch-lightning': 'data-processing', 'alterlab-scikit-learn': 'data-processing',
  'alterlab-shap': 'data-processing', 'alterlab-stable-baselines3': 'data-processing', 'alterlab-timesfm': 'data-processing',
  'alterlab-torch-geometric': 'data-processing', 'alterlab-transformers': 'data-processing', 'alterlab-umap': 'data-processing',
  'alterlab-zarr': 'data-processing', 'alterlab-pymoo': 'experiment-planning', 'alterlab-pymc': 'statistics',
  'alterlab-statsmodels': 'statistics', 'alterlab-test-selection-guard': 'statistics',
  'alterlab-matplotlib': 'statistical-plots', 'alterlab-plotly': 'statistical-plots', 'alterlab-seaborn': 'statistical-plots',
  'alterlab-academic-career': 'project-workflow', 'alterlab-citation-mgmt': 'citation-management', 'alterlab-citation-verifier': 'citation-integrity',
  'alterlab-deep-research': 'literature-review', 'alterlab-hypothesis-gen': 'research-question', 'alterlab-latex-posters': 'poster',
  'alterlab-literature-review': 'literature-review', 'alterlab-paper-2-web': 'full-paper', 'alterlab-paper-reviewer': 'paper-review',
  'alterlab-paper-writer': 'full-paper', 'alterlab-peer-review': 'paper-review', 'alterlab-pptx-posters': 'poster',
  'alterlab-research-grants': 'proposal', 'alterlab-research-pipeline': 'full-paper', 'alterlab-scholar-eval': 'paper-review',
  'alterlab-scientific-slides': 'presentation', 'alterlab-scientific-writing': 'full-paper', 'alterlab-thesis-supervisor': 'full-paper',
  'alterlab-venue-templates': 'venue-guidance',
};

const ALTERLAB_SUMMARIES_ZH = {
  'alterlab-academic-career': '起草学术简历、研究陈述、教学理念、求职信和晋升材料，并规划学术影响力与职业发展。',
  'alterlab-arxiv': '按关键词、作者、编号、日期和学科检索 arXiv，返回论文元数据、摘要与 PDF 地址。',
  'alterlab-bgpt-search': '检索论文全文并提取方法、样本量、结果、效应量和质量评分等结构化实验信息。',
  'alterlab-citation-graph': '从种子论文构建双向引用与共引网络，识别核心文献并导出 GraphML 和 JSON。',
  'alterlab-citation-mgmt': '检索论文、核对 DOI 和作者信息，生成准确 BibTeX，并检查参考文献元数据。',
  'alterlab-citation-verifier': '通过 Crossref、OpenAlex、Semantic Scholar 和 arXiv 核验文献真实性、撤稿状态与疑似伪造引用。',
  'alterlab-dask': '把 pandas 和 NumPy 工作流扩展到超内存数据、并行任务图和分布式集群。',
  'alterlab-datacommons': '查询 Google Data Commons 的人口、经济、环境等公共统计指标与时间序列。',
  'alterlab-deep-research': '编排研究问题、系统检索、来源核验、证据综合、偏倚评估和报告撰写的深度研究流程。',
  'alterlab-eda': '自动识别科研数据格式，检查结构、缺失值、质量和统计分布，生成 EDA 报告与后续分析建议。',
  'alterlab-generate-image': '通过图像模型生成或编辑插画、概念图、封面和演示视觉素材，不用于数据图或技术架构图。',
  'alterlab-hypothesis-gen': '把观察结果转化为可证伪假设、竞争机制、可检验预测和对应实验方案。',
  'alterlab-infographics': '生成时间线、比较图、流程型信息图和数据故事图，并执行自动视觉质量审查。',
  'alterlab-latex-posters': '使用 beamerposter、tikzposter 或 baposter 设计多栏学术海报，处理配色、布局和图片集成。',
  'alterlab-link-health': '批量检查并修复 Markdown 内部引用、外部失效链接和 CI 链接检查配置。',
  'alterlab-literature-review': '执行数据库检索、PRISMA 筛选、证据表提取和偏倚评估，产出系统综述文档。',
  'alterlab-markitdown': '将 PDF、Office、图片、音频、网页和电子书转换成适合检索与模型读取的 Markdown。',
  'alterlab-matplotlib': '使用 Matplotlib 精细控制坐标轴、标注、样式和版式，导出 PNG、PDF 或 SVG。',
  'alterlab-mermaid': '编写可版本控制的 Mermaid 流程图、时序图、类图、ER 图、甘特图和状态图。',
  'alterlab-mixed-methods': '设计定量与定性混合研究，规划采样、数据整合、三角验证和联合展示。',
  'alterlab-networkx': '使用 NetworkX 构建和分析图网络，计算中心性、社区、最短路径并生成网络可视化。',
  'alterlab-open-notebook': '建立可检索的开放研究笔记本，组织文献、摘录、研究笔记和知识关联。',
  'alterlab-open-science': '规划预注册、开放数据、开放代码、材料共享和可复现性声明。',
  'alterlab-openalex': '通过 OpenAlex 检索论文、作者、机构、主题和引用关系，支持文献计量分析。',
  'alterlab-paper-2-web': '把论文转换为可浏览的学术项目网页，组织摘要、方法、结果、图表、引用和演示入口。',
  'alterlab-paper-reviewer': '以多角色审稿面板评估创新性、方法、证据、写作和可复现性，并汇总录用建议。',
  'alterlab-paper-writer': '通过结构规划、论证构建、分节起草、引用检查和格式化完成整篇学术论文。',
  'alterlab-parallel-web': '调用 Parallel Web Systems 执行并行网页调研、事实核验和带来源的信息综合。',
  'alterlab-pdf-extract': '从 PDF 提取正文、表格、图片和元数据，处理 OCR，并输出结构化文本。',
  'alterlab-peer-review': '生成正式同行评审报告，逐项检查论点、方法、统计、图表、引用和局限性。',
  'alterlab-perplexity': '使用 Perplexity 搜索最新网页与学术信息，生成带可追溯来源的研究答案。',
  'alterlab-plotly': '创建支持悬停、缩放、筛选和网页嵌入的交互式统计图与仪表盘。',
  'alterlab-polars': '使用 Polars 的惰性执行和并行查询快速清洗、聚合与转换内存数据表。',
  'alterlab-pptx-posters': '使用 PowerPoint 创建可编辑的学术海报，处理画布尺寸、网格、视觉层级和导出。',
  'alterlab-preregistration-discipline': '在查看结果前冻结研究问题、变量、排除标准和分析计划，记录所有偏离。',
  'alterlab-pufferlib': '使用 PufferLib 构建高吞吐强化学习训练、并行环境和多智能体实验。',
  'alterlab-pymc': '使用 PyMC 构建贝叶斯模型，执行先验设定、MCMC 推断、诊断和后验预测检查。',
  'alterlab-pymoo': '使用 pymoo 求解多目标优化问题，配置约束、算法、Pareto 前沿和性能指标。',
  'alterlab-pytorch-lightning': '用 PyTorch Lightning 组织训练循环、日志、检查点、分布式训练和实验复现。',
  'alterlab-pyzotero': '通过 Zotero API 管理文献库、集合、标签、附件、笔记和 BibTeX 导出。',
  'alterlab-qualitative-methods': '设计访谈、主题分析、扎根理论和编码流程，并检查可信度、反思性与成员核验。',
  'alterlab-research-ethics': '准备伦理审查、知情同意、数据管理、隐私保护、利益冲突和双重用途说明。',
  'alterlab-research-grants': '按 NSF、DOE、DARPA 等机构要求撰写基金申请，覆盖创新性、影响、预算和评审标准。',
  'alterlab-research-lookup': '根据问题自动选择学术搜索后端，查找论文、科研数据并核验科学事实。',
  'alterlab-research-pipeline': '串联调研、写作、诚信检查、同行评审、修改和定稿，形成端到端论文流水线。',
  'alterlab-results-transparency': '强制报告所有实际执行的分析、假设检验、效应量、置信区间和预注册偏离。',
  'alterlab-scholar-eval': '按问题、方法、分析和写作等量化量表评估论文、学位论文或研究成果的成熟度。',
  'alterlab-scientific-brainstorm': '通过跨领域联想、反例和假设挑战发现研究空白，形成候选课题与研究问题。',
  'alterlab-scientific-schematics': '生成神经网络架构、系统框图、算法流程和技术示意图，并迭代审查清晰度。',
  'alterlab-scientific-slides': '规划科研演讲结构、每页论点、时间分配和视觉验证，输出 PowerPoint 或 Beamer 幻灯片。',
  'alterlab-scientific-thinking': '评估科学论断的证据等级、实验设计、偏倚、混杂因素、统计陷阱和逻辑谬误。',
  'alterlab-scientific-viz': '编排 Matplotlib、Seaborn 和 Plotly，制作多面板、显著性标注和期刊尺寸的发表级图表。',
  'alterlab-scientific-writing': '先建立章节论点与证据提纲，再写成连贯 IMRAD 正文，并检查引用和报告规范。',
  'alterlab-scikit-learn': '使用 scikit-learn 构建预处理、分类、回归、聚类、调参和模型评估流水线。',
  'alterlab-seaborn': '快速绘制分布、类别比较、回归、相关热图和分面统计图。',
  'alterlab-shap': '用 SHAP 解释模型整体特征重要性与单样本预测，分析偏差、交互和错误来源。',
  'alterlab-simpy': '用 SimPy 模拟队列、共享资源、网络流量和离散时间事件系统。',
  'alterlab-stable-baselines3': '使用 PPO、SAC、DQN、TD3 等算法搭建标准单智能体强化学习实验。',
  'alterlab-statistical-analysis': '根据数据类型和实验设计选择统计检验，检查假设、功效、效应量并生成规范报告。',
  'alterlab-statsmodels': '使用 OLS、GLM、混合模型和 ARIMA 完成统计建模、诊断、推断与置信区间报告。',
  'alterlab-survey-design': '设计问卷、Likert 量表、抽样和预测试，并验证信度、效度与响应偏差。',
  'alterlab-sympy': '使用 SymPy 进行方程求解、微积分、符号矩阵、表达式化简和公式代码生成。',
  'alterlab-teaching-design': '依据逆向设计、建设性对齐和 Bloom 分类法设计课程、学习目标、量规与考核。',
  'alterlab-test-selection-guard': '按结果类型、组数、配对关系和分布假设固定选择统计检验，阻止看结果后换检验。',
  'alterlab-thesis-supervisor': '规划学位论文结构与进度，逐章指导写作、反馈整合、委员会沟通和答辩准备。',
  'alterlab-timesfm': '使用 Google TimesFM 对单变量时间序列进行零样本预测并生成预测区间。',
  'alterlab-torch-geometric': '使用 PyTorch Geometric 构建 GCN、GAT、GraphSAGE、链路预测和异构图模型。',
  'alterlab-transformers': '使用 Hugging Face Transformers 完成 NLP、视觉、语音和多模态模型推理与微调。',
  'alterlab-umap': '使用 UMAP 将高维数据降到二维或三维，用于可视化、聚类预处理和嵌入分析。',
  'alterlab-uspto': '检索 USPTO 专利和商标、审查历史、转让、引证、审查意见与法律状态。',
  'alterlab-vaex': '使用 Vaex 对超内存表格执行惰性聚合、可视化和单机大数据分析。',
  'alterlab-venue-templates': '查询 NeurIPS、ICML、ICLR、CVPR、ACL、IEEE 和 ACM 的模板、页数、引用与图表规范。',
  'alterlab-workflow-orchestration': '把多个 Skill 组合为并行代理、顺序流水线、评审面板和循环修复工作流。',
  'alterlab-zarr': '使用 Zarr 存储分块压缩的 N 维数组，支持并行 I/O、云对象存储和 Dask/Xarray。',
};

const SUBCATEGORY_ZH = {
  'query-strategy': '检索式与筛选策略', 'database-arxiv': 'arXiv 检索', 'database-google-scholar': 'Google Scholar 检索', 'database-semantic-scholar': 'Semantic Scholar 检索', 'database-dblp': 'DBLP 检索',
  'paper-discovery': '论文发现与追踪', 'search-retrieval': '其他检索与下载', 'literature-review': '综述与证据综合', 'related-work': '相关工作分析', 'citation-management': 'BibTeX 与文献管理', 'citation-verification': '引用真实性核验', 'paper-reading': '论文阅读与信息提取', 'research-mapping': '引用网络与研究脉络',
  'research-question': '研究问题与假设', 'experiment-planning': '实验方案', 'statistics': '统计分析', 'baseline-ablation': '基线、消融与评估', 'reproducibility': '复现与透明度', 'data-processing': '数据处理与建模',
  'outline-planning': '大纲与故事线', 'full-paper': '整篇论文', 'abstract': '摘要', 'introduction': '引言（Introduction）', 'related-work': '相关工作（Related Work）', 'method': '方法（Method）', 'experiments-results': '实验与结果', 'discussion-conclusion': '讨论与结论', 'language-polish': '语法、润色与翻译', 'formatting-latex': '格式与 LaTeX',
  'prior-art': '现有技术检索', 'patent-disclosure': '专利挖掘与技术交底书', 'patent-drafting': '权利要求与申请文件', 'statistical-plots': '实验数据图', 'architecture-diagrams': '架构图与流程图', 'figure-layout': '组图与版式', 'captions': '图注与可访问性',
  'submission': '投稿与终稿', 'presentation': '演讲与幻灯片', 'poster': '学术海报', 'venue-guidance': '会议模板与规范',
  'proposal': '申请书主体', 'budget-impact': '预算与影响', 'grant-review': '基金评审', 'paper-review': '论文预审', 'logic-method-review': '逻辑与方法审查', 'citation-integrity': '引用与科研诚信', 'rebuttal': '审稿回复',
  'preprint': '预印本', 'open-data': '开放数据与代码', 'open-science': '开放科学', 'research-artifacts': '论文与研究产物发布', 'autonomous-experimentation': '自主实验迭代', 'ideation': '选题与创意', 'gap-discovery': '研究空白', 'critical-thinking': '批判性思维', 'interdisciplinary': '跨学科探索', 'project-workflow': '科研项目与工作流',
};

function subcategoryFor(name, category, text = '') {
  const value = `${name} ${text}`.toLowerCase();
  if (category === 'paper-writing') {
    if (/abstract|摘要/.test(value)) return 'abstract'; if (/introduction|引言/.test(value)) return 'introduction';
    if (/related.?work|literature.?review|相关工作/.test(value)) return 'related-work'; if (/method|algorithm|方法/.test(value)) return 'method';
    if (/experiment|result|实验|结果/.test(value)) return 'experiments-results'; if (/discussion|conclusion|limitation|结论|讨论/.test(value)) return 'discussion-conclusion';
    if (/polish|grammar|translate|humanize|语言|润色|翻译|语法/.test(value)) return 'language-polish'; if (/latex|format|template|格式|排版/.test(value)) return 'formatting-latex';
    if (/outline|plan|story|大纲|故事线/.test(value)) return 'outline-planning'; return 'full-paper';
  }
  if (category === 'literature-search') { if (/citation|reference|zotero|bib|引用/.test(value)) return 'citation-management'; if (/graph|map|discover|脉络/.test(value)) return 'research-mapping'; if (/review|survey|synthesis|综述/.test(value)) return 'literature-review'; if (/read|note|pdf|笔记/.test(value)) return 'paper-reading'; return 'search-retrieval'; }
  if (category === 'experiment-design') { if (/hypothesis|question|假设|问题/.test(value)) return 'research-question'; if (/stat|test|pymc|统计|检验/.test(value)) return 'statistics'; if (/baseline|ablation|evaluation|评估|消融/.test(value)) return 'baseline-ablation'; if (/repro|prereg|transparen|复现|透明/.test(value)) return 'reproducibility'; if (/data|model|learn|transform|数据|模型/.test(value)) return 'data-processing'; return 'experiment-planning'; }
  if (category === 'scientific-figures') { if (/caption|图注/.test(value)) return 'captions'; if (/architecture|schematic|mermaid|network|架构|流程/.test(value)) return 'architecture-diagrams'; if (/poster|panel|assembly|layout|组图|版式/.test(value)) return 'figure-layout'; return 'statistical-plots'; }
  if (category === 'academic-conference') { if (/poster|海报/.test(value)) return 'poster'; if (/slide|presentation|talk|演讲|幻灯/.test(value)) return 'presentation'; if (/template|venue|规范/.test(value)) return 'venue-guidance'; return 'submission'; }
  if (category === 'peer-review') { if (/rebuttal|response|回复/.test(value)) return 'rebuttal'; if (/citation|integrity|引用|诚信/.test(value)) return 'citation-integrity'; if (/logic|method|critical|逻辑|方法/.test(value)) return 'logic-method-review'; return 'paper-review'; }
  if (category === 'grant-writing') return /budget|impact|预算|影响/.test(value) ? 'budget-impact' : /review|评审/.test(value) ? 'grant-review' : 'proposal';
  if (category === 'open-access') return /data|code|数据|代码/.test(value) ? 'open-data' : /preprint|arxiv|预印本/.test(value) ? 'preprint' : 'open-science';
  if (category === 'patent-writing') return /search|prior|检索/.test(value) ? 'prior-art' : 'patent-drafting';
  if (/gap|空白/.test(value)) return 'gap-discovery'; if (/critical|thinking|批判/.test(value)) return 'critical-thinking'; if (/workflow|project|pipeline|工作流/.test(value)) return 'project-workflow'; if (/interdiscip|跨学科/.test(value)) return 'interdisciplinary'; return 'ideation';
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}

function slugify(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function conciseChineseSummary(value, fallbackName) {
  let text = String(value || '').replace(/\s+/g, ' ').replace(/(?:关键词|Keywords)[:：].*$/i, '').trim();
  text = text.replace(/^(?:这个|该|本)?(?:技能|工具)(?:主要)?(?:是一个|是一款|用于|可以|能够|专门用于|旨在)\s*/i, '');
  const sentences = text.split(/(?<=。)/).filter(Boolean);
  text = sentences.slice(0, 2).join('').trim() || `${fallbackName}提供明确的输入、处理步骤和可检查输出。`;
  return text.length > 140 ? `${text.slice(0, 137).replace(/[，、；：\s]+$/u, '')}…` : text;
}

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
}

async function checkout(source, tempRoot, option = '') {
  const supplied = option && arg(option);
  if (supplied) return resolve(supplied);
  const destination = join(tempRoot, source.id);
  execFileSync('git', ['clone', '--depth', '1', source.repo, destination], { stdio: 'inherit' });
  return destination;
}

async function walk(dir, predicate = () => true) {
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '__pycache__') continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (predicate(path)) files.push(path);
    }
  }
  await visit(dir);
  return files.sort();
}

function parseSkill(markdown, path) {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) throw new Error(`Missing frontmatter: ${path}`);
  const metadata = YAML.parse(match[1]) || {};
  if (!metadata.name || !metadata.description) throw new Error(`Missing name/description: ${path}`);
  return metadata;
}

function markdownTitle(markdown, fallback) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*`]/g, '').trim() || fallback;
}

function categoryForText(name, description = '') {
  const text = `${name} ${description}`.toLowerCase();
  if (/patent|专利/.test(text)) return 'patent-writing';
  if (/grant|funding|基金|proposal/.test(text)) return 'grant-writing';
  if (/figure|visual|plot|chart|schematic|绘图|图表|mindmap/.test(text)) return 'scientific-figures';
  if (/review|audit|rebuttal|审稿|评审|诚信/.test(text)) return 'peer-review';
  if (/conference|submission|poster|slides|presentation|会议|投稿/.test(text)) return 'academic-conference';
  if (/open.access|preprint|开放获取/.test(text)) return 'open-access';
  if (/literature|citation|reference|search|survey|文献|检索|引用/.test(text)) return 'literature-search';
  if (/experiment|statistic|methodology|实验|统计/.test(text)) return 'experiment-design';
  if (/writing|paper|abstract|introduction|method|result|discussion|conclusion|论文|写作|翻译/.test(text)) return 'paper-writing';
  return 'exploration-discovery';
}

function typeForCategory(category) {
  if (category === 'paper-writing' || category === 'patent-writing' || category === 'grant-writing') return 'writing';
  if (category === 'peer-review') return 'review';
  if (category === 'scientific-figures') return 'draw';
  if (category === 'experiment-design') return 'analysis';
  return 'research';
}

function alterlabChineseName(name, markdown, explicitCategory = '') {
  if (ALTERLAB_NAMES_ZH[name]) return ALTERLAB_NAMES_ZH[name];
  const proper = name.replace(/^alterlab-/, '').split('-').map(part => {
    const aliases = { 'ml': 'ML', 'ai': 'AI', 'bgpt': 'BGPT', 'pdf': 'PDF', 'pptx': 'PPTX', 'latex': 'LaTeX', 'pyzotero': 'Zotero', 'arxiv': 'arXiv', 'openalex': 'OpenAlex' };
    return aliases[part] || part[0]?.toUpperCase() + part.slice(1);
  }).join(' ');
  const category = explicitCategory || categoryForText(name, markdownTitle(markdown, name));
  const suffix = {
    'literature-search': '文献工具', 'experiment-design': '实验分析', 'paper-writing': '论文写作',
    'scientific-figures': '科研绘图', 'academic-conference': '学术会议', 'grant-writing': '基金申请',
    'peer-review': '同行评审', 'open-access': '开放获取', 'exploration-discovery': '科研探索',
  }[category];
  return `${proper} ${suffix}`;
}

function makeYaml({ name, displayName, displayNameZh, description, descriptionZh, category, subcategory: explicitSubcategory = '', prompt, url, license, resourceRoot = '', resourceDir = '', upstreamName = '', commit = '', sourceStars = 0, starsCheckedAt = '', autoRecommend = false, tags = [] }) {
  const subcategory = explicitSubcategory || subcategoryFor(name, category, `${description} ${descriptionZh}`);
  return {
    name,
    display_name: displayName,
    display_name_zh: displayNameZh,
    description,
    description_zh: descriptionZh,
    type: typeForCategory(category),
    categories: [category],
    category_zh: categoryNames[category],
    subcategory,
    subcategory_zh: SUBCATEGORY_ZH[subcategory] || '其他',
    trigger: 'manual',
    auto_recommend: autoRecommend,
    tags: [...new Set([categoryNames[category], ...tags].filter(Boolean))].slice(0, 12),
    url,
    source_license: license,
    adapted_from: url,
    upstream_name: upstreamName,
    upstream_commit: commit,
    ...(sourceStars ? { source_stars: sourceStars, stars_checked_at: starsCheckedAt || now } : {}),
    ...(resourceRoot ? { resource_root: resourceRoot } : {}),
    ...(resourceDir ? { resource_dir: resourceDir } : {}),
    prompt,
  };
}

async function copyRepo(sourceDir, destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await cp(sourceDir, destination, { recursive: true, filter: path => basename(path) !== '.git' && basename(path) !== '__pycache__' && !path.endsWith('.pyc') });
}

async function syncAlterlab(tempRoot, generated, sourceRecords) {
  const sourceDir = await checkout(alterlabSource, tempRoot, '--alterlab-source');
  const commit = git(sourceDir, 'rev-parse', 'HEAD');
  const all = await walk(join(sourceDir, 'skills'), path => basename(path) === 'SKILL.md');
  const selected = [];
  for (const file of all) {
    const rel = relative(sourceDir, file).split('\\').join('/');
    const domain = rel.split('/')[1];
    const markdown = await readFile(file, 'utf8');
    const meta = parseSkill(markdown, file);
    if (!alterlabAllowlist.has(meta.name)) continue;
    selected.push({ file, rel, markdown, meta });
  }

  const destination = join(resourcesDir, 'alterlab');
  await rm(destination, { recursive: true, force: true });
  for (const legal of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'PROVENANCE.md', 'CITATION.cff']) {
    await cp(join(sourceDir, legal), join(destination, legal), { recursive: true }).catch(() => {});
  }
  for (const item of selected) await cp(dirname(item.file), join(destination, dirname(item.rel)), { recursive: true });
  for (const support of ['skills/core/shared', 'skills/core/references', 'skills/core/scripts', 'skills/core/hooks']) {
    await cp(join(sourceDir, support), join(destination, support), { recursive: true }).catch(() => {});
  }

  for (const item of selected) {
    const domain = item.rel.split('/')[1];
    const category = ALTERLAB_CATEGORY_OVERRIDES[item.meta.name] || (domain === 'writing-tools' ? 'paper-writing'
      : domain === 'visualization' ? 'scientific-figures'
        : ['data-science', 'methodology'].includes(domain) ? 'experiment-design'
          : ['research-tools', 'databases'].includes(domain) ? 'literature-search'
            : categoryForText(item.meta.name, item.meta.description));
    const zhName = alterlabChineseName(item.meta.name, item.markdown, category);
    generated.push({ file: `${item.meta.name}.yaml`, skill: makeYaml({
      name: item.meta.name,
      displayName: ALTERLAB_NAMES_EN[item.meta.name] || markdownTitle(item.markdown, item.meta.name),
      displayNameZh: zhName,
      description: String(item.meta.description),
      descriptionZh: ALTERLAB_SUMMARIES_ZH[item.meta.name] || `${zhName}提供${categoryNames[category]}所需的具体步骤、检查规则和输出模板。`,
      category,
      subcategory: ALTERLAB_SUBCATEGORY_OVERRIDES[item.meta.name],
      prompt: item.markdown,
      url: `${alterlabSource.web}/tree/${commit}/${dirname(item.rel)}`,
      license: alterlabNonCommercial.has(item.meta.name) ? 'CC-BY-NC-4.0' : String(item.meta.license || '见上游许可证'),
      resourceRoot: '../skill-resources/alterlab',
      resourceDir: `../skill-resources/alterlab/${dirname(item.rel)}`,
      upstreamName: item.meta.name,
      commit,
      tags: [domain],
    }) });
  }
  sourceRecords.push({ id: 'alterlab-ai-subset', repository: alterlabSource.web, commit, skillCount: selected.length, syncedAt: now });
}

async function syncGithubSource(source, tempRoot, generated, sourceRecords) {
  const sourceDir = await checkout(source, tempRoot, `--${source.id}-source`);
  const commit = git(sourceDir, 'rev-parse', 'HEAD');
  const root = join(sourceDir, source.skillRoot);
  const files = await walk(root, path => basename(path) === 'SKILL.md' && source.select(relative(root, path).split('\\').join('/')));
  const destination = join(resourcesDir, source.id);
  if (source.copySelectedOnly) {
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    for (const legal of ['LICENSE', 'LICENSE.md', 'NOTICE', 'NOTICE.md']) {
      await cp(join(sourceDir, legal), join(destination, legal), { recursive: true }).catch(() => {});
    }
    for (const file of files) {
      const relDir = relative(sourceDir, dirname(file));
      await cp(dirname(file), join(destination, relDir), { recursive: true });
    }
  } else {
    await copyRepo(sourceDir, destination);
  }
  let syncedCount = 0;
  for (const file of files) {
    const markdown = await readFile(file, 'utf8');
    const meta = parseSkill(markdown, file);
    const original = String(meta.name);
    if (source.excludeNames?.has(original)) continue;
    const pair = source.names[original] || [markdownTitle(markdown, original), String(meta.description)];
    const zhName = /[\u4e00-\u9fff]/.test(pair[0]) ? pair[0] : `${pair[0]} 科研技能`;
    const zhDescription = /[\u4e00-\u9fff]/.test(pair[1]) ? pair[1] : `${zhName}用于 AI/ML 研究的规划、执行或论文写作。`;
    const category = source.categories?.[original] || categoryForText(original, `${meta.description} ${zhName}`);
    const relDir = relative(sourceDir, dirname(file)).split('\\').join('/');
    const name = source.canonicalNames?.[original] || `github-${source.id}-${slugify(original)}`;
    generated.push({ file: `${name}.yaml`, skill: makeYaml({
      name, displayName: source.displayNames?.[original] || markdownTitle(markdown, original), displayNameZh: zhName,
      description: String(meta.description), descriptionZh: zhDescription, category, subcategory: source.subcategories?.[original], prompt: markdown,
      url: `${source.web}/tree/${commit}/${relDir}`, license: String(source.license || meta.license || 'MIT'),
      resourceRoot: `../skill-resources/${source.id}`, resourceDir: `../skill-resources/${source.id}/${relDir}`,
      upstreamName: original, commit, sourceStars: source.stars, starsCheckedAt: now, autoRecommend: source.autoRecommend, tags: ['AI', 'ML', 'CCF-A', 'ICLR', 'ICML'],
    }) });
    syncedCount += 1;
  }
  sourceRecords.push({ id: source.id, repository: source.web, commit, skillCount: syncedCount, stars: source.stars || undefined, starsCheckedAt: source.stars ? now : undefined, syncedAt: now });
}

const medicalPattern = /(?:pubmed|medrxiv|biorxiv|biomedical|medical|medicine|clinical|care-check|uniprot|bio-research|bio-strategy|strobe|consort|医学|临床|生物医学|病例报告|医疗)/i;
const skillsBotAllowlist = new Set(['1543', '1793', '8834', '12951']);
const skillsBotCanonicalNames = {
  '1543': 'related-work-analyzer',
  '1793': 'semantic-scholar-search',
  '8834': 'scientific-figure-assembly',
  '12951': 'scientific-clarity-checker',
};
const skillsBotDisplayNames = {
  '1543': 'Related Work Analyzer', '1793': 'Semantic Scholar Search',
  '8834': 'Scientific Figure Assembly', '12951': 'Scientific Clarity Checker',
};
const skillsBotDescriptions = {
  '1543': 'Analyze computer-science related work through technical taxonomy, comparison tables, citation structure, timelines, and research-gap positioning.',
  '1793': 'Search Semantic Scholar for papers, authors, citations, related work, and trend signals using verifiable API metadata.',
  '8834': 'Assemble publication-ready multi-panel scientific figures with consistent labels, spacing, dimensions, and export quality.',
  '12951': 'Audit scientific documents for claim-evidence alignment, logical flow, terminology consistency, quantitative precision, and calibrated certainty.',
};
const skillsBotCategoryMap = { '文献检索': 'literature-search', '实验设计': 'experiment-design', '论文写作': 'paper-writing', '专利撰写': 'patent-writing', '科研绘图': 'scientific-figures', '学术会议': 'academic-conference', '基金申请': 'grant-writing', '同行评审': 'peer-review', '开放获取': 'open-access', '探险、发现': 'exploration-discovery', '科研学术': 'exploration-discovery' };

async function fetchJson(url, attempts = 6) {
  for (let i = 0; i < attempts; i += 1) {
    const response = await fetch(url);
    const body = await response.json().catch(() => null);
    if (response.ok && body?.data) return body.data;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 250 * (i + 1)));
  }
  return null;
}

async function syncSkillsBot(generated, sourceRecords) {
  const api = 'https://www.skillsbot.cn/skillv3/api';
  const records = new Map();
  for (let page = 1; page <= 22; page += 1) {
    const data = await fetchJson(`${api}/github/file/category/79/page/${page}?limit=12`);
    for (const record of data?.records || []) records.set(record.id, record);
  }
  let skippedMedical = 0;
  let skippedOffProfile = 0;
  let fallbackCount = 0;
  let syncedCount = 0;
  for (const record of records.values()) {
    if (!skillsBotAllowlist.has(String(record.id))) { skippedOffProfile += 1; continue; }
    const detail = await fetchJson(`${api}/github/file/${record.id}`);
    const item = detail || record;
    if (medicalPattern.test(`${item.enName || ''} ${item.name || ''}`)) { skippedMedical += 1; continue; }
    if (!detail) fallbackCount += 1;
    const original = slugify(item.enName || item.originalName || `skill-${item.id}`) || `skill-${item.id}`;
    const name = skillsBotCanonicalNames[String(item.id)] || `skillsbot-${original}-${item.id}`;
    const zhName = String(item.name || original).replace(/Skill$/i, '').trim();
    const zhDescription = conciseChineseSummary(item.description, zhName);
    const category = skillsBotCategoryMap[item.categoryName] || 'exploration-discovery';
    const subcategory = String(item.id) === '1793' ? 'database-semantic-scholar'
      : String(item.id) === '1543' ? 'related-work'
        : String(item.id) === '8834' ? 'figure-layout'
          : String(item.id) === '12951' ? 'logic-method-review' : '';
    const prompt = String(item.detail || `# ${zhName}\n\n${zhDescription}\n\n请先确认用户目标、输入材料和输出格式，再按步骤完成任务并核验结果。`);
    generated.push({ file: `${name}.yaml`, skill: makeYaml({
      name, displayName: skillsBotDisplayNames[String(item.id)] || item.enName || original, displayNameZh: zhName,
      description: skillsBotDescriptions[String(item.id)] || (item.enName ? `${item.enName} from SkillsBot scientific academic catalog` : zhDescription),
      descriptionZh: zhDescription, category, subcategory, prompt,
      url: `https://www.skillsbot.cn/skill/${item.id}`, license: '来源页面未标注，请核对原作者许可',
      upstreamName: item.enName || original, tags: ['SkillsBot', categoryNames[category]],
    }) });
    syncedCount += 1;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 35));
  }
  sourceRecords.push({ id: 'skillsbot-scientific-academic-curated', repository: 'https://www.skillsbot.cn/category/79', skillCount: syncedCount, skippedMedical, skippedOffProfile, fallbackCount, syncedAt: now });
}

async function replaceGenerated(generated, sourceRecords) {
  let old = [];
  try { old = JSON.parse(await readFile(manifestPath, 'utf8')).generatedFiles || []; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const file of old) await rm(join(skillsDir, file), { force: true });
  for (const { file, skill } of generated) await writeFile(join(skillsDir, file), YAML.stringify(skill, { lineWidth: 0 }), 'utf8');
  await writeFile(manifestPath, `${JSON.stringify({ generated: true, profile: 'ai-ml-academic', totalSkills: generated.length, generatedFiles: generated.map(x => x.file).sort(), sources: sourceRecords }, null, 2)}\n`, 'utf8');
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'paper-agent-ai-skills-'));
  const generated = [];
  const sourceRecords = [];
  try {
    await rm(join(resourcesDir, 'medsci'), { recursive: true, force: true });
    await syncAlterlab(tempRoot, generated, sourceRecords);
    for (const source of githubSources) await syncGithubSource(source, tempRoot, generated, sourceRecords);
    await syncSkillsBot(generated, sourceRecords);
    const duplicate = generated.find((item, index) => generated.findIndex(other => other.skill.name === item.skill.name) !== index);
    if (duplicate) throw new Error(`Duplicate generated name: ${duplicate.skill.name}`);
    await replaceGenerated(generated, sourceRecords);
    process.stdout.write(`Synced ${generated.length} AI/ML academic YAML Skills.\n`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await main();
