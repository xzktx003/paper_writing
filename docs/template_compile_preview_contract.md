# 模板、编译与预览契约

日期：2026-07-22

## 模板入口

- 新建项目默认值是显式“空白项目”，不能依赖模板数组顺序。
- 模板 ID 只允许受限字符并必须存在于 manifest。
- `mainFile` 必须位于模板根目录内且真实存在。
- 上传模板不假设 `main.tex`；系统从包含 `\\documentclass` 的 TeX 文件中检测入口，并按 `main.tex`、`paper.tex`、`manuscript.tex` 等稳定优先级选择。
- 模板覆盖提交按 manifest 串行：旧模板先 rename 到隐藏 backup，已校验 staging 再进入正式目录，manifest 使用同目录临时文件原子替换。目录替换或 manifest 提交失败时恢复旧模板；成功后才清理 backup。
- 并发覆盖同一模板或不同模板时，最终模板内容和 manifest 条目必须来自同一次完整提交，不得出现目录来自请求 A、标签来自请求 B 的混合状态。

## 编译状态

编译 API 返回 `success`、`warning` 或 `failed`，并分别提供 `warnings`、`errors`、`exitCode`。是否生成 PDF 与是否存在排版警告是两个维度：例如 Tectonic 达到六轮重跑上限但成功生成 PDF，应显示成功但有警告。

## 编译环境可移植性

- LaTeX、BibTeX、Pandoc 和 Tectonic 子进程默认原样继承服务进程的 `PATH` 与 `LD_LIBRARY_PATH`，不得猜测 `HOME/bin`、Conda 目录或开发者主机路径。
- 非标准工具目录只能通过 `OPENPRISM_COMPILE_PATH` 显式前置；额外动态库目录只能通过 `OPENPRISM_COMPILE_LD_LIBRARY_PATH` 显式前置。
- `OPENPRISM_TECTONIC_BINARY` 同时控制直接 Tectonic 编译和 Pandoc 的首选 PDF engine；未配置时使用可移植的命令名 `tectonic`。
- 路径列表按平台分隔符解析、去除空项并保持首个显式配置优先；重复项不得不断累积。
- 环境变量为空时必须保持继承值不变，不能生成前导/尾随空路径项，也不能清空宿主已有的动态库路径。

## Tectonic 缓存与重复编译

- Tectonic 的 `XDG_CACHE_HOME` 固定到受管项目的 `.compile/tectonic-cache`，同一项目的多次编译复用同一个格式文件、bundle index 和宏包缓存。
- 每次编译仍创建独立的 `.compile/<run-id>` 输出目录；只有本次运行真实生成 PDF 才会更新 `.compile/output`。缓存依赖不等于缓存成功结果，旧 PDF 不得让失败编译返回成功。
- 不在应用外部增加 LaTeX/BibTeX 重跑循环，也不对完整项目目录做高风险结果短路。Tectonic 自身认为需要六轮时允许它完成内部流程，并将六轮上限作为结构化 warning 返回。
- 缓存目录只保存 Tectonic 依赖数据，不作为论文源文件、编译状态或最终 PDF 的权威来源。

## 两类预览

- Quick approximate preview：用于快速编辑结构，不承诺完整 LaTeX 语义；未解析引用、命令和资源必须使用明确占位，图片加载失败应可恢复。
- Final PDF：由真实 LaTeX 工具链生成，是字体、宏包、引用、图表和最终版式的权威结果。

UI 和文档不得把近似 HTML 预览描述成最终排版。

## 回归证据

- `tests/templateContract.test.mjs`
- `tests/templateUiContract.test.mjs`
- `tests/compileService.test.mjs`
- `tests/compileDiagnosticsUi.test.mjs`
- `tests/previewDegradationContract.test.mjs`

其中 `tests/templateContract.test.mjs` 覆盖 manifest 提交失败回滚旧模板，以及并发覆盖后模板内容与 manifest 保持配对。

2026-07-22 的真实 ACL 连续编译验证：在同一个受控缓存目录已就绪后连续运行两次，均 `exit=0`、生成 113122-byte PDF，缓存文件数保持 793，日志中的连接/下载行为均为 0；耗时分别约 2789 ms 和 2775 ms。另一次全新空缓存引导因上游 bundle 下载超时失败，且没有 PDF，验证了缓存初始化失败不会被误报为成功。
