import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSkillNavigator, buildTaskIntentGuide, listSkillCategories, listSkills, loadSkills, recommendSkills } from '../skillEngine.js';

test('listSkills exposes Chinese UI metadata for built-in skills', async () => {
  await loadSkills(null);
  const skills = listSkills();
  const literature = skills.find(skill => skill.name === 'literature-review');
  assert.ok(literature);
  assert.equal(literature.display_name_zh, '文献综述');
  assert.equal(literature.subtitle_en, 'Literature Review');
  assert.equal(literature.category_zh, '文献检索');
  assert.ok(literature.tags.includes('相关工作'));
  assert.ok(literature.inputs.includes('研究主题'));
  assert.ok(literature.outputs.includes('related work 草稿'));
  assert.ok(literature.task_templates.some(template => template.includes('related work')));
  assert.ok(literature.hoverGuide.summary_zh.includes('主题分类'));
  assert.ok(literature.hoverGuide.before_start_zh.some(item => item.includes('文献证据')));
  assert.ok(literature.hoverGuide.risk_boundary_zh.includes('中风险'));

  const polish = skills.find(skill => skill.name === 'writing-polish');
  assert.ok(polish);
  assert.equal(polish.display_name_zh, '论文润色');
  assert.equal(polish.subtitle_en, 'Academic Polishing');
  assert.equal(polish.category_zh, '论文写作');
  assert.ok(polish.tags.includes('翻译'));
  assert.ok(polish.tags.includes('AI 痕迹'));
  assert.ok(polish.task_templates.some(template => template.includes('不要新增事实')));

  const latexDebugging = skills.find(skill => skill.name === 'latex-debugging');
  assert.ok(latexDebugging);
  assert.equal(latexDebugging.display_name_zh, 'LaTeX 编译修复');
  assert.equal(latexDebugging.subtitle_en, 'LaTeX Debugging');
  assert.equal(latexDebugging.category_zh, '论文写作');
  assert.ok(latexDebugging.requires_context.includes('latex_error_log'));

  const evidenceReview = skills.find(skill => skill.name === 'evidence-review');
  assert.ok(evidenceReview);
  assert.equal(evidenceReview.display_name_zh, '输出审查');
  assert.equal(evidenceReview.subtitle_en, 'Evidence Review');
  assert.equal(evidenceReview.category_zh, '同行评审');
  assert.ok(evidenceReview.tags.includes('证据核对'));
  assert.ok(evidenceReview.task_templates.some(template => template.includes('安全采纳包')));

  const rebuttal = skills.find(skill => skill.name === 'reviewer-response');
  assert.ok(rebuttal);
  assert.equal(rebuttal.display_name_zh, '审稿回复');
  assert.equal(rebuttal.subtitle_en, 'Reviewer Response');
  assert.ok(rebuttal.task_templates.some(template => template.includes('reviewer comments')));

  const planning = skills.find(skill => skill.name === 'paper-planning');
  assert.ok(planning);
  assert.equal(planning.display_name_zh, '论文规划');
  assert.equal(planning.subtitle_en, 'Paper Planning');
  assert.equal(planning.category_zh, '论文写作');
  assert.ok(planning.tags.includes('故事线'));
  assert.ok(planning.task_templates.some(template => template.includes('paper outline')));

  const grant = skills.find(skill => skill.name === 'grant-proposal');
  assert.ok(grant);
  assert.equal(grant.display_name_zh, '基金申请');
  assert.equal(grant.subtitle_en, 'Grant Proposal Writing');
  assert.equal(grant.category_zh, '基金申请');

  const paper2ppt = skills.find(skill => skill.name === 'nature-paper2ppt');
  assert.ok(paper2ppt);
  assert.equal(paper2ppt.display_name_zh, '论文转演示');
  assert.equal(paper2ppt.subtitle_en, 'Paper to Presentation');
  assert.equal(paper2ppt.category_zh, '学术会议');

  const poster = skills.find(skill => skill.name === 'poster-design');
  assert.ok(poster);
  assert.equal(poster.display_name_zh, '学术海报');
  assert.equal(poster.subtitle_en, 'Academic Poster Design');
  assert.equal(poster.category_zh, '学术会议');
});

