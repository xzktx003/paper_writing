import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { listSkills, SkillInfo } from '../api/skillApi';

// Language type
export type Language = 'zh' | 'en';

// Skill categories with i18n
export const SKILL_CATEGORIES = [
  { id: 'literature-search', name: { zh: '文献检索', en: 'Literature Search' }, icon: '📚', description: { zh: '检索、筛选、综述与引用管理', en: 'Search, screening, synthesis, and citations' } },
  { id: 'experiment-design', name: { zh: '实验设计', en: 'Experiment Design' }, icon: '🧪', description: { zh: '基线、消融、统计与可复现性', en: 'Baselines, ablations, statistics, reproducibility' } },
  { id: 'paper-writing', name: { zh: '论文写作', en: 'Paper Writing' }, icon: '✍️', description: { zh: 'AI/ML论文各章节写作与润色', en: 'AI/ML paper drafting and polishing' } },
  { id: 'patent-writing', name: { zh: '专利撰写', en: 'Patent Writing' }, icon: '📜', description: { zh: '技术交底、权利要求与专利检索', en: 'Disclosure, claims, and prior-art search' } },
  { id: 'scientific-figures', name: { zh: '科研绘图', en: 'Scientific Figures' }, icon: '📊', description: { zh: '实验图、架构图与发表级可视化', en: 'Plots, architecture diagrams, publication visuals' } },
  { id: 'academic-conference', name: { zh: '学术会议', en: 'Academic Conference' }, icon: '🎓', description: { zh: '投稿、演示、海报与会务材料', en: 'Submission, talks, posters, and conference materials' } },
  { id: 'grant-writing', name: { zh: '基金申请', en: 'Grant Writing' }, icon: '💰', description: { zh: '项目申请书、预算与影响陈述', en: 'Proposals, budgets, and impact statements' } },
  { id: 'peer-review', name: { zh: '同行评审', en: 'Peer Review' }, icon: '🔍', description: { zh: '预审、审稿回复与科研诚信', en: 'Review, rebuttal, and research integrity' } },
  { id: 'open-access', name: { zh: '开放获取', en: 'Open Access' }, icon: '🔓', description: { zh: '预印本、开放数据与开放科学', en: 'Preprints, open data, and open science' } },
  { id: 'exploration-discovery', name: { zh: '研究探索', en: 'Research Exploration' }, icon: '🧭', description: { zh: '选题、研究空白与新方向探索', en: 'Topics, research gaps, and new directions' } },
];

// Helper to get localized text
export function t(text: { zh: string; en: string } | string | undefined, lang: Language): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  return text[lang];
}

// Complete display name translations for all actual skills
export const displayNameTranslations: Record<string, { zh: string; en: string }> = {
  // Main categories
  'Writing': { zh: '写作', en: 'Writing' },
  'Research': { zh: '研究', en: 'Research' },
  'Review': { zh: '评审', en: 'Review' },
  'Draw': { zh: '绘图', en: 'Draw' },
  'Analysis': { zh: '分析', en: 'Analysis' },
  'Utility': { zh: '工具', en: 'Utility' },
  // Writing skills
  'Academic Paper Writer': { zh: '学术论文写作', en: 'Academic Paper Writer' },
  'Academic Pipeline': { zh: '学术写作流程', en: 'Academic Pipeline' },
  'Academic Polishing': { zh: '学术润色', en: 'Academic Polishing' },
  'Anti-AI Writing': { zh: '反AI检测写作', en: 'Anti-AI Writing' },
  'Doc Co-authoring': { zh: '文档协作写作', en: 'Doc Co-authoring' },
  'Grant Proposal Writing': { zh: '基金申请书写作', en: 'Grant Proposal Writing' },
  'ML Paper Writing': { zh: '机器学习论文写作', en: 'ML Paper Writing' },
  'Nature Writing': { zh: 'Nature风格写作', en: 'Nature Writing' },
  'Nature Polishing': { zh: 'Nature风格润色', en: 'Nature Polishing' },
  'Scientific Writing': { zh: '科学写作', en: 'Scientific Writing' },
  'Paper Planning': { zh: '论文规划', en: 'Paper Planning' },
  'Paper Storyline': { zh: '论文故事线', en: 'Paper Storyline' },
  // Writing sections
  'Abstract Writing': { zh: '摘要撰写', en: 'Abstract Writing' },
  'Introduction Writing': { zh: '引言撰写', en: 'Introduction Writing' },
  'Conclusion Writing': { zh: '结论撰写', en: 'Conclusion Writing' },
  'Discussion Writing': { zh: '讨论撰写', en: 'Discussion Writing' },
  'Methodology Writing': { zh: '方法论撰写', en: 'Methodology Writing' },
  'Results & Analysis Writing': { zh: '结果分析撰写', en: 'Results & Analysis Writing' },
  'Results Report': { zh: '结果报告', en: 'Results Report' },
  'Writing Polishing': { zh: '写作润色', en: 'Writing Polishing' },
  // Research skills
  'Deep Research': { zh: '深度研究', en: 'Deep Research' },
  'Brainstorming': { zh: '头脑风暴', en: 'Brainstorming' },
  'Scientific Brainstorming': { zh: '科学头脑风暴', en: 'Scientific Brainstorming' },
  'Research Ideation': { zh: '研究创意', en: 'Research Ideation' },
  'Idea Mining': { zh: '创意挖掘', en: 'Idea Mining' },
  'Hypothesis Formulation': { zh: '假设构建', en: 'Hypothesis Formulation' },
  'Experimental Design': { zh: '实验设计', en: 'Experimental Design' },
  'Meta-Analysis': { zh: '元分析', en: 'Meta-Analysis' },
  'Systematic Review': { zh: '系统综述', en: 'Systematic Review' },
  'Literature Search': { zh: '文献搜索', en: 'Literature Search' },
  'Literature Review': { zh: '文献综述', en: 'Literature Review' },
  'Daily Paper Generator': { zh: '每日论文生成', en: 'Daily Paper Generator' },
  // Review skills
  'Academic Paper Reviewer': { zh: '学术论文评审', en: 'Academic Paper Reviewer' },
  'Paper Self-Review': { zh: '论文自审', en: 'Paper Self-Review' },
  'Evidence Review': { zh: '证据审查', en: 'Evidence Review' },
  'Reviewer Response': { zh: '审稿人回复', en: 'Reviewer Response' },
  'Review Response': { zh: '审稿回复', en: 'Review Response' },
  // Citation/Reference
  'Citation Verification': { zh: '引用验证', en: 'Citation Verification' },
  'Reference Management': { zh: '参考文献管理', en: 'Reference Management' },
  'Conference Submission': { zh: '会议投稿', en: 'Conference Submission' },
  // Draw/Figure skills
  'Nature Figure Design': { zh: 'Nature图表设计', en: 'Nature Figure Design' },
  'Publication Charts': { zh: '发表级图表', en: 'Publication Charts' },
  'Academic Poster Design': { zh: '学术海报设计', en: 'Academic Poster Design' },
  'Paper to Presentation (PPT/Beamer)': { zh: '论文转PPT/Beamer', en: 'Paper to Presentation (PPT/Beamer)' },
  'Scientific Visualization': { zh: '科学可视化', en: 'Scientific Visualization' },
  'Frontend Design': { zh: '前端设计', en: 'Frontend Design' },
  'UI/UX Pro Max': { zh: 'UI/UX高级设计', en: 'UI/UX Pro Max' },
  // Analysis skills
  'Statistical Analysis': { zh: '统计分析', en: 'Statistical Analysis' },
  'Statistical Reporting': { zh: '统计报告', en: 'Statistical Reporting' },
  'Results Analysis': { zh: '结果分析', en: 'Results Analysis' },
  'Nature Data Availability': { zh: '数据可用性说明', en: 'Nature Data Availability' },
  // ARS (Academic Writing Assistant) skills
  'ARS Abstract': { zh: 'ARS摘要', en: 'ARS Abstract' },
  'ARS Citation Check': { zh: 'ARS引用检查', en: 'ARS Citation Check' },
  'ARS Disclosure': { zh: 'ARS学术公开', en: 'ARS Disclosure' },
  'ARS Format Convert': { zh: 'ARS格式转换', en: 'ARS Format Convert' },
  'ARS Full Pipeline': { zh: 'ARS完整流程', en: 'ARS Full Pipeline' },
  'ARS Literature Review': { zh: 'ARS文献综述', en: 'ARS Literature Review' },
  'ARS Outline': { zh: 'ARS大纲生成', en: 'ARS Outline' },
  'ARS Revision': { zh: 'ARS论文修订', en: 'ARS Revision' },
  'ARS Revision Coach': { zh: 'ARS修订指导', en: 'ARS Revision Coach' },
  // Other utilities
  'LaTeX Debugging': { zh: 'LaTeX调试', en: 'LaTeX Debugging' },
  'LaTeX Template Organizer': { zh: 'LaTeX模板管理', en: 'LaTeX Template Organizer' },
  'Academic Search & Retrieval': { zh: '学术搜索与检索', en: 'Academic Search & Retrieval' },
  'Post-Acceptance': { zh: '接收后事项', en: 'Post-Acceptance' },
  // GitHub Open-Source Skills (Real)
  'paper-review': { zh: '学术论文评审', en: 'Paper Reviewer' },
  'wu5-research': { zh: '科研论文写作流程', en: 'Research Paper Pipeline' },
  'research-writing': { zh: '科研论文写作助手', en: 'Research Writing Assistant' },
};

