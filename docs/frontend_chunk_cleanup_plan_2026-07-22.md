# 前端大 Chunk 行为保持型拆分计划

日期：2026-07-22

## 现状证据

当前生产构建报告：

```text
MarkdownEditor-*.js       583943 bytes
RenderedPreviewPane-*.js  509998 bytes
```

两者都超过 500 KiB。EditorPage 本身已有 500 KiB 初始入口预算，但没有覆盖后续懒加载 chunk。

## 行为保护

拆分前已有以下回归：

- `frontendBundleContract.test.mjs`：EditorPage 对编辑器、预览和 Draw.io 的懒加载契约；
- `previewDegradationContract.test.mjs`：LaTeX quick preview 的降级语义；
- 编辑器与项目 E2E：打开、编辑、预览、移动端工作区主路径；
- 生产构建本身：TypeScript、Vite transform 和 chunk 输出。

本次额外增加：

- 预览路由按 `.tex` 与 Markdown 分别 lazy-load，避免进入 Markdown 预览时加载 KaTeX/LaTeX 渲染器；
- 所有 JavaScript chunk 的 500 KiB 硬预算，防止只压低 EditorPage facade、却把超大依赖转移到其他 chunk；
- CodeMirror 依赖使用 Rolldown `codeSplitting.groups` 拆成稳定 vendor chunk，不修改编辑器行为和扩展集合。

## 拆分边界

1. `RenderedPreviewPane` 只负责按文件后缀选择预览器和 Suspense fallback。
2. `MarkdownPreview` 与 `LatexPreview` 分别形成独立动态入口；LaTeX/KaTeX 只在 `.tex` quick preview 时加载。
3. CodeMirror 按稳定包边界拆成 `view-state`、`language`、`features` 三组，Markdown renderer 保持单一依赖组；禁止使用 `maxSize` 把存在初始化依赖的模块图机械切碎。`MarkdownEditor` 的状态、keymap、补全、AI ghost text 和滚动同步保持不变。
4. 不新增依赖，不提高预算，不删除功能，不改变公开组件 Props。

## 验收

- `npm run typecheck` 通过；
- 相关单元契约通过；
- `npm run build` 不再出现任何 >500 KiB JavaScript chunk；
- MarkdownEditor、RenderedPreviewPane facade 及拆出的 vendor chunk 均低于 500 KiB；
- Quick preview 的 LaTeX/Markdown 分支仍能渲染；
- 生产 bundle 打开项目列表和编辑器时无模块初始化错误；
- 完整 `npm run check` 通过。

## 运行时回归与最终分组

最初同时对 Markdown renderer 和整个 CodeMirror 图使用 `maxSize`，虽然所有 chunk 都小于 500 KiB、构建也成功，但真实 Chromium 分别出现：

```text
markdown-renderer-*.js: TypeError: r is not a function
codemirror-core-*.js: TypeError: r is not a constructor
```

最终实现保留组件级动态加载，但只按稳定依赖边界分组，不再对模块图做任意尺寸切片。验证结果：最大入口 `index` 约 432.54 KiB，Markdown renderer 约 374.89 KiB，CodeMirror language 约 303.43 KiB，Terminal 约 285.99 KiB，全部低于 500 KiB；项目、移动端、Provider、Skills、RAG、CLI Task 和 Markdown/LaTeX preview 的隔离 Playwright 19/19 通过。