test('listSkillCategories groups skills for category chips', async () => {
  await loadSkills(null);
  const categories = listSkillCategories();
  const writing = categories.find(category => category.name === '论文写作');
  const literature = categories.find(category => category.name === '文献检索');
  const project = categories.find(category => category.name === '基金申请');
  assert.ok(writing);
  assert.ok(literature);
  assert.ok(project);
  assert.ok(writing.count > 0);
  assert.ok(literature.skills.some(skill => skill.name === 'literature-review'));
  assert.ok(literature.skills.find(skill => skill.name === 'literature-review').tags.includes('相关工作'));
  assert.ok(project.skills.some(skill => skill.name === 'grant-proposal' && skill.display_name_zh === '基金申请'));
});

test('recommendSkills ranks task-relevant skills with reasons and missing context', async () => {
  await loadSkills(null);
  const recommendations = recommendSkills('帮我根据这些 PDF 写 related work 和研究 gap', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.ok(recommendations.length > 0);
  assert.equal(recommendations[0].skill.name, 'literature-review');
  assert.ok(recommendations[0].reasons.length > 0);
  assert.ok(recommendations[0].missingContext.includes('rag_documents_or_references'));
  assert.ok(recommendations[0].suggestedTask.includes('我的任务是'));
  assert.ok(recommendations[0].suggestedTask.includes('related work'));

  const citationRecommendations = recommendSkills('帮我整理 references.bib 并补 DOI');
  assert.equal(citationRecommendations[0].skill.name, 'reference-management');
  assert.ok(citationRecommendations[0].skill.task_templates.some(template => template.includes('references.bib')));

  const genericEdit = recommendSkills('帮我改论文', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(genericEdit[0].skill.name, 'writing-polish');
  assert.ok(!genericEdit.some(item => item.skill.name === 'literature-review'));

  const polishRecommendations = recommendSkills('帮我润色这段论文，让表达更学术', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(polishRecommendations[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我把这段中文翻译成英文论文表达')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我把英文论文段落翻译成中文解释')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我检查语法和时态')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我把段落改短一点')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我降低 AI 痕迹')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我检查这段是不是太像 AI 写的')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我改成 Nature 风格英文')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我把论文改成 ACL 风格')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我把论文改成 NeurIPS 风格')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我检查 LaTeX 编译错误')[0].skill.name, 'latex-debugging');
  assert.equal(recommendSkills('帮我检查 Overleaf 报错')[0].skill.name, 'latex-debugging');
  assert.notEqual(recommendSkills('帮我把实验表格改成 LaTeX table')[0].skill.name, 'latex-debugging');
  assert.equal(recommendSkills('帮我修复公式符号不一致')[0].skill.name, 'writing-methodology');
  assert.equal(recommendSkills('帮我写 dataset 描述')[0].skill.name, 'writing-results');
  assert.equal(recommendSkills('帮我检查实验设置是否清楚')[0].skill.name, 'writing-results');
  assert.equal(recommendSkills('帮我写 algorithm 伪代码')[0].skill.name, 'writing-methodology');
  assert.equal(recommendSkills('帮我检查 theorem proof 是否严谨')[0].skill.name, 'writing-methodology');
  assert.equal(recommendSkills('帮我写 appendix')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('帮我整理 supplementary appendix')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('帮我生成关键词 keyword list')[0].skill.name, 'writing-abstract');
  assert.equal(recommendSkills('帮我写 title')[0].skill.name, 'writing-abstract');
  assert.ok(!recommendSkills('帮我生成关键词 keyword list')[0].missingContext.includes('target_section_or_file'));
  assert.ok(!recommendSkills('帮我写 title')[0].missingContext.includes('target_section_or_file'));
  assert.equal(recommendSkills('帮我把中文 bullet points 改成论文段落')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我检查有没有幻觉引用')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我把这一句话和 RAG 证据核对一下')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我审查 AI 写的这段能不能采纳')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我生成安全采纳包')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我检查这个 paragraph 能不能直接放进论文')[0].skill.name, 'evidence-review');
  assert.notEqual(recommendSkills('帮我检查这个 paragraph 能不能直接放进论文')[0].skill.name, 'literature-review');
  assert.equal(recommendSkills('帮我制定论文写作计划')[0].skill.name, 'paper-planning');
  assert.equal(recommendSkills('帮我生成论文 outline')[0].skill.name, 'paper-planning');
  assert.equal(recommendSkills('帮我规划接下来两周的写作任务')[0].skill.name, 'paper-planning');
  assert.equal(recommendSkills('帮我把 idea 变成 paper structure')[0].skill.name, 'paper-planning');
  assert.equal(recommendSkills('帮我检查论文故事线是否清楚')[0].skill.name, 'paper-planning');
  assert.equal(recommendSkills('帮我列出审稿人可能会问的问题')[0].skill.name, 'paper-planning');

  const rebuttalRecommendations = recommendSkills('帮我写 rebuttal 回复审稿意见', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(rebuttalRecommendations[0].skill.name, 'reviewer-response');
  assert.ok(rebuttalRecommendations[0].missingContext.includes('reviewer_comments'));
  assert.equal(recommendSkills('帮我根据 reviewer comments 制定 revision plan')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我把 reviewer comments 对应到论文正文修改位置')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我整理 major concerns 和 minor concerns')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我写 revision checklist')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我写 rebuttal cover letter')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我根据审稿意见修改 introduction')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我总结 reviewers 的 common concerns')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我检查是否需要补实验')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我生成 rebuttal 前的风险清单')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('reviewer 说 novelty weak，我该补什么')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我生成 response table')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('把 rebuttal 里的承诺转成正文修改 checklist')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我检查 rebuttal 里有没有过度承诺')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我写 revision summary 给 editor')[0].skill.name, 'reviewer-response');
  assert.ok(!recommendSkills('帮我生成 response table')[0].missingContext.includes('target_section_or_file'));
  assert.ok(!recommendSkills('reviewer 说 novelty weak，我该补什么')[0].missingContext.includes('target_section_or_file'));
  assert.ok(recommendSkills('帮我把 rebuttal 承诺对应到 main.tex 的修改位置')[0].missingContext.includes('reviewer_comments'));

  assert.equal(recommendSkills('帮我写基金申请书 research plan')[0].skill.name, 'grant-proposal');
  assert.equal(recommendSkills('帮我检查 proposal 的创新性和可行性')[0].skill.name, 'grant-proposal');
  assert.equal(recommendSkills('帮我把论文转成 PPT 做 conference talk')[0].skill.name, 'nature-paper2ppt');
  assert.equal(recommendSkills('帮我生成 Beamer 大纲')[0].skill.name, 'nature-paper2ppt');
  assert.equal(recommendSkills('帮我设计学术海报 poster layout')[0].skill.name, 'poster-design');
  assert.equal(recommendSkills('帮我检查 poster 信息是不是太密')[0].skill.name, 'poster-design');
  assert.equal(recommendSkills('帮我找最新相关工作')[0].skill.name, 'nature-academic-search');
  assert.equal(recommendSkills('帮我找最新 benchmark paper 并加入证据库')[0].skill.name, 'nature-academic-search');
  assert.equal(recommendSkills('帮我写 conclusion')[0].skill.name, 'writing-conclusion');
  assert.equal(recommendSkills('帮我做统计显著性检验')[0].skill.name, 'statistical-analysis');
  assert.equal(recommendSkills('帮我检查 ethical statement 和 data availability')[0].skill.name, 'conference-submission');
  assert.ok(!recommendSkills('帮我写 data availability statement')[0].missingContext.includes('target_section_or_file'));
  assert.notEqual(recommendSkills('帮我写 cover letter')[0].skill.name, 'reviewer-response');
  assert.ok(!recommendSkills('帮我写 cover letter')[0].missingContext.includes('target_section_or_file'));
  assert.equal(recommendSkills('帮我写 limitations')[0].skill.name, 'writing-discussion');
  assert.equal(recommendSkills('帮我检查 limitation section')[0].skill.name, 'writing-discussion');
  assert.equal(recommendSkills('帮我写 highlights')[0].skill.name, 'writing-abstract');
  assert.equal(recommendSkills('帮我写 graphical abstract')[0].skill.name, 'nature-figure');
  assert.equal(recommendSkills('帮我写 acknowledgements')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('帮我写 author contributions')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('帮我整理 supplementary material')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('帮我检查 PDF metadata 是否匿名')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('PDF 已上传但是只有 metadata 怎么办')[0].skill.name, 'literature-review');
  assert.equal(recommendSkills('帮我检查 double blind 匿名风险')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('帮我检查 camera-ready checklist')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('NeurIPS checklist 怎么填')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('帮我检查匿名版 appendix')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('camera-ready 与 anonymous 规则冲突怎么办')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('帮我写 artifact appendix 和 reproducibility checklist')[0].skill.name, 'conference-submission');
  assert.ok(!recommendSkills('NeurIPS checklist 怎么填')[0].missingContext.includes('compiled_pdf'));
  assert.ok(!recommendSkills('NeurIPS checklist 怎么填')[0].missingContext.includes('target_section_or_file'));
  assert.ok(!recommendSkills('帮我检查匿名版 appendix')[0].missingContext.includes('compiled_pdf'));
  assert.ok(recommendSkills('帮我检查 PDF metadata 是否匿名')[0].missingContext.includes('compiled_pdf'));
  assert.ok(!recommendSkills('帮我给 AAAI 投稿前检查匿名风险和 page limit')[0].missingContext.includes('target_section_or_file'));
  assert.equal(recommendSkills('帮我把 arXiv 版本转成 anonymous version')[0].skill.name, 'conference-submission');
  assert.ok(!recommendSkills('帮我把 arXiv 版本转成 anonymous version')[0].missingContext.includes('target_section_or_file'));
  assert.equal(recommendSkills('帮我解释这篇论文的方法')[0].skill.name, 'writing-methodology');
  assert.equal(recommendSkills('帮我检查 contribution 是否足够强')[0].skill.name, 'writing-introduction');
  assert.equal(recommendSkills('帮我比较我们的贡献和 baseline 的区别')[0].skill.name, 'writing-introduction');
  assert.equal(recommendSkills('帮我检查实验是否足够支撑 claim')[0].skill.name, 'writing-results');
  assert.equal(recommendSkills('帮我写 limitations and future work')[0].skill.name, 'writing-discussion');
  assert.equal(recommendSkills('帮我给 method 起一个小节标题')[0].skill.name, 'writing-methodology');
  assert.equal(recommendSkills('帮我把 table 结果讲成一段论文文字')[0].skill.name, 'writing-results');
  assert.equal(recommendSkills('帮我根据 review 补实验计划')[0].skill.name, 'reviewer-response');
  assert.equal(recommendSkills('帮我根据 CSV 生成 Figure 3 的柱状图')[0].skill.name, 'nature-figure');
  assert.equal(recommendSkills('帮我画 ROC curve 并导出 PDF')[0].skill.name, 'nature-figure');
  assert.equal(recommendSkills('帮我把 ablation results 画成折线图')[0].skill.name, 'nature-figure');
  assert.equal(recommendSkills('帮我设计 Figure 1 的方法流程图')[0].skill.name, 'nature-figure');
  assert.equal(recommendSkills('帮我检查 LaTeX table 排版太宽')[0].skill.name, 'nature-figure');
  assert.equal(recommendSkills('帮我把 Figure 3 的颜色改成 Nature 风格')[0].skill.name, 'nature-figure');
  assert.equal(recommendSkills('帮我给所有 figure 编号和引用做一致性检查')[0].skill.name, 'nature-figure');
  assert.equal(recommendSkills('帮我把 related work 的过渡句写自然一点')[0].skill.name, 'writing-polish');
  assert.equal(recommendSkills('帮我把 Zotero 导出的 bib 清理一下')[0].skill.name, 'reference-management');
  assert.equal(recommendSkills('帮我检查 main.tex 里面有没有未定义引用')[0].skill.name, 'reference-management');
  assert.equal(recommendSkills('帮我把实验数据跑 t-test 并写显著性结果')[0].skill.name, 'statistical-analysis');
  assert.equal(recommendSkills('帮我检查 Table 1 的 p-value 是否写对')[0].skill.name, 'statistical-analysis');
  assert.equal(recommendSkills('帮我检查实验数据有没有异常值')[0].skill.name, 'statistical-analysis');
  assert.equal(recommendSkills('帮我根据 results.csv 计算 mean±std')[0].skill.name, 'statistical-analysis');
  assert.ok(!recommendSkills('帮我画 ROC curve 并导出 PDF')[0].missingContext.includes('figure_goal'));
  assert.ok(!recommendSkills('帮我根据 results.csv 计算 mean±std')[0].missingContext.includes('data_or_results'));
  assert.equal(recommendSkills('帮我检查 references 有没有 fake citation')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('这句话需要引用哪几篇论文')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我找支持这个 claim 的论文')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我找反例或者 negative evidence')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('把 related work 每句话对应证据编号')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我检查 related work 里面哪些句子没有引用')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我给 introduction 每个 claim 配 citation')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我检查 Table 2 的结论有没有证据支撑')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我找和我们方法相反的观点')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我把 AI 写的 related work 合并进 related_work.tex')[0].skill.name, 'evidence-review');
  assert.equal(recommendSkills('帮我总结这些 PDF 里面支持 novelty 的证据')[0].skill.name, 'evidence-review');
  assert.notEqual(recommendSkills('帮我总结这些 PDF 里面支持 novelty 的证据')[0].skill.name, 'latex-debugging');
  assert.equal(recommendSkills('帮我写 appendix proof sketch')[0].skill.name, 'writing-methodology');
  assert.equal(recommendSkills('帮我写 cover-letter.md')[0].skill.name, 'conference-submission');
  assert.equal(recommendSkills('运行 latexmk 编译 main.tex 看看错误')[0].skill.name, 'latex-debugging');
  assert.ok(!recommendSkills('帮我检查 Figure 2 caption 是否清楚')[0].missingContext.includes('target_section_or_file'));
  assert.ok(!recommendSkills('帮我把 Table 4 结果写成一段论文文字')[0].missingContext.includes('target_section_or_file'));
  assert.ok(!recommendSkills('帮我回复 Reviewer 2 Comment 1')[0].missingContext.includes('target_section_or_file'));
  assert.ok(!recommendSkills('帮我检查 Appendix A proof sketch 是否严谨')[0].missingContext.includes('target_section_or_file'));
});