// Get localized display name
export function getLocalizedDisplayName(skill: SkillInfo, lang: Language): string {
  const displayName = skill.display_name || skill.name;
  
  // Check if we have a translation
  if (displayNameTranslations[displayName]) {
    return displayNameTranslations[displayName][lang];
  }
  
  // Check for Chinese display_name_zh field
  if (lang === 'zh' && (skill as any).display_name_zh) {
    return (skill as any).display_name_zh;
  }
  
  // If already in target language, return as-is
  const isChinese = /[\u4e00-\u9fa5]/.test(displayName);
  if ((lang === 'zh' && isChinese) || (lang === 'en' && !isChinese)) {
    return displayName;
  }
  
  return displayName;
}

// Complete description translations for all actual skills
const descriptionTranslations: Record<string, { zh: string; en: string }> = {
  // Writing skills
  'Full academic paper writing skill': { zh: '完整学术论文写作技能', en: 'Full academic paper writing skill' },
  'Full academic research pipeline orchestrator': { zh: '完整学术研究流程编排器', en: 'Full academic research pipeline orchestrator' },
  'Academic polishing service': { zh: '学术润色服务', en: 'Academic polishing service' },
  'Academic language polishing for clarity, flow, tone, grammar, and reviewer-safe revision without changing unsupported meaning': { zh: '学术语言润色：清晰度、流畅度、语气、语法和审稿人安全修订', en: 'Academic language polishing for clarity, flow, tone, grammar, and reviewer-safe revision without changing unsupported meaning' },
  'Multi-perspective peer review with dynamic reviewer personas': { zh: '多角度同行评审，动态评审角色', en: 'Multi-perspective peer review with dynamic reviewer personas' },
  'Bilingual abstract and keywords generation': { zh: '双语摘要和关键词生成', en: 'Bilingual abstract and keywords generation' },
  'Convert between LaTeX, DOCX, PDF, Markdown': { zh: 'LaTeX、DOCX、PDF、Markdown格式互转', en: 'Convert between LaTeX, DOCX, PDF, Markdown' },
  'Complete academic workflow: research to finalize': { zh: '完整学术工作流：从研究到定稿', en: 'Complete academic workflow: research to finalize' },
  'Annotated bibliography in paper format': { zh: '论文格式的带注释参考文献', en: 'Annotated bibliography in paper format' },
  'Detailed paper outline with evidence map': { zh: '带证据图的详细论文大纲', en: 'Detailed paper outline with evidence map' },
  'Revision roadmap and response letter skeleton': { zh: '修订路线图和回复信模板', en: 'Revision roadmap and response letter skeleton' },
  'Revised draft plus point-by-point response': { zh: '修订稿及逐点回复', en: 'Revised draft plus point-by-point response' },
  'Collaborative document creation workflow': { zh: '协作文档创建工作流', en: 'Collaborative document creation workflow' },
  'Write publication-ready ML/AI papers for top conferences': { zh: '撰写顶级会议发表级别的ML/AI论文', en: 'Write publication-ready ML/AI papers for top conferences' },
  'Academic manuscript writing with IMRAD structure, citation formatting, and reporting guidelines. Use when drafting or revising research papers.': { zh: '学术手稿写作：IMRAD结构、引用格式和报告规范', en: 'Academic manuscript writing with IMRAD structure, citation formatting, and reporting guidelines' },
  'Draft Nature-style manuscript sections from research materials': { zh: '从研究材料起草Nature风格手稿章节', en: 'Draft Nature-style manuscript sections from research materials' },
  'Polish academic prose into Nature-quality English': { zh: '将学术文章润色为Nature质量的英文', en: 'Polish academic prose into Nature-quality English' },
  'Remove AI writing patterns to sound natural': { zh: '移除AI写作模式，使文章更自然', en: 'Remove AI writing patterns to sound natural' },
  'Plan paper structure, writing roadmap, storyline, contribution framing, experiment roadmap, and reviewer-risk checklist before drafting sections': { zh: '规划论文结构、写作路线图、故事线、贡献定位、实验路线图和审稿风险清单', en: 'Plan paper structure, writing roadmap, storyline, contribution framing, experiment roadmap, and reviewer-risk checklist' },
  'Structure and organize paper narrative: from scattered ideas to coherent story': { zh: '构建和组织论文叙事：从零散想法到连贯故事', en: 'Structure and organize paper narrative: from scattered ideas to coherent story' },
  'Research paper introduction following the CARS model (Create a Research Space) with context, gap, and contribution': { zh: '遵循CARS模型的研究论文引言：背景、缺口和贡献', en: 'Research paper introduction following the CARS model (Create a Research Space) with context, gap, and contribution' },
  'Structured abstract generation following journal-specific formats (structured/unstructured, 150-300 words)': { zh: '遵循期刊格式的结构化摘要生成', en: 'Structured abstract generation following journal-specific formats (structured/unstructured, 150-300 words)' },
  'Interpretation, implications, limitations, and future work in the discussion section': { zh: '讨论部分的解读、意义、局限性和未来工作', en: 'Interpretation, implications, limitations, and future work in the discussion section' },
  'Strong conclusion sections with contribution summary, impact statement, and future outlook': { zh: '有力的结论部分：贡献总结、影响声明和未来展望', en: 'Strong conclusion sections with contribution summary, impact statement, and future outlook' },
  'Reproducible methodology section with algorithm descriptions, mathematical formulations, and experimental setup': { zh: '可复现的方法论部分：算法描述、数学公式和实验设置', en: 'Reproducible methodology section with algorithm descriptions, mathematical formulations, and experimental setup' },
  'Post-experiment summary report writing': { zh: '实验后总结报告写作', en: 'Post-experiment summary report writing' },
  'Comprehensive quality assurance checklist for papers': { zh: '论文全面质量保证清单', en: 'Comprehensive quality assurance checklist for papers' },
  // Research skills
  'Deep research exploration and literature review': { zh: '深度研究探索和文献综述', en: 'Deep research exploration and literature review' },
  'Creative brainstorming for research ideas, problem reframing, and novel angles': { zh: '研究创意头脑风暴、问题重塑和新角度', en: 'Creative brainstorming for research ideas, problem reframing, and novel angles' },
  'Brainstorm research ideas using 5W1H framework': { zh: '使用5W1H框架头脑风暴研究创意', en: 'Brainstorm research ideas using 5W1H framework' },
  'Systematically mine research ideas from literature gaps, trends, and cross-domain opportunities': { zh: '系统挖掘文献空白、趋势和跨领域机会中的研究创意', en: 'Systematically mine research ideas from literature gaps, trends, and cross-domain opportunities' },
  'Research topic ideation with gap analysis, novelty assessment, trend mapping, and cross-disciplinary synthesis': { zh: '研究主题创意：缺口分析、新颖性评估、趋势映射和跨学科综合', en: 'Research topic ideation with gap analysis, novelty assessment, trend mapping, and cross-disciplinary synthesis' },
  'Comprehensive literature review with thematic synthesis, citation mapping, and gap identification': { zh: '综合文献综述：主题综合、引用图谱和缺口识别', en: 'Comprehensive literature review with thematic synthesis, citation mapping, and gap identification' },
  'Systematic literature review methodology including search strategy, screening, and synthesis. Use when conducting literature reviews or writing background sections.': { zh: '系统综述方法论：搜索策略、筛选和综合', en: 'Systematic literature review methodology including search strategy, screening, and synthesis' },
  'Structured methodology for comprehensive literature review following PRISMA guidelines. Use during literature search and screening stages.': { zh: '遵循PRISMA指南的综合文献综述结构化方法', en: 'Structured methodology for comprehensive literature review following PRISMA guidelines' },
  'Systematic academic literature search across databases (arXiv, PubMed, Google Scholar, Semantic Scholar) with search strategy design, query optimization, and result management': { zh: '跨数据库系统学术文献搜索（arXiv、PubMed、Google Scholar、Semantic Scholar）', en: 'Systematic academic literature search across databases (arXiv, PubMed, Google Scholar, Semantic Scholar) with search strategy design, query optimization, and result management' },
  'Statistical methods for combining results across multiple studies. Use when aggregating cross-study or cross-experiment results.': { zh: '合并多项研究结果的统计方法', en: 'Statistical methods for combining results across multiple studies' },
  'Best practices for designing reproducible ML experiments. Use when planning ablations, baselines, or controlled experiments.': { zh: '设计可复现ML实验的最佳实践', en: 'Best practices for designing reproducible ML experiments' },
  'Structured scientific hypothesis generation from observations. Use when formulating testable hypotheses, competing explanations, or experimental predictions.': { zh: '从观察中生成结构化科学假设', en: 'Structured scientific hypothesis generation from observations' },
  'Generate daily paper digests from arXiv and bioRxiv': { zh: '生成arXiv和bioRxiv每日论文摘要', en: 'Generate daily paper digests from arXiv and bioRxiv' },
  // Review skills
  'Review AI-written text, citation grounding, single claims, hallucinated citations, and safe adoption readiness against the current evidence pack': { zh: '审查AI写作文本、引用基础、单一论点、虚构引用和安全采用准备度', en: 'Review AI-written text, citation grounding, single claims, hallucinated citations, and safe adoption readiness against the current evidence pack' },
  'Draft point-by-point reviewer response letters': { zh: '起草逐点审稿人回复信', en: 'Draft point-by-point reviewer response letters' },
  'Structured rebuttal and reviewer response drafting with comment decomposition, evidence-backed replies, and revision action planning': { zh: '结构化反驳和审稿人回复：评论分解、有证据的回复和修订行动计划', en: 'Structured rebuttal and reviewer response drafting with comment decomposition, evidence-backed replies, and revision action planning' },
  'Systematic review response and rebuttal writing': { zh: '系统综述回复和反驳写作', en: 'Systematic review response and rebuttal writing' },
  // Citation/Reference
  'Citation error report and format verification': { zh: '引用错误报告和格式验证', en: 'Citation error report and format verification' },
  'Verify citations using programmatic scholarly sources': { zh: '使用编程方式验证引用来源', en: 'Verify citations using programmatic scholarly sources' },
  'Conference paper submission workflow including format compliance, cover letter, and rebuttal preparation': { zh: '会议论文投稿工作流，含格式合规、求职信和rebuttal准备', en: 'Conference paper submission workflow including format compliance, cover letter, and rebuttal preparation' },
  'BibTeX/BibLaTeX bibliography management, citation formatting, and reference organization': { zh: 'BibTeX/BibLaTeX参考文献管理、引用格式和文献组织', en: 'BibTeX/BibLaTeX bibliography management, citation formatting, and reference organization' },
  // Draw/Figure
  'Create publication-quality scientific figures and tables': { zh: '创建发表级科学图表', en: 'Create publication-quality scientific figures and tables' },
  'Nature-quality scientific figure creation with journal-specific formatting, color accessibility, and multi-panel layouts': { zh: 'Nature质量的科学图表创建，期刊特定格式、色彩可访问性和多面板布局', en: 'Nature-quality scientific figure creation with journal-specific formatting, color accessibility, and multi-panel layouts' },
  'Publication-ready scientific figure design with matplotlib and seaborn. Use when creating journal submission figures with proper formatting, accessibility, and statistical annotations.': { zh: '使用matplotlib和seaborn的发表级科学图表设计', en: 'Publication-ready scientific figure design with matplotlib and seaborn' },
  'UI/UX design principles and implementation': { zh: 'UI/UX设计原则与实现', en: 'UI/UX design principles and implementation' },
  'Advanced UI/UX design system': { zh: '高级UI/UX设计系统', en: 'Advanced UI/UX design system' },
  'Conference poster layout design with visual hierarchy, information density optimization, and print-ready specifications': { zh: '会议海报布局设计：视觉层次、信息密度优化和打印规格', en: 'Conference poster layout design with visual hierarchy, information density optimization, and print-ready specifications' },
  'Conference presentation, poster, and promotion prep': { zh: '会议演讲、海报和宣传准备', en: 'Conference presentation, poster, and promotion prep' },
  'Convert research papers into conference presentations, academic slides, and poster layouts with clear visual storytelling': { zh: '将研究论文转换为会议演示、学术幻灯片和海报布局', en: 'Convert research papers into conference presentations, academic slides, and poster layouts with clear visual storytelling' },
  // Analysis
  'Clear results presentation with statistical reporting, figure references, and comparative analysis': { zh: '清晰的结果展示：统计报告、图表引用和比较分析', en: 'Clear results presentation with statistical reporting, figure references, and comparative analysis' },
  'Comprehensive statistical analysis workflow: test selection, assumption checking, effect sizes, power analysis, and reproducible reporting': { zh: '综合统计分析工作流：检验选择、假设检验、效应量、功效分析和可复现报告', en: 'Comprehensive statistical analysis workflow: test selection, assumption checking, effect sizes, power analysis, and reproducible reporting' },
  'Statistical test selection, assumption checking, and APA-formatted reporting. Use when analyzing experimental results or writing results sections.': { zh: '统计检验选择、假设检验和APA格式报告', en: 'Statistical test selection, assumption checking, and APA-formatted reporting' },
  'Strict statistical analysis for ML experiments': { zh: 'ML实验的严格统计分析', en: 'Strict statistical analysis for ML experiments' },
  'Prepare Nature-ready Data Availability statements': { zh: '准备Nature风格的数据可用性声明', en: 'Prepare Nature-ready Data Availability statements' },
  // Other
  'Research grant and funding proposal writing with budget justification, impact statements, and review-ready formatting': { zh: '研究基金和资助申请书写作，含预算论证、影响声明和审阅就绪格式', en: 'Research grant and funding proposal writing with budget justification, impact statements, and review-ready formatting' },
  'AI usage disclosure statement generation': { zh: 'AI使用公开声明生成', en: 'AI usage disclosure statement generation' },
  'Diagnose and fix LaTeX or Overleaf compilation errors with minimal, reviewable changes': { zh: '诊断并修复LaTeX或Overleaf编译错误', en: 'Diagnose and fix LaTeX or Overleaf compilation errors with minimal, reviewable changes' },
  'Organize conference LaTeX templates into clean structure': { zh: '整理会议LaTeX模板为清晰结构', en: 'Organize conference LaTeX templates into clean structure' },
  // Generic
  'Writing assistance': { zh: '论文写作辅助', en: 'Writing assistance' },
  'Research tools': { zh: '研究调研工具', en: 'Research tools' },
  'Review & check': { zh: '评审和检查', en: 'Review & check' },
  'Figure generation': { zh: '图表生成', en: 'Figure generation' },
  'Data analysis': { zh: '数据分析', en: 'Data analysis' },
  'Utility tools': { zh: '实用工具', en: 'Utility tools' },
  'Paper assistance tool': { zh: '论文辅助工具', en: 'Paper assistance tool' },
  'You are a helpful assistant': { zh: '智能助手', en: 'You are a helpful assistant' },
  'Helpful assistant': { zh: '智能助手', en: 'Helpful assistant' },
  // New description translations based on GitHub research (alfonso0512/research-writing-skill)
  'Parse peer reviewer comments and generate a structured Response to Reviewers document with tracked manuscript changes': { zh: '解析审稿人意见，生成结构化的回复信文档，记录手稿修改', en: 'Parse peer reviewer comments and generate a structured Response to Reviewers document with tracked manuscript changes' },
  'Academic English consistency linting and non-native (ESL) language polish for medical manuscripts': { zh: '医学手稿的学术英语一致性检查和非母语（ESL）语言润色', en: 'Academic English consistency linting and non-native (ESL) language polish for medical manuscripts' },
  'Detect and remove AI writing patterns from academic manuscripts and response-to-reviewers letters': { zh: '检测并移除学术手稿和审稿回复信中的AI写作模式', en: 'Detect and remove AI writing patterns from academic manuscripts and response-to-reviewers letters' },
  'Expert academic translation from Chinese to English with proper terminology and formal academic style': { zh: '专家级学术中译英翻译，使用正确术语和正式学术风格', en: 'Expert academic translation from Chinese to English with proper terminology and formal academic style' },
  'Expert academic translation from English to Chinese, preserving scientific accuracy and academic register': { zh: '专家级学术英译中翻译，保持科学准确性和学术规范', en: 'Expert academic translation from English to Chinese, preserving scientific accuracy and academic register' },
  'Optimize academic Chinese prose for clarity, flow, and scholarly conventions': { zh: '优化学术中文表达：清晰度、流畅度和学术规范', en: 'Optimize academic Chinese prose for clarity, flow, and scholarly conventions' },
  'Polish academic English to TOP journal submission quality with rigorous language standards': { zh: '润色学术英文至TOP期刊投稿水平，语言严谨、格式规范', en: 'Polish academic English to TOP journal submission quality with rigorous language standards' },
  'Rewrites AI-generated Chinese text to sound naturally human-written while preserving facts': { zh: '重写AI生成的中文文本，使其读起来像人类撰写，同时保留事实', en: 'Rewrites AI-generated Chinese text to sound naturally human-written while preserving facts' },
  'Rewrites AI-generated English text to sound naturally human-written while preserving technical accuracy': { zh: '重写AI生成的英文文本，使其读起来像人类撰写，同时保留技术准确性', en: 'Rewrites AI-generated English text to sound naturally human-written while preserving technical accuracy' },
  'Critically examine paper logic, identify reasoning gaps, and suggest improvements': { zh: '批判性审视论文逻辑，识别推理缺口，并提出改进建议', en: 'Critically examine paper logic, identify reasoning gaps, and suggest improvements' },
  'Check abbreviation usage consistency and ensure proper first-appearance expansion': { zh: '检查缩写使用一致性，确保首次出现时正确扩展', en: 'Check abbreviation usage consistency and ensure proper first-appearance expansion' },
  'Design and generate publication-quality system architecture diagrams for papers': { zh: '为论文设计和生成发表级系统架构图', en: 'Design and generate publication-quality system architecture diagrams for papers' },
  'Recommend optimal figure types based on experimental data and storytelling goals': { zh: '根据实验数据和叙述目标推荐最佳图表类型', en: 'Recommend optimal figure types based on experimental data and storytelling goals' },
  'Write professional, concise, and journal-compliant figure captions in English': { zh: '用英文撰写专业、简洁、符合期刊规范的图片标题', en: 'Write professional, concise, and journal-compliant figure captions in English' },
  'Write professional, concise, and journal-compliant table captions in English': { zh: '用英文撰写专业、简洁、符合期刊规范的表格标题', en: 'Write professional, concise, and journal-compliant table captions in English' },
  'Analyze experimental results, interpret findings, and guide data-driven conclusions': { zh: '分析实验结果，解读发现，指导数据驱动的结论', en: 'Analyze experimental results, interpret findings, and guide data-driven conclusions' },
  'Simulate peer reviewer perspective to identify weaknesses before submission': { zh: '模拟同行评审视角，在投稿前识别论文弱点', en: 'Simulate peer reviewer perspective to identify weaknesses before submission' },
  'Extract key information from papers and generate structured research notes': { zh: '从论文中提取关键信息，生成结构化研究笔记', en: 'Extract key information from papers and generate structured research notes' },
  'Compare and analyze multiple papers to identify methods, trends, and research opportunities': { zh: '对比分析多篇论文，识别方法、趋势和研究机会', en: 'Compare and analyze multiple papers to identify methods, trends, and research opportunities' },
  'Identify research gaps and potential research opportunities from literature': { zh: '从文献中识别研究空白和潜在研究机会', en: 'Identify research gaps and potential research opportunities from literature' },
  'Generate detailed paper outlines with structured sections and evidence mapping': { zh: '生成详细论文大纲，包含结构化章节和证据图', en: 'Generate detailed paper outlines with structured sections and evidence mapping' },
  'Expand brief notes and bullet points into complete, polished academic sections': { zh: '将简要笔记和要点扩展为完整、润色后的学术章节', en: 'Expand brief notes and bullet points into complete, polished academic sections' },
  'Write detailed methodology sections with algorithm descriptions and experimental setup': { zh: '撰写详细方法章节，包含算法描述和实验设置', en: 'Write detailed methodology sections with algorithm descriptions and experimental setup' },
  'Draft point-by-point responses to reviewer comments with evidence-backed replies': { zh: '起草逐点回复审稿人意见，提供有证据支撑的回复', en: 'Draft point-by-point responses to reviewer comments with evidence-backed replies' },
  'Write professional cover letters for journal submissions': { zh: '撰写专业的期刊投稿信', en: 'Write professional cover letters for journal submissions' },
  'Write compelling grant proposals with innovation points and research foundation': { zh: '撰写有说服力的基金申请书，包含创新点和研究基础', en: 'Write compelling grant proposals with innovation points and research foundation' },
  'Develop comprehensive research proposals with background, objectives, and methodology': { zh: '制定全面的研究计划，包含背景、目标和研究方法', en: 'Develop comprehensive research proposals with background, objectives, and methodology' },
  'Design academic presentation outlines with clear visual storytelling': { zh: '设计具有清晰视觉叙事的学术报告大纲', en: 'Design academic presentation outlines with clear visual storytelling' },
  'Skill that audits and rewrites content to remove AI writing patterns': { zh: '审核并重写内容以去除AI写作模式的技能', en: 'Skill that audits and rewrites content to remove AI writing patterns' },
  'AI research paper writing assistant with 30+ prompt templates covering full workflow': { zh: 'AI科研论文写作助手，30+提示模板覆盖全流程', en: 'AI research paper writing assistant with 30+ prompt templates covering full workflow' },
  'Generate systematic literature reviews following PRISMA guidelines': { zh: '遵循PRISMA指南生成系统综述', en: 'Generate systematic literature reviews following PRISMA guidelines' },
  'Multi-perspective peer review with dynamic reviewer personas': { zh: '多角度同行评审，动态评审角色', en: 'Multi-perspective peer review with dynamic reviewer personas' },
  'Structured rebuttal and reviewer response drafting': { zh: '结构化反驳和审稿人回复起草', en: 'Structured rebuttal and reviewer response drafting' },
  'Verify citations using programmatic scholarly sources': { zh: '使用编程方式验证引用来源', en: 'Verify citations using programmatic scholarly sources' },
  'Grant proposal writing with budget justification and impact statements': { zh: '基金申请写作，含预算论证和影响声明', en: 'Grant proposal writing with budget justification and impact statements' },
  // ===== NEW WRITING SKILL DESCRIPTIONS (SNL-UCSB/paper-writing-skill) =====
  '5-stage academic paper writing pipeline: brainstorming → architecture → section drafts → integration → compression': { zh: '5阶段学术论文写作流程：头脑风暴→架构→章节起草→整合→压缩', en: '5-stage academic paper writing pipeline: brainstorming → architecture → section drafts → integration → compression' },
  'Write introduction following CARS model with stakes, problem gap, key abstraction, and contributions': { zh: '遵循CARS模型撰写引言：赌注、问题缺口、关键抽象和贡献', en: 'Write introduction following CARS model with stakes, problem gap, key abstraction, and contributions' },
  'Write evaluation section with claim-evidence mapping, baselines, metrics, and takeaway synthesis': { zh: '撰写实验部分：论点证据映射、基线、指标和要点综合', en: 'Write evaluation section with claim-evidence mapping, baselines, metrics, and takeaway synthesis' },
  'Write design/method section with component descriptions, design decisions, and rationale': { zh: '撰写设计/方法部分：组件描述、设计决策和理由', en: 'Write design/method section with component descriptions, design decisions, and rationale' },
  'Apply 7 compression operations to reduce paper length by 30-50% while preserving claims': { zh: '应用7种压缩操作，将论文长度减少30-50%，同时保留论点', en: 'Apply 7 compression operations to reduce paper length by 30-50% while preserving claims' },
  'Audit prose for hedging, passive voice, filler words, and AI-isms before submission': { zh: '在投稿前审查文章中的委婉语、被动语态、填充词和AI用语', en: 'Audit prose for hedging, passive voice, filler words, and AI-isms before submission' },
  'Draft structured responses to reviewer comments with evidence and revision actions': { zh: '起草结构化审稿回复，包含证据和修订行动', en: 'Draft structured responses to reviewer comments with evidence and revision actions' },
  'Generate architecture, pipeline, and concept diagrams for papers using prompts or TikZ': { zh: '使用提示词或TikZ为论文生成架构、流程和概念图', en: 'Generate architecture, pipeline, and concept diagrams for papers using prompts or TikZ' },
  'Apply 14 editorial principles for academic writing quality and coherence': { zh: '应用14条编辑原则，提高学术写作质量和连贯性', en: 'Apply 14 editorial principles for academic writing quality and coherence' },
  'Enforce sentence-level style: ~21 word mean, claim-first, active voice, no hedging': { zh: '执行句子级风格：约21词平均长度、论点优先、主动语态、无委婉语', en: 'Enforce sentence-level style: ~21 word mean, claim-first, active voice, no hedging' },
  'Follow section-specific move sequences: intro (6 moves), eval (6 moves), design (5 moves)': { zh: '遵循特定章节的修辞序列：引言(6步)、实验(6步)、设计(5步)', en: 'Follow section-specific move sequences: intro (6 moves), eval (6 moves), design (5 moves)' },
  'Apply compression operations: sentence shortening, paragraph merging, adjective removal': { zh: '应用压缩操作：句子缩短、段落合并、形容词删除', en: 'Apply compression operations: sentence shortening, paragraph merging, adjective removal' },
  'Check introduction structure: stakes → gap → key abstraction → contributions': { zh: '检查引言结构：赌注→缺口→关键抽象→贡献', en: 'Check introduction structure: stakes → gap → key abstraction → contributions' },
  'Check evaluation structure: setup → baselines → metrics → results → takeaway': { zh: '检查实验结构：设置→基线→指标→结果→要点', en: 'Check evaluation structure: setup → baselines → metrics → results → takeaway' },
  'Check design structure: overview → component details → rationale → open questions': { zh: '检查设计结构：概述→组件详情→理由→开放问题', en: 'Check design structure: overview → component details → rationale → open questions' },
  // ===== ARIS WRITING SKILL DESCRIPTIONS =====
  'Design conference poster layout with visual hierarchy and print-ready specs': { zh: '设计会议海报布局，具有视觉层次和打印规格', en: 'Design conference poster layout with visual hierarchy and print-ready specs' },
  'Convert paper to presentation slides with clear visual storytelling': { zh: '将论文转换为演示幻灯片，具有清晰的视觉叙事', en: 'Convert paper to presentation slides with clear visual storytelling' },
  'Create paper talk with speaker notes and timing optimization': { zh: '创建论文演讲，包含演讲者备注和时间优化', en: 'Create paper talk with speaker notes and timing optimization' },
  'Draft rebuttal with classification of concerns and response strategies': { zh: '起草回复，包含问题分类和回复策略', en: 'Draft rebuttal with classification of concerns and response strategies' },
  'Audit paper claims against evidence for consistency and support': { zh: '审核论文声明与证据的一致性和支持度', en: 'Audit paper claims against evidence for consistency and support' },
  'Verify citations against scholarly databases and flag issues': { zh: '验证引用与学术数据库的一致性并标记问题', en: 'Verify citations against scholarly databases and flag issues' },
  'Convert experimental results into defensible paper claims': { zh: '将实验结果转换为可辩护的论文声明', en: 'Convert experimental results into defensible paper claims' },
  'Kill weak arguments and strengthen strong ones in paper': { zh: '削弱弱论点，增强论文中的强论点', en: 'Kill weak arguments and strengthen strong ones in paper' },
  'Auto-generate plots and comparison tables from JSON/CSV results': { zh: '从JSON/CSV结果自动生成图表和比较表', en: 'Auto-generate plots and comparison tables from JSON/CSV results' },
  'Emit per-section LaTeX following venue style file with real citations': { zh: '发出遵循期刊样式文件的分节LaTeX，包含真实引用', en: 'Emit per-section LaTeX following venue style file with real citations' },
  'Plan paper structure with contribution framing and reviewer-risk checklist': { zh: '规划论文结构，包含贡献定位和审稿风险清单', en: 'Plan paper structure with contribution framing and reviewer-risk checklist' },
  'Compile paper to PDF with format compliance checking': { zh: '编译论文为PDF，进行格式合规检查', en: 'Compile paper to PDF with format compliance checking' },
  'Iterate paper improvements through multi-round review and revision': { zh: '通过多轮审稿和修订迭代改进论文', en: 'Iterate paper improvements through multi-round review and revision' },
  // ===== AVOID AI WRITING DESCRIPTIONS =====
  'Detect and rewrite content to remove AI writing patterns (AI-isms)': { zh: '检测并重写内容以去除AI写作模式(AI-isms)', en: 'Detect and rewrite content to remove AI writing patterns (AI-isms)' },
  'Audit text for AI tells: hedging, filler, template phrases, word clusters': { zh: '审核文本中的AI特征：委婉语、填充词、模板短语、词汇聚类', en: 'Audit text for AI tells: hedging, filler, template phrases, word clusters' },
  'Rewrite AI text to sound naturally human-written while preserving facts': { zh: '重写AI文本，使其读起来像人类撰写，同时保留事实', en: 'Rewrite AI text to sound naturally human-written while preserves facts' },
  // ===== NEW RESEARCH WRITING DESCRIPTIONS =====
  'Structured brainstorming with 6 phases for research paper development': { zh: '结构化头脑风暴，6个阶段用于研究论文开发', en: 'Structured brainstorming with 6 phases for research paper development' },
  'Identify research gaps using literature analysis and gap mapping': { zh: '使用文献分析和缺口映射识别研究空白', en: 'Identify research gaps using literature analysis and gap mapping' },
  'Frame contributions with key abstraction, headline numbers, and positioning': { zh: '用关键抽象、头条数字和定位来定位贡献', en: 'Frame contributions with key abstraction, headline numbers, and positioning' },
  'Build narrative spine connecting problem, approach, evidence, and impact': { zh: '构建连接问题、方法、证据和影响的叙事主线', en: 'Build narrative spine connecting problem, approach, evidence, and impact' },
  'Adapt paper style and structure for target venue (systems/ML/natural science)': { zh: '为目标会议（系统/机器学习/自然科学）适配论文风格和结构', en: 'Adapt paper style and structure for target venue (systems/ML/natural science)' },
  'Generate structured abstract with background, methods, results, conclusions': { zh: '生成结构化摘要，包含背景、方法、结果和结论', en: 'Generate structured abstract with background, methods, results, conclusions' },
  'Generate keywords following journal/conference requirements': { zh: '根据期刊/会议要求生成关键词', en: 'Generate keywords following journal/conference requirements' },
  'Write cover letter emphasizing novelty and fit for target journal': { zh: '撰写投稿信，强调创新性和目标期刊的契合度', en: 'Write cover letter emphasizing novelty and fit for target journal' },
  'Draft point-by-point responses with acknowledgment, explanation, and changes': { zh: '起草逐点回复，包含承认、解释和修改', en: 'Draft point-by-point responses with acknowledgment, explanation, and changes' },
  'Plan revision roadmap with prioritized actions and timeline': { zh: '规划修订路线图，包含优先行动和时间表', en: 'Plan revision roadmap with prioritized actions and timeline' },
  'Map evidence to claims for structured argumentation': { zh: '将证据映射到论点，进行结构化论证', en: 'Map evidence to claims for structured argumentation' },
  'Write structured drafts with topic sentences and coherent flow': { zh: '撰写结构化草稿，包含主题句和连贯性', en: 'Write structured drafts with topic sentences and coherent flow' },
  'Synthesize takeaways from experimental results and findings': { zh: '从实验结果和发现中综合要点', en: 'Synthesize takeaways from experimental results and findings' },
  'Audit compression quality and preserve core claims': { zh: '审核压缩质量并保留核心论点', en: 'Audit compression quality and preserve core claims' },
  'Run mechanical checks: page count, broken refs, LaTeX warnings before submission': { zh: '在投稿前运行机械检查：页数、断链、LaTeX警告', en: 'Run mechanical checks: page count, broken refs, LaTeX warnings before submission' },
  'Ensure terminology consistency and argument coherence across sections': { zh: '确保术语一致性和跨章节的论证连贯性', en: 'Ensure terminology consistency and argument coherence across sections' },
  'Check for terminology drift and inconsistencies across paper': { zh: '检查论文中的术语漂移和不一致', en: 'Check for terminology drift and inconsistencies across paper' },
  'Audit signposting: transitions, topic sentences, paragraph coherence': { zh: '审核指引：过渡、主题句、段落连贯性', en: 'Audit signposting: transitions, topic sentences, paragraph coherence' },
  'Check visual balance: figure distribution, whitespace, text density': { zh: '检查视觉平衡：图表分布、空白、文本密度', en: 'Check visual balance: figure distribution, whitespace, text density' },
  // ===== NEW AI/ML WRITING SKILLS (jam-cc/paper-review.skill) =====
  'Academic paper reviewing skill for ML/AI conferences. Produces structured reviews for NeurIPS, ICML, ICLR, CVPR, ECCV with evidence-based weaknesses and verified references.': { zh: 'ML/AI会议学术论文评审技能。为NeurIPS、ICML、ICLR、CVPR、ECCV生成结构化评审，包含基于证据的弱点分析和经核实的引用。', en: 'Academic paper reviewing skill for ML/AI conferences. Produces structured reviews for NeurIPS, ICML, ICLR, CVPR, ECCV with evidence-based weaknesses and verified references.' },
  'End-to-end pipeline for writing ML/AI research papers — from experiment design through analysis, drafting, revision, and submission. Covers NeurIPS, ICML, ICLR, ACL, AAAI.': { zh: 'ML/AI研究论文端到端写作流程——从实验设计到分析、起草、修订和投稿。覆盖NeurIPS、ICML、ICLR、ACL、AAAI。', en: 'End-to-end pipeline for writing ML/AI research papers — from experiment design through analysis, drafting, revision, and submission. Covers NeurIPS, ICML, ICLR, ACL, AAAI.' },
  'Specializes in writing compelling ML/AI paper introductions that hook reviewers and clearly establish contribution.': { zh: '专门撰写引人入胜的ML/AI论文引言，吸引审稿人并清晰确立贡献。', en: 'Specializes in writing compelling ML/AI paper introductions that hook reviewers and clearly establish contribution.' },
  'Write well-structured related work sections that position ML/AI research in context while highlighting novel contributions.': { zh: '撰写结构良好的相关工作章节，在背景下定位ML/AI研究，同时突出新贡献。', en: 'Write well-structured related work sections that position ML/AI research in context while highlighting novel contributions.' },
  'Write clear, reproducible experiments sections for ML papers with proper baselines, ablations, and statistical significance.': { zh: '撰写清晰、可复现的ML论文实验部分，包含适当的基线、消融实验和统计显著性。', en: 'Write clear, reproducible experiments sections for ML papers with proper baselines, ablations, and statistical significance.' },
  // ===== AI/ML PAPER WRITING SKILLS =====
  'aiml-paper-review': { zh: 'AI/ML会议论文评审', en: 'AI/ML Conference Paper Reviewer' },
  'ml-paper-writing-pipeline': { zh: 'ML论文写作流程', en: 'ML Paper Writing Pipeline' },
  'ml-introduction-writing': { zh: 'ML论文引言撰写', en: 'ML Paper Introduction Writer' },
  'ml-related-work': { zh: 'ML相关工作撰写', en: 'ML Related Work Writer' },
  'ml-experiments-writing': { zh: 'ML实验部分撰写', en: 'ML Experiments Section Writer' },
};

