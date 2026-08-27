# 实验完整记录

本文件记录仓库新增实验的目的、方法、参数、结果与结论。结构化结果统一位于 `experiments/results/`；失败或暴露缺陷的步骤同样保留。

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