test('recommendSkills keeps RAG/PDF diagnostics out of statistical-analysis', async () => {
  await loadSkills(null);
  const pdfDiagnostic = recommendSkills('RAG 不好用，PDF 读不出来', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(pdfDiagnostic[0].skill.name, 'literature-review');
  assert.ok(pdfDiagnostic[0].reasons.some(reason => reason.includes('PDF/RAG')));
  assert.notEqual(pdfDiagnostic[0].skill.name, 'statistical-analysis');

  const guide = buildTaskIntentGuide('帮我看看 PDF 读进来了吗', {
    recommendations: pdfDiagnostic,
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(guide.intent_zh, '检查 / 修复 RAG 证据库');
  assert.equal(guide.nextAction.type, 'review-rag-status');
  assert.ok(guide.copyText.includes('RAG/PDF'));

  const experimentWriting = recommendSkills('帮我写实验部分', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(experimentWriting[0].skill.name, 'writing-results');
});

test('buildTaskIntentGuide explains user-facing paper task intent', async () => {
  await loadSkills(null);
  const recommendations = recommendSkills('我想写 related work 和 research gap', {
    projectState: { hasRagDocuments: true, hasReferences: true },
  });
  const guide = buildTaskIntentGuide('我想写 related work 和 research gap', {
    recommendations,
    projectState: { hasRagDocuments: true, hasReferences: true },
  });

  assert.equal(guide.status, 'ready');
  assert.equal(guide.intent_zh, '写 Related Work / Research Gap');
  assert.equal(guide.recommendedSkill.name, 'literature-review');
  assert.equal(guide.recommendedStarterId, 'literature-review-gap');
  assert.ok(guide.nextAction.starterId === 'literature-review-gap');
  assert.ok(guide.boundaries_zh.some(item => item.includes('RAG')));
  assert.ok(guide.copyText.includes('# 任务意图诊断'));

  const missingGuide = buildTaskIntentGuide('帮我根据 PDF 写 related work', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(missingGuide.status, 'needs-context');
  assert.ok(missingGuide.missingContext.some(item => item.key === 'rag_documents_or_references'));
  assert.equal(missingGuide.nextAction.type, 'provide-context');

  const polishGuide = buildTaskIntentGuide('帮我润色这段论文', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(polishGuide.status, 'ready');
  assert.equal(polishGuide.intent_zh, '论文润色 / 语言编辑');
  assert.equal(polishGuide.recommendedSkill.name, 'writing-polish');
  assert.equal(polishGuide.recommendedStarterId, 'paper-polish');
  assert.equal(polishGuide.nextAction.type, 'use-task-starter');
  assert.ok(!polishGuide.nextAction.label_zh.includes('target_section_or_file'));

  const genericPolishGuide = buildTaskIntentGuide('帮我改论文', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(genericPolishGuide.status, 'needs-context');
  assert.equal(genericPolishGuide.nextAction.type, 'provide-context');
  assert.ok(genericPolishGuide.nextAction.label_zh.includes('目标章节或段落'));

  const rebuttalGuide = buildTaskIntentGuide('帮我回复 reviewer comments', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(rebuttalGuide.status, 'needs-context');
  assert.equal(rebuttalGuide.intent_zh, '审稿回复 / Rebuttal');
  assert.equal(rebuttalGuide.recommendedSkill.name, 'reviewer-response');
  assert.equal(rebuttalGuide.recommendedStarterId, 'reviewer-response');
  assert.ok(rebuttalGuide.missingContext.some(item => item.key === 'reviewer_comments'));

  const revisionPlanGuide = buildTaskIntentGuide('帮我根据 reviewer comments 制定 revision plan', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(revisionPlanGuide.intent_zh, '审稿回复 / Rebuttal');
  assert.equal(revisionPlanGuide.recommendedSkill.name, 'reviewer-response');
  assert.equal(revisionPlanGuide.recommendedStarterId, 'reviewer-response');

  const revisionSummaryGuide = buildTaskIntentGuide('帮我生成 response letter revision summary', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(revisionSummaryGuide.intent_zh, '审稿回复 / Rebuttal');
  assert.equal(revisionSummaryGuide.recommendedSkill.name, 'reviewer-response');
  assert.equal(revisionSummaryGuide.recommendedStarterId, 'reviewer-response');

  const grantGuide = buildTaskIntentGuide('帮我写基金申请书 research plan', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(grantGuide.intent_zh, '基金申请 / Research Proposal');
  assert.equal(grantGuide.recommendedSkill.name, 'grant-proposal');
  assert.equal(grantGuide.recommendedStarterId, 'grant-proposal');

  const slidesGuide = buildTaskIntentGuide('帮我把论文转成 PPT 做 conference talk', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(slidesGuide.intent_zh, '论文转演示 / Slides');
  assert.equal(slidesGuide.recommendedSkill.name, 'nature-paper2ppt');
  assert.equal(slidesGuide.recommendedStarterId, 'paper2ppt');

  const posterGuide = buildTaskIntentGuide('帮我设计学术海报 poster layout', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(posterGuide.intent_zh, '学术海报 / Poster');
  assert.equal(posterGuide.recommendedSkill.name, 'poster-design');
  assert.equal(posterGuide.recommendedStarterId, 'poster-design');

  const searchGuide = buildTaskIntentGuide('帮我找最新相关工作', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(searchGuide.intent_zh, '检索最新相关工作');
  assert.equal(searchGuide.recommendedSkill.name, 'nature-academic-search');
  assert.equal(searchGuide.recommendedStarterId, 'academic-search');
  assert.ok(searchGuide.missingContext.some(item => item.key === 'search_query'));

  const latexGuide = buildTaskIntentGuide('帮我检查 LaTeX 编译错误', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(latexGuide.intent_zh, 'LaTeX 编译修复');
  assert.equal(latexGuide.recommendedSkill.name, 'latex-debugging');
  assert.equal(latexGuide.recommendedStarterId, 'latex-debug');
  assert.ok(latexGuide.missingContext.some(item => item.key === 'latex_error_log'));
  assert.ok(latexGuide.nextAction.label_zh.includes('LaTeX 报错日志'));

  const natureStyleGuide = buildTaskIntentGuide('帮我改成 Nature 风格英文', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(natureStyleGuide.intent_zh, '论文润色 / 语言编辑');
  assert.equal(natureStyleGuide.recommendedSkill.name, 'writing-polish');
  assert.equal(natureStyleGuide.recommendedStarterId, 'paper-polish');

  const aclStyleGuide = buildTaskIntentGuide('帮我把论文改成 ACL 风格', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(aclStyleGuide.intent_zh, '论文润色 / 语言编辑');
  assert.equal(aclStyleGuide.recommendedSkill.name, 'writing-polish');
  assert.equal(aclStyleGuide.recommendedStarterId, 'paper-polish');

  const planningGuide = buildTaskIntentGuide('帮我制定论文写作计划', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(planningGuide.intent_zh, '论文规划 / Outline');
  assert.equal(planningGuide.recommendedSkill.name, 'paper-planning');
  assert.equal(planningGuide.recommendedStarterId, 'paper-planning');

  const evidenceReviewGuide = buildTaskIntentGuide('帮我生成安全采纳包', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(evidenceReviewGuide.intent_zh, '输出审查 / 证据核对');
  assert.equal(evidenceReviewGuide.recommendedSkill.name, 'evidence-review');
  assert.equal(evidenceReviewGuide.recommendedStarterId, 'evidence-review');
  assert.ok(evidenceReviewGuide.boundaries_zh.some(item => item.includes('不得自动写入正文')));

  const notationGuide = buildTaskIntentGuide('帮我修复公式符号不一致', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(notationGuide.intent_zh, '解释 Method / Algorithm');
  assert.equal(notationGuide.recommendedSkill.name, 'writing-methodology');
  assert.equal(notationGuide.recommendedStarterId, 'method-clarity');

  const titleGuide = buildTaskIntentGuide('帮我写 title', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(titleGuide.intent_zh, '压缩 Abstract');
  assert.equal(titleGuide.recommendedSkill.name, 'writing-abstract');
  assert.equal(titleGuide.recommendedStarterId, 'abstract-tighten');

  const abstractContributionGuide = buildTaskIntentGuide('帮我检查 abstract 是否缺贡献', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(abstractContributionGuide.intent_zh, '压缩 Abstract');
  assert.equal(abstractContributionGuide.recommendedSkill.name, 'writing-abstract');
  assert.equal(abstractContributionGuide.recommendedStarterId, 'abstract-tighten');

  const appendixGuide = buildTaskIntentGuide('帮我整理 supplementary appendix', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(appendixGuide.intent_zh, '投稿材料 / 声明检查');
  assert.equal(appendixGuide.recommendedSkill.name, 'conference-submission');
  assert.equal(appendixGuide.recommendedStarterId, 'submission-materials');

  const metadataGuide = buildTaskIntentGuide('帮我检查 PDF metadata 是否匿名', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(metadataGuide.intent_zh, '投稿前检查');
  assert.equal(metadataGuide.recommendedSkill.name, 'conference-submission');
  assert.equal(metadataGuide.recommendedStarterId, 'submission-check');

  const concernsGuide = buildTaskIntentGuide('帮我总结 reviewers 的 common concerns', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(concernsGuide.intent_zh, '审稿回复 / Rebuttal');
  assert.equal(concernsGuide.recommendedSkill.name, 'reviewer-response');
  assert.equal(concernsGuide.recommendedStarterId, 'reviewer-response');

  const conclusionGuide = buildTaskIntentGuide('帮我写 conclusion', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(conclusionGuide.intent_zh, '写 Conclusion / Future Work');
  assert.equal(conclusionGuide.recommendedSkill.name, 'writing-conclusion');
  assert.equal(conclusionGuide.recommendedStarterId, 'conclusion-close');

  const statsGuide = buildTaskIntentGuide('帮我做统计显著性检验', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(statsGuide.intent_zh, '统计分析 / 显著性检验');
  assert.equal(statsGuide.recommendedSkill.name, 'statistical-analysis');
  assert.equal(statsGuide.recommendedStarterId, 'statistical-analysis');

  const submissionMaterialsGuide = buildTaskIntentGuide('帮我检查 ethical statement 和 data availability', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(submissionMaterialsGuide.intent_zh, '投稿材料 / 声明检查');
  assert.equal(submissionMaterialsGuide.recommendedSkill.name, 'conference-submission');
  assert.equal(submissionMaterialsGuide.recommendedStarterId, 'submission-materials');

  const limitationsGuide = buildTaskIntentGuide('帮我写 limitations', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(limitationsGuide.intent_zh, '分析 Results / Discussion');
  assert.equal(limitationsGuide.recommendedSkill.name, 'writing-discussion');
  assert.equal(limitationsGuide.recommendedStarterId, 'results-discussion');

  const highlightsGuide = buildTaskIntentGuide('帮我写 highlights', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(highlightsGuide.intent_zh, '压缩 Abstract');
  assert.equal(highlightsGuide.recommendedSkill.name, 'writing-abstract');
  assert.equal(highlightsGuide.recommendedStarterId, 'abstract-tighten');

  const graphicalGuide = buildTaskIntentGuide('帮我写 graphical abstract', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(graphicalGuide.intent_zh, '图文摘要 / Graphical Abstract');
  assert.equal(graphicalGuide.recommendedSkill.name, 'nature-figure');
  assert.equal(graphicalGuide.recommendedStarterId, 'figure-plan');

  const authorContributionGuide = buildTaskIntentGuide('帮我写 author contributions', {
    projectState: { hasRagDocuments: false, hasReferences: false },
  });
  assert.equal(authorContributionGuide.intent_zh, '投稿材料 / 声明检查');
  assert.equal(authorContributionGuide.recommendedSkill.name, 'conference-submission');
  assert.equal(authorContributionGuide.recommendedStarterId, 'submission-materials');
});

test('buildSkillNavigator exposes category, tag, risk, and context filters', async () => {
  await loadSkills(null);
  const recommendations = recommendSkills('帮我写 related work', {
    projectState: { hasRagDocuments: true, hasReferences: true },
  });
  const navigator = buildSkillNavigator({
    recommendations,
    selectedSkill: recommendations[0].skill.name,
  });

  assert.equal(navigator.title_zh, 'Skill 导航');
  assert.equal(navigator.display.showChineseTitleFirst, true);
  assert.ok(navigator.categories.some(category => category.name === '文献检索' && category.recommendedCount > 0));
  assert.ok(navigator.tagChips.some(tag => tag.name === '相关工作'));
  assert.ok(navigator.contextFilters.some(item => item.key === 'rag_documents_or_references' && item.label_zh.includes('文献')));
  assert.ok(navigator.riskFilters.some(item => item.level === 'medium'));
  assert.equal(navigator.cards[0].recommended, true);
  assert.equal(navigator.cards[0].title_zh, '文献综述');
  assert.ok(navigator.cards[0].not_for.length > 0);
  assert.ok(navigator.cards[0].requires_context.some(item => item.key === 'rag_documents_or_references'));
  assert.ok(navigator.cards[0].hoverGuide.title_zh.includes('文献综述'));
  assert.ok(navigator.cards[0].hoverGuide.first_prompt_zh.includes('related work'));
});