// Generate skill description with i18n support
export function generateSkillDescription(skill: SkillInfo, lang: Language): string {
  if (lang === 'zh' && skill.description_zh && /^(alterlab-|github-|skillsbot-)/.test(skill.name)) return skill.description_zh;
  // If has description, try to translate it
  if (skill.description) {
    const desc = skill.description.trim();
    // Check if we have a translation
    if (descriptionTranslations[desc]) {
      return descriptionTranslations[desc][lang];
    }
    // If description is already in target language, return it
    const isChinese = /[\u4e00-\u9fa5]/.test(desc);
    if ((lang === 'zh' && isChinese) || (lang === 'en' && !isChinese)) {
      return desc;
    }
    // Try to find a partial match
    for (const [enText, translations] of Object.entries(descriptionTranslations)) {
      if (desc.toLowerCase().includes(enText.toLowerCase())) {
        return translations[lang];
      }
    }
    if (lang === 'zh' && skill.description_zh) return skill.description_zh;
    // Return as-is for unknown descriptions
    return desc;
  }
  
  const prompt = skill.prompt || '';
  const name = skill.display_name || skill.name;
  
  // Keywords detection
  const lowerPrompt = prompt.toLowerCase();
  
  // Writing related
  if (lowerPrompt.includes('write') || lowerPrompt.includes('写作') || lowerPrompt.includes('起草') || lowerPrompt.includes('draft')) {
    return lang === 'zh' ? '辅助撰写论文内容' : 'Helps write paper content';
  }
  if (lowerPrompt.includes('abstract') || lowerPrompt.includes('摘要')) {
    return lang === 'zh' ? '生成论文摘要' : 'Generates paper abstract';
  }
  if (lowerPrompt.includes('introduction') || lowerPrompt.includes('引言') || lowerPrompt.includes('介绍')) {
    return lang === 'zh' ? '撰写引言部分' : 'Writes introduction section';
  }
  if (lowerPrompt.includes('conclusion') || lowerPrompt.includes('结论')) {
    return lang === 'zh' ? '撰写结论部分' : 'Writes conclusion section';
  }
  
  // Review related
  if (lowerPrompt.includes('review') || lowerPrompt.includes('评审') || lowerPrompt.includes('检查') || lowerPrompt.includes('审稿')) {
    return lang === 'zh' ? '评审和检查论文' : 'Reviews and checks paper';
  }
  if (lowerPrompt.includes('grammar') || lowerPrompt.includes('语法') || lowerPrompt.includes('spelling')) {
    return lang === 'zh' ? '检查语法拼写错误' : 'Checks grammar and spelling';
  }
  if (lowerPrompt.includes('plagiarism') || lowerPrompt.includes('抄袭')) {
    return lang === 'zh' ? '检测抄袭问题' : 'Detects plagiarism';
  }
  
  // Research related
  if (lowerPrompt.includes('research') || lowerPrompt.includes('调研') || lowerPrompt.includes('研究')) {
    return lang === 'zh' ? '辅助研究调研' : 'Assists with research';
  }
  if (lowerPrompt.includes('search') || lowerPrompt.includes('搜索') || lowerPrompt.includes('查找')) {
    return lang === 'zh' ? '搜索相关文献' : 'Searches related literature';
  }
  if (lowerPrompt.includes('reference') || lowerPrompt.includes('引用') || lowerPrompt.includes('文献')) {
    return lang === 'zh' ? '管理和格式化引用' : 'Manages and formats references';
  }
  
  // Draw related
  if (lowerPrompt.includes('draw') || lowerPrompt.includes('figure') || lowerPrompt.includes('图') || lowerPrompt.includes('chart') || lowerPrompt.includes('plot')) {
    return lang === 'zh' ? '生成图表和插图' : 'Generates figures and charts';
  }
  
  // Analysis related
  if (lowerPrompt.includes('analyze') || lowerPrompt.includes('分析') || lowerPrompt.includes('统计')) {
    return lang === 'zh' ? '数据分析处理' : 'Analyzes data';
  }
  if (lowerPrompt.includes('visualiz') || lowerPrompt.includes('可视化')) {
    return lang === 'zh' ? '数据可视化' : 'Data visualization';
  }
  
  // Structure
  if (lowerPrompt.includes('structure') || lowerPrompt.includes('structure') || lowerPrompt.includes('结构')) {
    return lang === 'zh' ? '优化论文结构' : 'Optimizes paper structure';
  }
  if (lowerPrompt.includes('format') || lowerPrompt.includes('format') || lowerPrompt.includes('格式')) {
    return lang === 'zh' ? '格式化论文排版' : 'Formats paper layout';
  }
  
  // Generic
  if (prompt.length > 50) {
    return lang === 'zh' ? `执行 ${name} 任务` : `Executes ${name} task`;
  }
  
  return lang === 'zh' ? '论文辅助工具' : 'Paper assistance tool';
}

