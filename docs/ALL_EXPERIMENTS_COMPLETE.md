# 实验完整记录

本文件记录仓库新增实验的目的、方法、参数、结果与结论。结构化结果统一位于 `experiments/results/`；失败或暴露缺陷的步骤同样保留。

## 2026-08-28：参赛视频中文烧录字幕兼容性

- **目的**：验证在宿主系统没有中文字体时，FFmpeg/libass 仍能稳定生成中文可读、三分钟内、平台兼容的参赛成片。
- **方法原理**：先直接把前端随包 WOFF2 字体交给 libass，保留中文方框的失败结果；再用已安装的 fontTools 将同一字体临时解包为 TTF，供 libass 烧录 ASS 字幕。最终从片头、收件、审阅、度量、交付和片尾六个时间点抽帧目检，并用 ffprobe 验证媒体参数。
- **关键参数**：原始 H.264 148.840 秒；片头 5 秒；片尾 7 秒；25 fps；1440×960；libx264 CRF 20、medium、yuv420p、faststart；字幕底板使用半透明深色不透明框；输出无音轨。
- **结果数据**：直接加载 WOFF2 时中文显示方框；转换为 TTF 后六个抽检画面中文均正常。最终成片 160.840 秒，H.264、1440×960、yuv420p，小于 3 分钟；同时生成 ASS、逐段解说词稿和 JPG 封面。
- **结论**：参赛视频构建不能依赖宿主字体，也不能直接假设 libass 支持 WOFF2；构建脚本应临时转换仓库已随前端分发的字体，结束后清理临时文件。成片只增加说明层，不裁断中间的连续操作证据。
- **结构化结果**：`experiments/results/competition_video_subtitle_render_20260828.json`

## 2026-08-27：OfficeCLI v1.0.145 真实二进制适配验证

- **目的**：确认 GitHub 上游 OfficeCLI 的真实命令合同、Linux 二进制完整性，以及 OpenPrism 的安全 argv 适配器能否创建、读取、修改、模板合并、验证和渲染 Office 文件。
- **方法原理**：从 `iOfficeAI/OfficeCLI` v1.0.145 release 下载 Linux x64 资产与 `SHA256SUMS`，先校验哈希，再读取 `--version`/各命令 `--help`。使用 `OFFICECLI_SKIP_UPDATE=1` 运行 OpenPrism 适配器，并用内置 OOXML 解析器交叉读取生成物。
- **关键参数**：版本 `1.0.145`；资产 SHA-256 `449f0e6a1298e3c6d7da792d26ab53d04ba77bd990f299b51123c7aef383d2ce`；操作 `dump/create/batch/merge/view/validate`；执行 `shell: false`；临时样本位于 `/tmp` 且未提交。
- **结果数据**：checksum 与 release 清单一致；`--version` 返回 `1.0.145`；create/dump/validate/view HTML、batch edit、template merge 均成功。创建 DOCX 5,183 bytes，dump JSON 7,924 bytes，HTML 49,376 bytes。首次交叉读取 merge DOCX 时暴露 `xml:space="preserve"` 文本漏读，修复解析器后读回“可核验办公方案”。
- **结论**：适配器应固定映射上游真实命令，不能推测不存在的 `diff`；OpenPrism 保留内置抽取文本 diff。OfficeCLI 可作为显式可选能力，不应作为默认依赖或在运行中自动更新。
- **结构化结果**：`experiments/results/officecli_v1_0_145_smoke.json`

## 2026-08-27：中文组合证据支持/冲突判定

- **目的**：验证一段中文办公材料同时包含肯定事实和另一项否定结果时，不会将所有相关主张统一误判为冲突。
- **方法原理**：用“试点已批准，但首次演练未减少材料整理耗时”作为唯一材料，分别查询批准主张与耗时下降主张；冲突必须绑定共享动作词附近的局部前置否定。
- **关键参数**：本地 BM25 + 128 维哈希 token/字符 n-gram 余弦 + deterministic reranker；证据图 topK 使用默认值。
- **结果数据**：批准主张产生 `support`，耗时下降主张产生 `conflict`；独立中文材料、组合段落单测与真实路由 E2E 均通过。
- **结论**：整段 conflict marker 只能作为候选信号，不能替代面向主张的局部否定判断。
- **结构化结果**：`experiments/results/chinese_evidence_relation_regression.json`

## 2026-08-27：办公赛道受控证据链复现评估

- **目的**：为参赛材料提供不依赖主观描述的技术证据，验证中文材料检索、支持/冲突/缺失关系、会议决定/待办提取和重复运行稳定性，同时明确该实验不替代真实业务提效试点。
- **方法原理**：构造 4 份脱敏受控材料、4 个检索问题、4 个证据主张和 1 份带时间戳逐字稿；使用本地 BM25 + 128 维哈希向量 + deterministic reranker、证据关系图和会议解析器运行 100 次，并保存原始 JSON。
- **关键参数**：chunk size 80、overlap 10、search topK 3、graph topK 4、重复 100 次；Node/平台信息随结果保存，但不记录主机路径、凭据或业务敏感数据。
- **结果数据**：首次运行 9 项检查通过 8 项，暴露“没有证明稳定提效”被误判为 support；补充红灯测试并修复否定动作词后，9/9 通过。最终 100 次重复运行的 p50、p95、max 延迟以结果 JSON 为准。
- **结论**：当前实现能在受控样本中可复现地区分 support/conflict/missing 并提取时间戳决定/待办；这些结果只证明技术正确性和演示可复现性，不得写成企业生产率或稳定真实落地。
- **结构化结果**：`experiments/results/office_competition_controlled_evaluation_20260827.json`
