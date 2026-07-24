# 前端响应式与加载边界

日期：2026-07-22

## 移动工作区

800 px 及以下使用移动信息架构，而不是继续缩窄桌面三栏：

1. Files：浏览和选择项目文件；
2. Editor：编辑与查看快速预览/最终 PDF；
3. Assistant：Chat、RAG、Draw、Review 等辅助面板。

三个主视图互斥显示，避免中央编辑区被侧栏挤出视口。项目首页在窄屏切换为项目卡片，保留搜索、打开和项目管理操作。

## 本地化与字体

- i18next 语言变化同步更新 `document.documentElement.lang`。
- 英文和中文 locale key 集合必须一致。
- 核心 UI 和 LaTeX 快速预览使用系统 CJK/衬线/等宽字体回退及随构建发布的 KaTeX 资源；运行时不请求 Google Fonts、jsDelivr 或其他远程字体样式表。

## 加载预算

- Draw、RAG、Review、Citations、Pipeline、Anti-AI、Terminal、编辑器和预览引擎按需加载。
- CodeMirror 语言扩展按当前文件类型选择，禁止导入完整语言目录。
- EditorPage 初始 chunk 上限是 500 KiB；超过预算时构建失败，不允许只提高阈值规避问题。

2026-07-22 验证中，EditorPage chunk 从约 1,347 KiB 降至约 126 KiB（约 -90.6%）。

## 回归证据

- `tests/mobileI18nContract.test.mjs`
- `tests/e2e/mobile-workspace.spec.ts`
- `tests/frontendBundleContract.test.mjs`
- `tests/offlineFonts.test.mjs`
- `tests/e2e/offline-fonts.spec.ts`