// Global language state - default to English
let globalLanguage: Language = 'en';
const languageListeners: Set<(lang: Language) => void> = new Set();

export function setGlobalLanguage(lang: Language) {
  globalLanguage = lang;
  languageListeners.forEach(fn => fn(lang));
}

export function getGlobalLanguage(): Language {
  return globalLanguage;
}

export function useGlobalLanguage(): [Language, (lang: Language) => void] {
  const [lang, setLang] = useState<Language>(globalLanguage);
  
  useEffect(() => {
    languageListeners.add(setLang);
    return () => { languageListeners.delete(setLang); };
  }, []);
  
  return [lang, setGlobalLanguage];
}

// Collapsible Category Dropdown
interface CollapsibleDropdownProps {
  skills: SkillInfo[];
  selectedSkills: string[];
  onSelect: (skillName: string) => void;
  onManage?: () => void;
  position?: 'above' | 'below' | 'right';
}

export function CollapsibleDropdown({ skills, selectedSkills, onSelect, onManage, position = 'above' }: CollapsibleDropdownProps) {
  const [lang, setLang] = useGlobalLanguage();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['paper-writing']));
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties>({});

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target) && !menuRef.current?.contains(target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showDropdown) return;

    const updatePosition = () => {
      const trigger = dropdownRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 8;
      const gap = 4;
      const width = Math.min(360, Math.max(0, viewportWidth - margin * 2));
      const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
      const spaceAbove = rect.top - gap - margin;
      const spaceBelow = viewportHeight - rect.bottom - gap - margin;

      const placeAbove = () => {
        const bottom = viewportHeight - rect.top + gap;
        setMenuPosition({ left, bottom, width, maxHeight: Math.max(80, spaceAbove) });
      };
      const placeBelow = () => {
        const top = rect.bottom + gap;
        setMenuPosition({ left, top, width, maxHeight: Math.max(80, spaceBelow) });
      };

      if (position === 'below') {
        if (spaceBelow >= 160 || spaceBelow >= spaceAbove) placeBelow();
        else placeAbove();
      } else if (position === 'right') {
        const fitsRight = rect.right + gap + width <= viewportWidth - margin;
        const rightAwareLeft = fitsRight ? rect.right + gap : Math.max(margin, rect.left - width - gap);
        const top = Math.max(margin, Math.min(rect.top, viewportHeight - 160 - margin));
        setMenuPosition({ left: rightAwareLeft, top, width, maxHeight: Math.max(160, viewportHeight - top - margin) });
      } else {
        if (spaceAbove >= 160 || spaceAbove >= spaceBelow) placeAbove();
        else placeBelow();
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showDropdown, position]);

  // Group skills by category
  const skillsByCategory: Record<string, SkillInfo[]> = {};
  SKILL_CATEGORIES.forEach(cat => {
    skillsByCategory[cat.id] = skills.filter(s => {
      const categories = s.categories?.length ? s.categories : [s.type];
      return categories.includes(cat.id) && !selectedSkills.includes(s.name);
    });
  });

  const toggleCategory = (catId: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(catId)) {
      newSet.delete(catId);
    } else {
      newSet.add(catId);
    }
    setExpandedCategories(newSet);
  };

  const toggleSubcategory = (categoryId: string, subcategoryId: string) => {
    const key = `${categoryId}:${subcategoryId}`;
    setExpandedSubcategories(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger button */}
      <div 
        onClick={() => setShowDropdown(!showDropdown)}
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '4px',
          padding: '4px 10px',
          background: 'var(--bg-secondary)', 
          borderRadius: '999px', 
          cursor: 'pointer',
          fontSize: '11px',
          color: 'var(--text)',
          border: '1px solid var(--border)',
        }}
      >
        <span>🧩</span>
        <span style={{ color: 'var(--muted)' }}>{t({ zh: '选择 Skill', en: 'Select Skill' }, lang)}</span>
        <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{showDropdown ? (position === 'below' ? '▲' : '▲') : (position === 'below' ? '▼' : '▼')}</span>
      </div>

      {/* Dropdown */}
      {showDropdown && createPortal(
        <>
          {/* Full screen backdrop to block everything */}
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
              background: 'rgba(0, 0, 0, 0.3)',
            }}
            onClick={() => setShowDropdown(false)}
          />
          <div ref={menuRef} style={{
            position: 'fixed',
            ...menuPosition,
            overflow: 'auto',
            background: 'var(--paper)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
            zIndex: 1001,
          }}>
            {/* Language toggle at top */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '8px 12px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setLang('en')}
                  style={{
                    padding: '3px 8px',
                    fontSize: '10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: lang === 'en' ? 'var(--accent)' : 'transparent',
                    color: lang === 'en' ? '#fff' : 'var(--text)',
                    border: '1px solid ' + (lang === 'en' ? 'var(--accent)' : 'var(--border)'),
                  }}
                >
                  EN
                </button>
                <button
                  onClick={() => setLang('zh')}
                  style={{
                    padding: '3px 8px',
                    fontSize: '10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: lang === 'zh' ? 'var(--accent)' : 'transparent',
                    color: lang === 'zh' ? '#fff' : 'var(--text)',
                    border: '1px solid ' + (lang === 'zh' ? 'var(--accent)' : 'var(--border)'),
                  }}
                >
                  中文
                </button>
              </div>
            </div>

            {/* Categories with collapsible sections */}
            {SKILL_CATEGORIES.map(cat => {
            const catSkills = [...(skillsByCategory[cat.id] || [])].sort((a, b) =>
              String(a.subcategory_zh || '').localeCompare(String(b.subcategory_zh || ''), 'zh-Hans-CN') ||
              getLocalizedDisplayName(a, lang).localeCompare(getLocalizedDisplayName(b, lang), lang === 'zh' ? 'zh-Hans-CN' : 'en')
            );
            const subcategoryGroups = Array.from(catSkills.reduce((groups, skill) => {
              const id = skill.subcategory || 'other';
              const current = groups.get(id) || {
                id,
                labelZh: skill.subcategory_zh || '其他',
                labelEn: id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
                skills: [] as SkillInfo[],
              };
              current.skills.push(skill);
              groups.set(id, current);
              return groups;
            }, new Map<string, { id: string; labelZh: string; labelEn: string; skills: SkillInfo[] }>()).values());
            const isExpanded = expandedCategories.has(cat.id);
            
            return (
              <div key={cat.id}>
                {/* Category header - clickable to expand/collapse */}
                <div 
                  onClick={() => toggleCategory(cat.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '11px',
                    fontWeight: 600,
                    position: 'sticky',
                    top: 0,
                  }}
                >
                  <span>{cat.icon} {t(cat.name, lang)} ({catSkills.length})</span>
                  <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{isExpanded ? '▼' : '▶'}</span>
                </div>
                
                {/* Subcategories first; skills are shown only after opening a subcategory. */}
                {isExpanded && (
                  <div style={{ padding: '4px 0' }}>
                    {catSkills.length === 0 ? (
                      <div style={{ padding: '8px 16px', fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic' }}>
                        {t({ zh: '无', en: 'None' }, lang)}
                      </div>
                    ) : subcategoryGroups.map(group => {
                      const groupKey = `${cat.id}:${group.id}`;
                      const isSubcategoryExpanded = expandedSubcategories.has(groupKey);
                      return (
                        <div key={groupKey}>
                          <div
                            onClick={() => toggleSubcategory(cat.id, group.id)}
                            style={{
                              padding: '7px 16px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontWeight: 600,
                              background: 'color-mix(in srgb, var(--bg-secondary) 65%, transparent)',
                              borderBottom: '1px solid var(--border)',
                            }}
                          >
                            <span>{lang === 'zh' ? group.labelZh : group.labelEn} ({group.skills.length})</span>
                            <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{isSubcategoryExpanded ? '▼' : '▶'}</span>
                          </div>
                          {isSubcategoryExpanded && group.skills.map(skill => {
                            const localizedName = getLocalizedDisplayName(skill, lang);
                            return (
                              <div
                                key={skill.name}
                                onClick={() => { onSelect(skill.name); setShowDropdown(false); }}
                                style={{
                                  padding: '8px 16px 8px 28px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '3px',
                                  borderBottom: '1px solid var(--border)',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <span style={{ fontWeight: 500 }}>{localizedName}</span>
                                <span style={{ fontSize: '10px', color: 'var(--accent)' }}>
                                  {generateSkillDescription(skill, lang)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Manage button */}
          <div 
            onClick={() => { onManage?.(); setShowDropdown(false); }}
            style={{
              padding: '10px 12px',
              cursor: 'pointer',
              fontSize: '11px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              position: 'sticky',
              bottom: 0,
            }}
          >
            <span>⚙️</span>
            <span>{t({ zh: '管理 Skills...', en: 'Manage Skills...' }, lang)}</span>
          </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// Simple inline skills selector
interface InlineSkillsSelectorProps {
  skills: SkillInfo[];
  selectedSkills: string[];
  onChange: (skills: string[]) => void;
  onOpenManagement?: () => void;
  compact?: boolean;
  position?: 'above' | 'below' | 'right';
}

export function InlineSkillsSelector({ skills, selectedSkills, onChange, onOpenManagement, compact = true, position = 'above' }: InlineSkillsSelectorProps) {
  const [lang] = useGlobalLanguage();
  const [allSkills, setAllSkills] = useState<SkillInfo[]>([]);

  useEffect(() => {
    listSkills().then(setAllSkills).catch(console.error);
  }, []);

  const getSkillInfo = (name: string) => allSkills.find(s => s.name === name);

  // Get localized skill name
  const getLocalizedName = (skill: SkillInfo) => {
    return getLocalizedDisplayName(skill, lang);
  };

  const handleSelect = (skillName: string) => {
    onChange([...selectedSkills, skillName]);
  };

  const handleDeselect = (skillName: string) => {
    onChange(selectedSkills.filter(s => s !== skillName));
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
      <CollapsibleDropdown
        skills={allSkills}
        selectedSkills={selectedSkills}
        onSelect={handleSelect}
        onManage={onOpenManagement}
        position={position}
      />

      {/* Selected skill tags */}
      {selectedSkills.map(skillName => {
        const skill = getSkillInfo(skillName);
        return (
          <span 
            key={skillName}
            style={{ 
              padding: compact ? '2px 8px' : '4px 10px', 
              borderRadius: '999px', 
              background: 'var(--accent)', 
              color: '#fff', 
              fontSize: compact ? '10px' : '11px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
            onClick={() => handleDeselect(skillName)}
            title={skill ? generateSkillDescription(skill, lang) : skillName}
          >
            {skill ? getLocalizedDisplayName(skill, lang) : skillName} ×
          </span>
        );
      })}
    </div>
  );
}

// Legacy export for compatibility
export { InlineSkillsSelector as SkillsSelector };
