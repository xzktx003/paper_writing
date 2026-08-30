# 实验记录

## 2026-08-20 01:53:19 CST：LLaMA-2-7B Vector-GSQ Full-32 GPU1 正式实验启动

- 实验目的：利用 Remote-14 第二张 A6000，与 GPU0 的 LLaMA-3-8B 并行完成
  LLaMA-2-7B Vector-GSQ 全模型量化、WikiText2 PPL 和六项零样本准确率。
- 方法原理：对 32 个 block 的 q/k/v/o/gate/up/down 执行 NoWag-d6、Vector-GPTQ
  top-128/concurrency=7 和 block-level Vector-GSQ K8/400 steps；逐层传播量化 hidden cache。
- 实验配置：`/data01/datasets/llama2-7b-hf`，32 层、hidden 4096、MLP 11008、vocab
  32000；物理 GPU1；64×4096 calibration、8×4096 train、8×4096 validation；PPL
  WikiText2 test/seqlength=2048；lm-eval 六任务 0-shot。
- 数据审计：LLaMA-2 tokenizer 专属 cache `[4736,4096]`，token 范围 `[1,31999]`，
  identity 与模型路径一致。cache builder 同样在原子写出后出现退出期 GIL 错误，但新进程
  完整加载、shape 和 token range 审计均通过。
- 当前状态：Remote-14 GPU1 已启动，run ID 为
  `20260820_015319_llama2_7b_d6_gptqtop128_gsqk8_s400_full32_gpu1_c7`；GPU0 的
  LLaMA-3-8B 同期已完成 4/32 层并进入第 5 层。
- 02:54 CST 进度：完成 7/32 层，第 8 层 Vector-GPTQ 已完成并进入 Vector-GSQ；
  GPU1 使用 30574 MiB、利用率 97%，logical bpp=2.020614070595855，无异常。
- 03:55 CST 进度：完成 15/32 层，第 16 层 Vector-GPTQ 已完成；GPU1 使用
  31544 MiB、利用率 97%，按约 7.6 分钟/层预计 06:05 CST 完成量化。
- 04:56 CST 进度：完成 23/32 层，第 24 层正在 Vector-GPTQ；剩余 9 层，预计约
  06:05 CST 完成量化并进入测试，无异常。
- 05:57 CST 进度：完成 31/32 层，最后一层 Vector-GPTQ 已完成并进入最后一次
  Vector-GSQ；预计数分钟后进入 PPL。
- 06:58 CST 最终结果：32/32 层与 224/224 Linear 完成；量化 14651.8526 s，logical
  bpp=2.020614070595855，峰值 25.70 GiB；PPL=7.643916130065918；六任务 macro=
  0.6264258498468571；fresh reconstruction exact=true。
- 结果入口：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260820_015319_llama2_7b_vector_gsq_formal_launch.json`。
- 启动报告：`report/20260820_015319_llama2_7b_vector_gsq_formal_launch_report.md`。

## 2026-08-20 01:14:36 CST：LLaMA-3-8B Vector-GSQ Full-32 正式实验启动

- 实验目的：在 Remote-14 现有 LLaMA-3-8B 资产上完成第一组 tokenizer 正确的
  Vector-GSQ 全模型 checkpoint，并自动测试 WikiText2 PPL 与六项零样本准确率。
- 方法原理：对每个 Transformer block 的 q/k/v/o/gate/up/down 七个 Linear，顺序执行
  NoWag-d6、Hessian-aware Vector-GPTQ top-128 和 block-level Vector-GSQ；同一 block
  七个 Vector-GPTQ Linear 使用七路 CUDA stream 并发，量化后顺序传播 hidden cache。
- 实验步骤：同步并校验远端代码；生成 LLaMA tokenizer 专属 FineWeb-Edu cache；通过
  identity/shape/token-range 审计；在 GPU0 启动 32 层量化；完成后自动 fresh reconstruct
  checkpoint，执行 WikiText2 test PPL 和 lm-eval 六任务。
- 实验配置：`Meta-Llama-3-8B`，Remote-14 GPU0 RTX A6000 48GB；seed=0；d=6/W2；
  64×4096 calibration，8×4096 train，8×4096 validation；GPTQ top-128、row chunk=64、
  concurrency=7；GSQ local candidates=8、400 steps/block；PPL seqlength=2048、batch=1；
  lm-eval 0-shot ARC-C/ARC-E/HellaSwag/LAMBADA/PIQA/WinoGrande。
- 启动前结果：两张 GPU 均空闲；模型确认为 `LlamaForCausalLM`、32 层；远端协议测试
  13 passed，本地 launcher 测试 14 passed。LLaMA cache 为 `[4736,4096]`、token 范围
  `[0,128000]`，与 vocab size 128256 一致。
- 当前状态：GPU0 正在运行；01:47 CST 已完成 4/32 层并进入第 5 层；启动 JSON：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260820_011436_llama3_8b_vector_gsq_formal_launch.json`。
- 02:54 CST 进度：完成 12/32 层，第 13 层 Vector-GPTQ 已完成并进入 Vector-GSQ；
  GPU0 使用 36064 MiB、利用率 91%，logical bpp=2.0194936899038463，无异常。
- 03:55 CST 进度：完成 20/32 层，第 21 层正在 Vector-GPTQ；GPU0 使用 39068 MiB，
  按约 7.64 分钟/层预计 05:25 CST 完成量化。
- 04:56 CST 进度：完成 28/32 层，第 29 层正在 Vector-GPTQ；剩余 4 层，预计约
  05:27 CST 完成量化并自动进入 PPL。
- 05:57 CST 结果：32/32 层量化完成，墙钟 15024.3579 s（4:10:24），logical bpp=
  2.0194936899038463；fresh reconstruction WikiText2 test PPL=10.740633010864258；
  lm-eval 六任务进行到约 71%，无异常。
- 06:58 CST 最终结果：六任务 macro=0.6430448798859616；量化峰值 30.18 GiB；PPL 与
  lm-eval 全部完成，fresh reconstruction exact=true。两模型完整结果与 checkpoint 已回拉，
  rsync checksum 与远端一致。汇总报告：
  `report/20260820_070112_llama2_7b_llama3_8b_vector_gsq_formal_results_report.md`。
- 报告：`report/20260820_011436_llama3_8b_vector_gsq_formal_launch_report.md`。

## 2026-08-20 00:02:43 CST：LLaMA Vector-GSQ/QTIP 同协议实验能力 Gate

- 实验目的：把现有 Qwen3 Vector-GSQ 流程扩展到 dense LLaMA，并建立能够直接比较
  QTIP 的同基座、同码率、同 PPL 和同下游任务协议。
- 方法原理：LLaMA-3 与 Qwen3 dense decoder 都包含 q/k/v/o/gate/up/down 七个目标
  Linear，因此复用 NoWag-d6 → top-128 Vector-GPTQ → block-level Vector-GSQ 主链；
  运行时显式校验架构。QTIP 通过官方 `model_from_hf_path(..., device_map="balanced")`
  加载，二者都采用独立 fresh reconstruction/evaluation，并由比较器校验协议后计算差值。
- 实验步骤：先新增失败测试锁定架构、cache 身份、协议和 launcher；实现 LLaMA token
  cache、架构 Gate、QTIP 评测与汇总；执行 Python 编译、shell 语法检查和相关单元测试。
- 实验配置：CPU 代码 Gate，无正式 GPU 量化；目标正式配置为 LLaMA-3.1-8B、d=6、W2、
  GPTQ top-128/concurrency=7、GSQ local candidates=8/400 steps、FineWeb-Edu 64×4096
  calibration + 8×4096 train + 8×4096 validation；WikiText2 test seqlength=2048；
  lm-eval 0-shot ARC-C/ARC-E/HellaSwag/LAMBADA/PIQA/WinoGrande。
- 实验结果：相关测试 31 项通过，新增模块均通过 `py_compile`，launcher 通过 `bash -n`。
  代码与实验协议已就绪；本次遵守远端实验规则，没有在本地 GPU 启动正式量化，因而尚无
  LLaMA-3.1-8B 与 QTIP 的最终 PPL/accuracy 数值。
- 验证限制：全仓 `pytest` 在收集阶段被既有环境阻断——默认 Python 缺少
  `lion_pytorch`，且已安装 ModelScope 要求当前 Transformers 中不存在的
  `AutoModelForVision2Seq`；本次相关 31 项测试不依赖这两个失配并全部通过。
- 关键审计发现：2026-07-23 的旧 LLaMA-3-8B 单层 Gate 使用的 token cache identity 为
  `Qwen3-0.6B`。该记录仍能证明七 Linear 代码路径曾运行完成，但不能作为 LLaMA 方法质量
  证据；新入口会直接拒绝这种 cache/model mismatch。
- 结论：dense LLaMA 扩展和公平对比工具链完成；下一正式实验必须在 `10.30.0.14` 执行，
  并在 QTIP 模型卡 effective-bpp 与 Vector-GSQ logical bpp 的绝对差不超过 0.10 时才排名。
- 结果：`experiments/results/20260820_000243_llama_vector_gsq_qtip_enablement.json`。
- 报告：`report/20260820_000243_llama_vector_gsq_qtip_enablement_report.md`。

> 2026-07-14 16:23:42 范围更正：此前标记为主实验的 MLP-only codebook-GSQ
> 不符合最终目标。论文主实验必须覆盖每个 block 的 q/k/v/o/gate/up/down 七个
> Linear，`lm_head` 保持浮点。MLP-only 结果降级为范围消融，新的 all-block 实验
> 从空 checkpoint 目录重新运行。

## 2026-07-14 18:30:42：真实 Qwen3-4B 全 Block W2/G32 Codebook-GSQ 重跑

- 目标：纠正 MLP-only 范围错误，量化每个 block 的 q/k/v/o/gate/up/down 七个
  Linear，`lm_head` 保持浮点。
- 口径：真实 Qwen3-4B-Instruct-2507、W2/G32、seed 0、C4 `128/32×2048`、
  每 Linear 独立四点码本、不强制零码点；四组从空 checkpoint 目录并行重跑。
- PPL：FP `10.0544`、uniform GPTQ `19.0157`、codebook GPTQ `36.0736`、
  uniform GSQ `285.1739`、codebook GSQ `84.0673`。
- 比较：codebook GPTQ 比 uniform GPTQ 差 `89.70%`；uniform/codebook GSQ 分别
  比各自 GPTQ 初始化差 `1399.68%/133.04%`；codebook GSQ 比 uniform GSQ 好
  `70.52%`，但仍显著差于 uniform GPTQ。
- 范围影响：相对 MLP-only，all-block 的 uniform/codebook GPTQ PPL 分别增加
  `26.13%/62.25%`，uniform/codebook GSQ 分别增加 `830.74%/233.04%`。
- 审计：每个 checkpoint 恰有 `252=36×7` 个状态，attention 144、MLP 108、
  `lm_head=0`；q_norm/k_norm 各 36 个浮点 tensor；全部 W2/G32、有限有序、无精确零点。
- 漂移：codebook GSQ 相对 GPTQ 共改变 `38.39%` assignments，整体 scale
  relative-L2 `1.033`；q/k assignment 改变 `49.71%/50.89%`。
- 结论：正确范围下方法尚未成功。attention 特别是 q/k 的 GSQ 路径与 MLP GSQ
  都大幅偏离 GPTQ 初始化，局部训练没有转化为全模型 NLL 改善。
- 结果：
  `code/GSQ/experiments/results/formal/codebook_gsq_g32_qwen3_4b_instruct_all_block/20260714_183042_summary.json`。

## 2026-07-11：STOM/GSQ 实验工程初始化

- 目的：基于官方 GSQ 实现论文中的 source-to-task adaptive scalar
  quantization，并建立完整实验与消融流水线。
- 方法原理：保留 GSQ 的逐层 Gumbel assignment 优化，在其前后分别加入
  layer-wise GGD/Lloyd-Max source solution、持续 source prior、hard coordinate
  refinement 和 validation-gated fallback。
- 关键参数：正式默认 W2、K=4、G=128、FP16 scale/codepoint、C4 128 train +
  32 validation、sequence length 2048；预实验使用 Qwen3-0.6B。
- 结果：已确认 8x A100 80GB、`xh2` 环境、核心 Qwen/LLaMA 模型镜像和
  C4/WikiText/zero-shot 数据缓存；已克隆 GSQ `03fc164`。算法实验尚未运行。
- 结论：基础运行条件满足，下一步按红绿灯测试实现核心数学组件。

## 2026-07-11：Qwen3-0.6B STOM 一层 smoke（source-only）

- 目的：验证 `quantization.method: stom` dense MLP 路径能在真实 Qwen3-0.6B
  layer 上完成 capture → source hard state → STOM shard save → reload →
  activation propagation。
- 命令：
  `CUDA_VISIBLE_DEVICES=0 /data01/home/xuzk/anaconda3/envs/xh2/bin/python main.py --config configs/stom/qwen3_06b_w2_source_only_smoke.yaml --max-layers 1`
- 关键参数：W2、group size 128、C4 cached dataset、train 8、val 4、
  sequence length 256、`source_strength_candidates: [.inf]`。
- 结果目录：
  `code/GSQ/experiments/results/smoke-qwen3-06b-w2-source-only/20260711-233530_c8dece`
- 结果数据：退出码 0；`progress.json` 显示 `last_completed_layer: 0`；
  `model_layers_0_mlp.safetensors` metadata 为 `{"format": "stom-v1"}`；
  `stom_layer_metrics.jsonl` 记录 gate/up/down 三个 Linear 的 source fallback、
  source loss history、validation source mean loss 和有效 bit 审计。
- 结论：source-only 路径可在真实模型上完成一层端到端 checkpoint replay。

## 2026-07-11：Qwen3-0.6B STOM 一层 smoke（full finite candidate）

- 目的：验证有限 lambda candidate 的 train-only adaptation、validation gate、
  selected hard state 保存和 reload/propagation 在真实 Qwen3-0.6B layer 上可运行。
- 首次尝试：`configs/stom/qwen3_06b_w2_full_smoke.yaml` 使用 4 个 lambda、
  2 个 epoch、开启 hard coordinate refinement；运行约 5 分钟仍处于 layer 0
  Python-level refinement/optimization，手动中断，退出码 130。该设置不适合作为
  快速 smoke，但不代表算法失败。
- 调整：仅对 smoke 配置降载，改为 `source_strength_candidates: [0.0]`、
  `num_epochs: 1`、`source_alternation_rounds: 1`，并关闭 assignment/scale/codepoint
  coordinate refinement；正式实验仍需恢复论文默认矩阵。
- 命令：
  `CUDA_VISIBLE_DEVICES=0 /data01/home/xuzk/anaconda3/envs/xh2/bin/python main.py --config configs/stom/qwen3_06b_w2_full_smoke.yaml --max-layers 1`
- 结果目录：
  `code/GSQ/experiments/results/smoke-qwen3-06b-w2-full/20260711-234246_08101a`
- 结果数据：退出码 0；`progress.json` 显示 `last_completed_layer: 0`；
  `model_layers_0_mlp.safetensors` metadata 为 `{"format": "stom-v1"}`；
  `stom_layer_metrics.jsonl` 记录每个 Linear 的 candidate train loss、validation
  evidence、fallback 决策和 storage；其中 `down_proj` 选择 `lambda=0`，
  `gate_proj/up_proj` fallback 到 source。
- 结论：full STOM 训练路径在真实模型一层上可运行；下一步需要两层 smoke、
  恢复 hard refinement 的性能优化/分块化，以及正式矩阵调度。

## 2026-07-11：Qwen3-0.6B STOM 两层 smoke（source-only）

- 目的：验证 source-only STOM 在连续两层上可以完成 checkpoint reload 后的
  activation propagation，避免只验证第 0 层而遗漏顺序传播问题。
- 命令：
  `CUDA_VISIBLE_DEVICES=0 /data01/home/xuzk/anaconda3/envs/xh2/bin/python main.py --config configs/stom/qwen3_06b_w2_source_only_smoke.yaml --max-layers 2`
- 关键参数：W2、group size 128、C4 cached dataset、train 8、val 4、
  sequence length 256、`source_strength_candidates: [.inf]`。
- 结果目录：
  `code/GSQ/experiments/results/smoke-qwen3-06b-w2-source-only/20260711-235024_18a4b1`
- 结果数据：退出码 0；`progress.json` 显示 `last_completed_layer: 1`；
  `stom_layer_metrics.jsonl` 有 2 行，对应 layer 0 和 layer 1；
  `model_layers_0_mlp.safetensors` 与 `model_layers_1_mlp.safetensors` metadata
  均为 `{"format": "stom-v1"}`。
- 结论：source-only STOM 可跨两层连续 replay 并传播 train/val/GPTQ activation。

## 2026-07-11：Qwen3-0.6B STOM 两层 smoke（reduced full finite candidate）

- 目的：验证 reduced full STOM 在连续两层上可以完成有限 candidate adaptation、
  validation gate、selected hard state reload 和 activation propagation。
- 命令：
  `CUDA_VISIBLE_DEVICES=0 /data01/home/xuzk/anaconda3/envs/xh2/bin/python main.py --config configs/stom/qwen3_06b_w2_full_smoke.yaml --max-layers 2`
- 关键参数：W2、group size 128、C4 cached dataset、train 8、val 4、
  sequence length 256、`source_strength_candidates: [0.0]`、1 epoch、smoke-only
  关闭 coordinate refinement。
- 结果目录：
  `code/GSQ/experiments/results/smoke-qwen3-06b-w2-full/20260711-235132_47847c`
- 结果数据：退出码 0；`progress.json` 显示 `last_completed_layer: 1`；
  `stom_layer_metrics.jsonl` 有 2 行；layer 0 的 `down_proj` 选择 `lambda=0`，
  `gate_proj/up_proj` fallback source；layer 1 的 `gate_proj/up_proj` 选择
  `lambda=0`，`down_proj` fallback source。两个 MLP shard metadata 均为
  `{"format": "stom-v1"}`。
- 结论：reduced full STOM 训练路径已通过真实模型两层 smoke。下一步应实现实验
  matrix/collector，并优化 hard coordinate refinement 后再扩大正式实验。

## 2026-07-12：STOM matrix scheduler deterministic smoke

- 目的：验证 `experiments/stom/matrix.yaml` 中的 smoke run 可以通过统一 scheduler
  以确定性 run_id 和结果目录执行，并能被 manifest validator 判定为完成，从而为
  后续 8 GPU formal matrix 执行提供 resume/skip 基础。
- 命令：
  ` /data01/home/xuzk/anaconda3/envs/xh2/bin/python -m experiments.stom.run --track smoke --execute`
- 关键参数：scheduler 为每个 run 设置 `GSQ_RUN_ID`、`GSQ_CHECKPOINT_DIR=experiments/results`
  和 `CUDA_VISIBLE_DEVICES`；两个 smoke run 顺序执行，分别对应 source-only 与 reduced
  full finite-candidate STOM。
- 结果目录：
  - `code/GSQ/experiments/results/smoke_qwen3_06b_w2_source_only_2layer`
  - `code/GSQ/experiments/results/smoke_qwen3_06b_w2_full_2layer`
- 验证命令：
  - `python -m experiments.stom.validate_manifest experiments/results/smoke_qwen3_06b_w2_source_only_2layer --expected-layers 2 --require-stom`
  - `python -m experiments.stom.validate_manifest experiments/results/smoke_qwen3_06b_w2_full_2layer --expected-layers 2 --require-stom`
  - `python -m experiments.stom.run --track smoke | wc -l`
- 结果数据：两个 validator 均返回 `ok: true`、`layers_seen: [0, 1]`，并确认
  `model_layers_0_mlp.safetensors` 和 `model_layers_1_mlp.safetensors` 为 STOM
  shards；完成后 dry-run scheduler 输出 0 个待执行 smoke jobs。
- 结论：matrix scheduler 的 deterministic run directory、manifest validation 和
  skip-completed resume gate 已通过 smoke 验证。下一步是 collector 与 formal run
  schema 覆盖。

## 2026-07-12：STOM zero-shot orchestration red/green validation

- 目的：补齐 `zero-shot-six-task` 表族的自动化执行入口，避免手工拼接 STOM
  reconstructed HF export、`lm_eval`、formal metric conversion 和 manifest
  validation。
- 方法原理：新增 `experiments.stom.run_zero_shot`，按 matrix `run_id` 解析正式
  zero-shot 行，要求上游量化 run 已 `progress.status=complete`；STOM 方法先将
  `stom-v1` shards overlay 到 `hf_export/`，随后以 `lm_eval --model hf` 跑
  ARC-Challenge、ARC-Easy、HellaSwag、LAMBADA OpenAI、PIQA、WinoGrande 六个
  0-shot 任务，再调用 converter 生成 `formal_metrics.json` 并用 manifest
  validator 审计。
- 关键参数：任务集合
  `arc_challenge,arc_easy,hellaswag,lambada_openai,piqa,winogrande`；
  `--num_fewshot 0`；模型参数
  `pretrained=<RUN_DIR>/hf_export,trust_remote_code=True`；结果文件
  `<RUN_DIR>/lm_eval_results.json`。
- 结果数据：TDD 红灯先确认缺失模块导致
  `ModuleNotFoundError: experiments.stom.run_zero_shot`；实现后
  `tests/stom/test_run_zero_shot.py` 4 个用例通过，并与
  `test_zero_shot_metrics.py`、`test_export_hf.py`、`test_experiment_manifest.py`
  联合验证共 14 个用例通过。未启动真实 GPU/lm_eval 正式任务。
- 结论：zero-shot 正式表族现在具备可审计 orchestration 边界；下一步是在完成
  对应 formal quantization run 后，对具体 run_id 启动真实 `lm_eval` 并收集
  `formal_metrics.json`。

## 2026-07-13：Qwen3-0.6B baseline / STOM 离谱 PPL 根因诊断

- 目的：逐项核查历史 RTN/GPTQ PPL 与 FP16 完全相同、STOM PPL 达到十万至
  百万级、模型规模标签和 storage 指标异常的原因；所有新诊断均使用
  `/data01/datasets/Qwen3-0.6B`，GPU 4–7，并停止 seed sweep。
- PPL 实现交叉验证：在同一 WikiText2 token 流上比较 HuggingFace 全模型 forward
  与 GSQ 逐层 wrapper。sequence length 2048 时分别为 `20.9605938` 与
  `20.9598158`，相对差 `3.7e-5`；sequence length 512 时分别为
  `28.6258194` 与 `28.6255121`，相对差 `1.1e-5`。结论：逐层 PPL 计算可信，
  百万 PPL 不是评估公式伪造。结果目录：
  `code/GSQ/experiments/results/diagnostics/ppl_crosscheck_qwen3_06b/`。
- 历史 baseline checkpoint 审计：历史 RTN/GPTQ 的 MLP shard 只含 BF16
  `.weight`；第 0 层 `gate_proj` 与原模型逐元素完全相同，`max_abs_diff=0`。
  根因是 `gsq_enabled=false` 时量化初始化只进入 trainer，主流程随后保存了原始
  dense MLP。修正为直接保存 RTN/GPTQ 的 `Q, scales`，并使用当前
  `compressed_tensors` 的 `compress_weight/decompress_weight` 与真实 2/4-bit
  `QuantizationArgs`。
- 单层 packed round-trip：W2 MLP shard 2.66 MB，W4 5.01 MB；四组 checkpoint
  均只含 `.weight_packed/.weight_scale/.weight_shape`。第 0 层 gate projection
  相对 L2：RTN-W2 `0.3676`、GPTQ-W2 `0.5082`、RTN-W4 `0.0988`、
  GPTQ-W4 `0.1517`（GPTQ 单层审计只用 8 个校准样本）。结果目录：
  `code/GSQ/experiments/results/diagnostics/baseline_roundtrip_qwen3_06b/`。
- 修正后的完整 baseline PPL（MLP-only，128 条 C4 校准，group 128，WikiText2
  2048）：FP16 `20.9606`，GPTQ-W4 `22.0600`，RTN-W4 `23.3325`，
  GPTQ-W2 `47.5771`，RTN-W2 `256.5847`。bit-width 与 GPTQ/RTN 顺序合理，
  证明评估确实读回量化权重。结果目录：
  `code/GSQ/experiments/results/diagnostics/baseline_ppl_qwen3_06b/`。
- 模型身份审计：`Qwen3-4B/config.json` 实际为 hidden size 1024、28 层；其
  `model.safetensors` 与 `Qwen3-0.6B` 文件大小和 SHA256
  `f47f71177f32bcd101b7573ec9171e6a57f4f4d31148d38e382306f42996874b`
  完全相同。因此历史所有 `qwen3_4b` 行实际运行的是 0.6B，相关模型规模结论
  无效；Qwen3-8B 目录为独立的真实 8B shard。
- STOM scope 审计：历史 STOM 配置 `target_scope: all_linear`，所谓
  `model_layers_N_mlp.safetensors` 同时含 4 个 attention 与 3 个 MLP Linear。
  加载时它在 dense self-attention shard 之后覆盖 q/k/v/o；而历史 RTN/GPTQ
  `self_attn: false` 只量化 MLP，比较口径不一致。第 0 层 STOM attention 权重
  相对 L2 为 `0.364–0.376`，attention+residual 运行时误差 `0.460`。
- STOM 激活漂移：all-linear source-only 在第 0 层相对激活误差 `0.511`，第 17
  层余弦跌破 0.5，第 21 层相对误差超过 1，第 27 层范数放大 6.15 倍，
  小批 PPL 约 113 万；full 与之近似。MLP-only source group128/group64 的正式
  PPL 仍为 `318560.57/232736.72`，说明 attention scope 是重要放大因素但不是
  唯一根因。结果目录：
  `code/GSQ/experiments/results/diagnostics/activation_drift_qwen3_06b/` 和
  `stom_mlp_scope_qwen3_06b/`。
- 激活加权线性误差：第 2 层 STOM source 的 local MLP error `0.6904`，RTN
  `0.4829`；STOM up/down projection 输出误差 `0.5568/0.6696`，RTN 为
  `0.3783/0.4084`。结论：普通 weight MSE 相近并不代表真实激活方向误差相近，
  STOM source 误差集中在敏感方向。
- task adaptation 参数审计：历史 `num_epochs: 1` 等价于每候选仅 1 optimization
  step；`device_microbatch_size: 4` 又在 token 展平后被误用为 task batch，导致
  每 step 只采 4 个 token。新增独立 `stom.optimization_steps` 与
  `stom.task_batch_size`；4096 token/step 已与 16384 基本等价，关键变量是 steps。
- 完整 compute-scaling（MLP-only、group64、lambda 0、4096 token/step）：source
  `232736.72`，20 steps `108804.83`，50 steps `473482.46`，100 steps
  `57044.49`，200 steps `4018.85`。task adaptation 能显著修复 source 崩坏，
  但曲线非单调，200 steps 仍远差于 GPTQ-W2 `47.58`。
- 敏感层混合精度：在 200-step checkpoint 上保留 FP16 layers 0–2，正式 PPL
  `200.72`；再保护 27、26–27、25–27 时分别为 `147.00`、`127.96`、
  `124.85`。结论：少量早期/末端敏感层主导崩坏，混合精度可再改善约 32 倍，
  但当前仍未超过 GPTQ-W2。
- storage 审计：历史 `effective_bits_per_weight` 只是配置标签，
  `total_model_bytes` 只统计 layer shard，遗漏 embedding/final norm/lm_head；STOM
  all-linear 目录还重复保存 dense 与 quantized attention。按现有 MLP-only
  checkpoint 加未量化权重估算，整模型约 `11.17 bits/weight`，不能宣称 2-bit
  整模型压缩。
- 总结：当前实现链已经证明 task-aware adaptation 有显著修复作用，但尚未验证
  STOM 优于可信 baseline。后续实验应以正确模型身份、相同 target scope、真实
  storage accounting、独立 task batch/steps 和敏感层策略为前提。

## 2026-07-14：Qwen3-0.6B Stage-I 全 Linear block-scale + KMeans 码本审计

- 目的：在进入 GPTQ、Gumbel 或 PPL 之前，独立验证论文阶段一的基本表示是否
  成立：每个 Linear 先建立 block scale，对归一化权重学习独立的 2-bit 一维
  KMeans 非均匀标量码本，并逐 Linear 与同位宽 uniform scalar codebook 比较。
- 方法原理：对形状为 `[out_features, in_features]` 的每个 Linear，沿输入维按
  group size 128 分 block；以每个 row/block 的 RMS 初始化正 scale；在
  `W / scale` 上执行确定性的 1D Lloyd/KMeans；将码本投影到 unit-RMS gauge，
  再交替执行最近邻 assignment、每 block 闭式最小二乘 scale 更新和归一化权重
  KMeans 更新。每次更新只在原权重 MSE 不上升时接受。整个阶段不读取激活、
  Hessian、task loss，也不使用 GPTQ 或 Gumbel-Softmax。
- 关键参数：真实模型 `/data01/datasets/Qwen3-0.6B`；W2、4 个 codepoints、
  group size 128、最多 5 轮 scale/codebook alternation、每次 KMeans 最多 50 轮；
  不做 seed sweep。GPU 4–7 分别处理 layers 0–6、7–13、14–20、21–27，GPU 7
  额外处理 tied `lm_head`。调试阶段取消 20 分钟轮询窗口，启动后按秒级/分钟级
  检查日志。
- 结果目录：
  `code/GSQ/experiments/results/diagnostics/stage1_codebook_qwen3_06b/`；聚合报告为
  `summary.json`，每个 Linear 的 codebook、scales 和 uint8 assignments 保存于
  `states/*.safetensors`。
- 结果数据：28 层每层 7 个 Linear，共 196 个 Transformer Linear，加
  `lm_head` 共 197 个；197/197 全部通过，0 failure，模块名无重复，197 个码本
  舍入到小数点后 6 位仍全部不同。KMeans 相对 uniform 的逐 Linear 权重 MSE
  改善最小/平均/中位数/最大分别为 `1.513% / 2.044% / 1.912% / 3.898%`；按权重
  数加权的总体改善为 `1.859%`。attention 112 个 Linear 平均改善 `2.082%`，
  MLP 84 个 Linear 平均改善 `1.999%`，`lm_head` 改善 `1.516%`。最弱改善层为
  `model.layers.5.self_attn.o_proj`（`1.513%`），仍严格优于 uniform；最强为
  `model.layers.20.self_attn.v_proj`（`3.898%`）。
- 完整性验证：所有码本有限、严格有序且非均匀；所有 scale 有限且大于 0；
  assignments 形状与权重一致且范围为 `[0, 3]`；KMeans normalized control 和
  original-weight MSE 均逐 Linear 不劣于 uniform；alternation history 单调不升。
  197 份状态文件共约 0.59 GiB，逐文件 safetensors header/shape 审计零错误。
- 结论：阶段一门槛通过，证明“先 block-scale 归一化，再为每个 Linear 学习独立
  非均匀 KMeans 码本”在 Qwen3-0.6B 全 Linear 上稳定优于 uniform weight-MSE
  control。该结果只验证 source representation，不代表 PPL 改善；阶段二应在
  固定这些非均匀码本的前提下实现 scalar-codebook GPTQ，并与可信 uniform
  GPTQ-W2 做相同全 Linear scope 的公平比较。

## 2026-07-14：Qwen3-0.6B zero-anchor Stage-I 与 robust scalar-codebook GPTQ

- 目的：修正最初无零码本相对 control 过弱的问题，并验证固定的逐 Linear
  非均匀码本能否在相同 all-Linear scope 下优于可信 direct GPTQ-W2。全程使用
  Qwen3-0.6B、group/block size 128、C4 128×2048 校准、WikiText2 2048 PPL；
  Transformer 196 个 Linear 全量化，`lm_head` 保持 FP16，不做 seed sweep。
- Stage-I 修订：四个码点中固定一个精确零点，其余三个码点在 `W / block_scale`
  上用一维 KMeans 学习；每个 Linear 保持独立码本。相对含零 uniform integer
  geometry，197/197 个 Linear 通过，最差/平均/中位数/最大权重 MSE 改善为
  `8.470% / 9.540% / 9.600% / 10.651%`，按权重数加权改善 `9.589%`。结果目录：
  `code/GSQ/experiments/results/diagnostics/stage1_codebook_zero_anchor_qwen3_06b/`。
- 失败实验：固定 zero-anchor scale 的 `layer 2 down_proj` GPTQ Hessian objective
  为 `104.6836`；普通 L2 dynamic scale 降至 `6.2969`，允许正负 scale 镜像后为
  `4.5876`，仍是同口径 direct `0.46647` 的 `9.83×`。signed scale trust-region
  `max_ratio=32/64/128/256` 分别得到 `17.4046/11.0793/10.1731/9.1021`，均未解决
  问题。对应目录：`stage2_zero_debug/`、`stage2_zero_signed_debug/`、
  `stage2_zero_signed_ratio_{32,64,128,256}/`。
- 根因诊断：误差集中在 `model.layers.2.mlp.down_proj` 的 row 35。原始 group-18
  权重绝对值最大仅 `0.209`，但普通 L2 scale 在前序 GPTQ residual 经 Hessian
  inverse 传播后看到单个 `62.828` working outlier；group 11 一次向未来 column
  2328 注入 `57.54`。普通 L2 为拟合多数普通值而放弃少数离群 residual，而可信
  repository Quantizer 使用范围初始化、80 档 shrink、`|error|^2.4` 和正负朝向
  搜索，因而限制了这条放大链。密集 scale 搜索证明原 L2 交替已达到其自身最优，
  问题是目标函数而非迭代次数。
- 修复方法：保持 Stage-I codebook 固定，在每个 GPTQ group 到达时按当前 working
  weights 建立覆盖范围，分别搜索码本正/负镜像的 80 档 scale，以 p=2.4
  reconstruction error 选 scale，再执行逐列 index 量化与 GPTQ error feedback。
  scale 的符号不增加已有 FP16/BF16 scale metadata bit。
- 三层局部结果：robust grid 把关键 `layer 2 down_proj` objective 从 signed-L2 的
  `4.5876` 降到 `0.51433`，接近 direct 的 `0.46647`；21 个 Linear 中 20/21 的
  Hessian objective 和 weight MSE 均优于 direct。结果目录：
  `code/GSQ/experiments/results/diagnostics/stage2_zero_signed_grid_debug/`。
- 正式结果：robust nonuniform 为 196/196 Linear 通过，WikiText2 PPL
  `186.2285498`、mean NLL `5.2269747`、eval tokens `298862`；同代码重跑的 direct
  GPTQ-W2 为 PPL `347.2989480`、mean NLL `5.8501859`、相同 `298862` tokens。
  nonuniform PPL 相对 direct 降低 `46.378%`。逐 Linear 配对中，nonuniform 在
  195/196 个 Hessian objective、194/196 个 weight MSE 上更优；Hessian objective
  总和为 direct 的 `0.8551×`。结果目录：
  `stage2_formal/zero_anchor_signed_grid_transformer196/` 与
  `stage2_formal/direct_gptq_w2_transformer196_recheck/`。
- 剩余风险与结论：阶段二相对可信 direct GPTQ-W2 的门槛通过，但 PPL 仍显著高于
  FP16 `20.9499`，不能宣称接近无损；正式校准下 `layer 2 down_proj` 仍是唯一明显
  异常，objective `0.05506`，约为 direct `0.01131` 的 `4.87×`。在进入 Gumbel
  前应保留该层作为阶段三首要诊断对象，而不能用 FP16 敏感层保护替代算法验证。

## 2026-07-14：Qwen3-0.6B Stage-III 固定码本/scale 的 Gumbel index 训练与任务级门控

- 目的：在已通过的 Stage-II 非均匀 scalar-codebook GPTQ 状态上，固定每个
  Linear 的独立 codebook 与 row/block scale，只训练每个权重的四路 codepoint
  assignment logits；覆盖 28 层 attention+MLP 的 196 个 Linear，并独立量化
  `lm_head`，不使用 MLP-only、FP16 layer protection 或 seed sweep。
- Stage-II all-Linear 起点：在 Transformer 196 个 Linear 之外独立量化
  `lm_head` 后，197/197 states 的 WikiText2 PPL 为 `206.8981753`、mean NLL
  `5.3322268`、eval tokens `298862`。独立 FP16 evaluator 从 197 个 Stage-III
  格式的零变化状态重建后逐值复现相同 PPL/NLL，证明 state 应用、chunked
  `lm_head` 重建与 all-Linear coverage 可信。
- 训练实现：每层七个 Linear 的 logits 联合训练，codebook/scale 注册为不可训练
  buffer；Lion optimizer；C4 train/validation 为 `128/32 × 2048`；temperature
  `2.0 -> 0.05`、logit scale `100 -> 500`；hard argmax 初始化严格复现 Stage-II
  assignments。训练使用 BF16，独立 PPL evaluation 使用 FP16。FP16 训练在第 27
  层出现 finite loss 但非有限 logits gradient；BF16 完成 197/197 states，因此未
  用 gradient clipping 隐藏溢出。
- 失败实验一（local teacher）：按原 GSQ 局部形式，以已量化输入上的当前 dense
  layer 输出为 teacher，10/20/25/30 steps 的全 197-Linear PPL 分别为
  `2182.1132 / 1088.3114 / 1431.2202 / 660.9699`，均显著差于 Stage II。
  局部 hard MSE 改善没有转化为全模型传播稳定性。
- 失败实验二（dense-trajectory teacher）：student 使用量化 trajectory 输入，
  teacher 使用独立完整 dense trajectory 输出。三层 cumulative relative-L2 在
  40/50/75 steps 可降至约 `0.0947/0.0981/0.0922`，但全 197-Linear PPL 在
  30/40/50/75 steps 仍为 `657.1698 / 533.3217 / 496.9780 / 364.1463`。
  把 `lm_head` 回退为 Stage-II 量化状态后对应 PPL 为
  `549.1932 / 681.6835 / 546.3449 / 318.3907`；75 steps 有改善但仍说明问题不只
  在 head，Transformer 晚层 index 更新本身也有害。
- 根因定位：75-step run 的 layer-output MSE gate 会在晚层接受约 100–150 万个
  assignment changes/层，即使局部 MSE 下降，token CE 仍持续恶化。16-sequence
  WikiText2 只用于故障定位；正式选择完全改用 held-out C4 validation 的
  `32×2048 = 65504` token CE/NLL，避免在 WikiText2 test 上选择模型。
- 完整 prefix gate：对 `cutoff=0..28` 全部 29 个候选进行 C4 validation 扫描；
  cutoff 表示 layers `< cutoff` 使用 Stage-III hard states，其余 Transformer
  layers 与 `lm_head` 使用 Stage-II 量化 states。全 Stage II 为 C4 PPL
  `120.9528`，全 Stage III 为 `126.3318`；全局最优 cutoff 7 为 mean NLL
  `4.5802394`、PPL `97.5377`，次优 cutoff 14 为 `4.5818462/97.6946`。
- 正式 Stage-III 结果：由 C4 validation 选出的 cutoff 7 在完整 WikiText2 上
  PPL `164.8652575`、mean NLL `5.1051285`、eval tokens `298862`，相对 Stage-II
  all-197 PPL 降低 `20.3158%`（绝对下降 `42.0329`）。最终仍是 197/197 Linear
  全量化：前 7 层 49 个 Linear 使用 Stage-III refined assignments，后 21 层
  147 个 Linear 与量化 `lm_head` 使用 Stage-II assignments；所有 codebook 和
  scale 固定，没有 FP16 Linear 逃逸。所有 197 个最终状态与正式评估候选逐文件
  bitwise 一致。
- 结果目录：训练结果在
  `code/GSQ/experiments/results/diagnostics/stage3_formal/` 与
  `stage3_formal_dense/`；29 个 C4 prefix 结果在 `stage3_cutoff_debug/`；最终选择
  清单、197 states 和汇总在
  `code/GSQ/experiments/results/diagnostics/stage3_selected/s75_c4_prefix_gate/`。
- 结论：Stage III 在加入 held-out token-NLL 全局 hard-state gate 后通过效果门槛，
  证明 index-logit 训练在前 7 层提供真实收益，同时也证明仅以局部 layer MSE 接受
  所有晚层更新是不可信的。当前风险是 prefix gate 较粗，尚未证明任意 per-layer
  subset 或 task-aligned head training 会进一步改善；Stage IV 不应在 Stage-III
  该结果完成审计前启动。

## 2026-07-14：Qwen3-0.6B Stage-IV 固定 assignment 的全 Linear codepoint/scale 训练

- 目的：从已验证的 Stage-III hard state 严格初始化，固定 197 个 Linear 的离散
  assignments，只训练每个 Linear 的独立非均匀 codebook 与 row/block scales；
  Transformer 覆盖 28 层 attention+MLP 的 196 个 Linear，`lm_head` 独立训练，
  embedding 保持 FP。全程不使用 FP16 Linear protection、MLP-only、seed sweep 或
  WikiText2 test 选模。
- 实现与不变量：新增 assignment-fixed quantizer，codebook 由正负 gap logits 保持
  严格有序且恰有一个零锚点，signed source scale 以有界指数 offset 更新，因此符号
  不会翻转。197 个 Stage-III 状态的初始化最大绝对重建误差为
  `9.5367e-07`、最大 relative-L2 为 `1.6381e-07`；反向和 optimizer update 后只有
  codepoint gap logits 与 scale offsets 有梯度，assignments bitwise 不变。
- 三层诊断：默认 LR 下，10/20 steps 的完整 C4 PPL 为
  `97.5611/97.5558`，短训练反而略差于 Stage-III source `97.5377`；40/80 steps
  改善到 `97.4642/97.3405`。40-step 的 scale LR×2、codepoint LR×2、half LR
  分别为 `97.4703/97.4748/97.5054`。80-step + scale LR×2 的三层状态以完整
  C4 prefix gate 选择 cutoff 1，PPL `97.2923`；保留全部三层为 `97.3480`，只比
  80-step default 全三层略差，因此未盲目启动完整 28 层组合。
- 全 Transformer 筛选：所有候选均从相同 Stage-III state、固定 seed 0 和相同
  `128×2048` C4 train tokens 开始，并在完整 held-out
  `32×2048 = 65504` C4 validation tokens 上扫描 cutoff `0..28`。40-step
  default、codepoint LR×2、scale LR×2 的最佳 cutoff 均为 27，PPL 分别为
  `89.52898/89.43110/85.36527`；80-step default 的最佳 cutoff 27 为 mean NLL
  `4.4429062`、PPL `85.02167`，优于所有未训练 head 的 Transformer 候选。cutoff
  28 回升到 `85.57027`，因此 layer 27 保留 Stage-III source state。
- `lm_head` 筛选：在 80-step cutoff-27 Transformer trajectory 上并行比较
  20/40 steps × scale LR 1×/2×，codepoint LR 固定 `5e-5`、seed 固定 0。
  完整 C4 PPL 依次为 `84.82447`（20/default）、`84.60594`（20/scale×2）、
  `84.63395`（40/default）、`84.23211`（40/scale×2）；未训练 source head 为
  `85.02167`。最终选择 40 steps、scale LR `2e-4`、codepoint LR `5e-5`。
- 最终状态审计：物化目录包含 197/197 个量化 Linear，其中 189 个 Transformer
  state 来自 Stage IV（layers 0–26）、7 个 layer-27 state 来自 Stage-III source、
  1 个 `lm_head` 来自 Stage-IV head training。独立审计逐文件确认 assignments
  bitwise 固定、scale 符号固定、每个 codebook 恰有一个零码点且有限严格有序、
  scales 有限非零、indices 合法、所有权重重建有限；最终目录重新评估精确复现
  C4 mean NLL `4.4335762`、PPL `84.23211`。
- 正式结果：只在 C4 完成选择后，对最终状态运行一次完整 WikiText2。结果为 PPL
  `142.4697954`、mean NLL `4.9591300`、146 sequences、`298862` tokens；相对
  Stage III PPL `164.8652575` 降低 `13.5841%`，相对 Stage II all-197 PPL
  `206.8981753` 降低 `31.1401%`。197/197 Linear 全量化，无 FP16 Linear 逃逸。
- 结果目录：Transformer candidates 在
  `code/GSQ/experiments/results/diagnostics/stage4_formal_transformer/`，head candidates
  在 `stage4_head_candidates_s80/`，最终独立状态、C4/WikiText2 结果和逐状态审计在
  `code/GSQ/experiments/results/diagnostics/stage4_final/s80_cutoff27_h40_scale2x/`。
- 结论：Stage IV 通过。固定 Stage-III assignments 后训练 codepoints/scales 能在
  all-Linear W2 条件下进一步降低真实语言模型 NLL；但局部 layer/head MSE 不能
  直接作为接受标准，held-out token-NLL 的 Transformer prefix 与独立 head gate
  是避免晚层累计退化的必要组成。

## 2026-07-14：按原 GSQ 流程仅替换均匀码点的 codebook-GSQ（Qwen3-0.6B，W2/G32）

- 目的：撤销旧四阶段 STOM 口径，验证最小改造版 GSQ。量化范围与 repository GSQ
  默认范围一致，只量化 28 层 MLP 的 `gate_proj/up_proj/down_proj`；attention 与
  `lm_head` 保持浮点。均匀 control 与码本版本均使用 GPTQ 初始化，再沿同一 GSQ
  Gumbel-Softmax 路径训练权重到四个码点的概率/logits 与原 GSQ scale 参数。
- 关键约束：2 bit，`group_size=32`，固定 seed 0；每个量化 Linear 一个独立、固定的
  非均匀 scalar codebook；不强制包含精确零码点；不做 seed sweep；C4 校准
  `128` 条、validation `32` 条、长度 `2048`。本轮 GSQ 为两边完全相同的一轮
  small-model schedule，用于受控首轮比较，尚不是 repository 正式配置的十轮长训练。
- FP baseline 可信性：同一 Qwen3-0.6B、WikiText2、长度 2048 上，项目 wrapper PPL
  `20.9598158`，独立 Hugging Face evaluator PPL `20.9605938`，差值约 `0.00078`。
- 正式 MLP-only 结果：uniform GPTQ PPL `39.6571172`；codebook GPTQ
  `67.1621556`；uniform GSQ `96.7383625`；codebook GSQ `70.4741631`。
  codebook GPTQ 相对 uniform GPTQ 恶化 `69.357%`；uniform GSQ 相对其 GPTQ
  初始化恶化 `143.937%`；codebook GSQ 相对其 GPTQ 初始化恶化 `4.931%`；
  codebook GSQ 比 uniform GSQ 低 `27.150%`，但仍明显差于 uniform GPTQ。
- checkpoint 审计：codebook GPTQ/GSQ 均恰有 `84=28×3` 个量化状态；全部
  `group_size=32`、码本有限且严格有序、assignment 合法、scale 和重建权重有限；
  84 个码本均没有精确零码点；没有 attention 或 `lm_head` 量化状态。
- 权重误差诊断：uniform/codebook GPTQ 的全局 weight relative-L2 分别为
  `0.415781/0.440073`。codebook GPTQ 的主要异常之一是
  `model.layers.2.mlp.down_proj`：weight relative-L2 从 uniform 的 `0.387761`
  放大到 `1.666726`，activation-weighted projection output relative-L2 从
  `0.017588` 放大到 `0.207595`，局部 MLP output relative-L2 从 `0.073925`
  放大到 `0.220851`。这证明码本 GPTQ 的 PPL 劣化不是 evaluator 或保存格式假象。
- GSQ 漂移诊断：uniform GSQ 的全局 weight relative-L2 升至 `0.455537`，与其
  PPL 大幅恶化同方向；codebook GSQ 仅升至 `0.441234`，但一轮训练仍改变
  `30.713%` assignments，scale 相对初始状态的 relative-L2 为 `0.970658`，最终
  PPL 小幅恶化。当前 GSQ 的局部层输出训练目标没有保证最终语言模型 NLL 改善。
- all-Transformer 旧诊断仅保留作故障证据，不作为本方法结论：在 attention+MLP
  全量化、FP `lm_head` 的不同 target scope 下，uniform/codebook GPTQ PPL 为
  `166.523/417.682`，uniform/codebook GSQ 为 `115395.241/2782.746`。其离谱数值
  主要说明 attention 全量化与 GSQ 累积漂移非常敏感，不能与当前 MLP-only 主实验混用。
- 结论：当前“只替换码点”的实现与保存状态符合需求，但首轮结果不支持“码本 GPTQ
  优于均匀 GPTQ”，也不支持“GSQ 训练必然改善 GPTQ 初始化”。现阶段唯一正向证据是
  codebook GSQ 比同训练预算的 uniform GSQ 稳定；下一步应先修复
  `layer 2 down_proj` 的码本/GPTQ 初始化，再在不改变 GSQ 其余流程的前提下运行
  完整十轮正式配置。汇总 JSON：
  `code/GSQ/experiments/results/formal/codebook_gsq_g32_original_scope/summary.json`。

## 2026-07-14：真实 Qwen3-4B-Instruct-2507 的 codebook-GSQ 跨模型复现

- 目的：检验 0.6B 上“码本 GPTQ 被敏感层拖垮、码本 GSQ 比均匀 GSQ 稳定但仍输给
  均匀 GPTQ”的现象是否为小模型特例。
- 模型身份：拒绝使用 mislabeled `/data01/datasets/Qwen3-4B`（实际为 0.6B 配置）；
  使用真实 36 层、hidden size 2560 的 `/data01/datasets/Qwen3-4B-Instruct-2507`。
- 口径：W2/G32、seed 0、C4 `128/32×2048`、MLP-only、FP attention/head、
  无强制零码点，与 0.6B 完全一致。
- FP evaluator：修复 tied `lm_head` 物化后，wrapper/HF PPL 为
  `10.0543831/10.0545882`，差值 `0.0002051`。
- 正式结果：uniform GPTQ `15.0761967`、codebook GPTQ `22.2337706`、uniform GSQ
  `30.6395092`、codebook GSQ `25.2424010`。码本 GPTQ 比均匀 GPTQ 差 `47.476%`；
  均匀/码本 GSQ 分别比各自 GPTQ 初始化差 `103.231%/13.532%`；码本 GSQ 比均匀
  GSQ 好 `17.615%`，但仍输给均匀 GPTQ。
- 状态审计：codebook GPTQ/GSQ 均有 `108=36×3` 个状态，全部 G32、MLP-only、
  有限严格有序、无精确零码点、无 attention/`lm_head` 量化状态。
- 敏感层：`layers 6/16/1 down_proj` 的码本相对 MSE 分别是均匀 GPTQ 的
  `18.09×/7.11×/5.74×`。layer 6 projection output relative-L2 从 `0.0191`
  放大到 `0.3967`。
- 因果消融：codebook GPTQ PPL `22.2338`；恢复 FP layer 6 后为 `16.7638`，追回
  `76.42%` 差距；恢复 FP layers 1/6/16 后为 `15.8183`，追回 `89.63%` 差距。
- GSQ 漂移：codebook GSQ 改变 `32.19%` assignments，scale relative-L2 drift
  `0.9784`，与 0.6B 现象一致。
- 结论：敏感层主导的码本 GPTQ 失败以及 GSQ 大幅离散漂移均跨模型复现。汇总：
  `code/GSQ/experiments/results/formal/codebook_gsq_g32_qwen3_4b_instruct/summary.json`。

## 2026-07-15：归档非官方对齐结果并重启 Qwen3-4B Uniform GSQ 官方复现（进行中）

- 归档：将此前约 `1.1 TB` 的全部 checkpoint、formal/smoke/diagnostic 结果、日志、
  STOM/codebook 配置、旧运行脚本和三份日期结论文档移动到
  `code/GSQ/experiments/smoke/20260715_000253_non_official_alignment/`。旧结果保留但
  不再作为 GSQ 官方复现证据；新的 `experiments/results/` 和 `logs/` 从空目录开始。
- 上游基准：固定官方仓库 commit
  `03fc16484c369e3127225615d5e03e8d3a6043e3`，保留零差异 worktree
  `code/GSQ_official_20260715_000253/`；另建最小修复 worktree
  `code/GSQ_official_repaired_20260715_000253/`。最小修复只处理 Qwen3
  `position_embeddings`、tied `lm_head`、xh2 的 compressed-tensors 0.11
  pack/unpack、2-bit packing metadata，以及官方 GPTQ-only 路径不能保存完整初始化的
  control bug；启用 GSQ 时的 quantizer、loss、Lion、q/k 2000-step 和 staged training
  数学保持官方实现。
- FP evaluator：修复后的官方 wrapper 在真实 Qwen3-4B-Instruct-2507、WikiText2、
  length 2048 上得到 PPL `10.0543831204`，与此前独立 HF evaluator 对齐。
- 一层兼容 smoke：W2/G128、C4 `8/4×512`、seed 0。GPTQ 与 GSQ 均完成每 block
  `q/k/v/o/gate/up/down` 七个 Linear 的保存、重载和 activation propagation；结构审计
  确认 7/7 packed states、G128、FP `lm_head`、q_norm/k_norm 完整。
- 关键局部结果：恢复官方 temperature `2→0.05` 和 logit multiplier `100→500` 后，
  q_proj Hessian loss 从 GPTQ `181` 降至 GSQ `140`，k_proj 从 `50.75` 降至 `39`。
  这与旧 `1→20` 配置下 q/k loss 约翻倍形成直接反证，确认旧 Gumbel schedule 是主要
  配置错误。一轮、两 optimizer-step 的 smoke prefix PPL 为 GPTQ `10.3046608`、GSQ
  `10.3912448`；因 v/o 和 MLP 远未达到正式 20-epoch 预算，该 PPL 只作管线证据。
- 正式配置：FineWeb-Edu `4096×4096`、validation 128、GPTQ samples 512、batch 64、
  device microbatch 2、20 epochs、W2/G128、temperature `2→0.05`、logit multiplier
  `100→500`、Lion、lr `1e-4/5e-5`、percdamp `0.1`，量化全部七个 block Linear，
  `lm_head` FP，不做 seed sweep。
- 正式运行：按“使用全部 GPU”的最新要求，未进入量化阶段的单卡启动已安全终止并
  归档。当前 GPU4–5 运行 matched Uniform GPTQ `20260715-003332_6c4e87`，GPU6–7
  运行 Uniform GSQ `20260715-003332_18a805`；两路均为 2-rank data parallel，保持
  global batch 64、GPTQ 512-sample Hessian 汇总和 GSQ 跨 rank 梯度平均。结果根目录
  `code/GSQ/experiments/results/20260715_003303_qwen3_4b_official_uniform_2x2gpu/`。
  当前状态为 FineWeb-Edu streaming/tokenization，尚未形成最终 PPL 结论。

## 2026-07-16 02:18:35 CST：Qwen3-0.6B NoWag-d1 实现门禁与 FP baseline 交叉验证

- 目的：按照 `docs/20260716_011801_nowag_d1_trainable_group_scale_gsq_design.md`
  重启 0.6B 实验前，先验证 `absmax`、NoWag 列→行归一化、Hessian-aware K=4
  scalar codebook、非均匀 checkpoint 和 GSQ hard-state 回退是否闭环，并重新确认
  baseline evaluator 可信。
- 失败实验 `ENV0`：使用 `xhquant` Python 启动时在模型加载前因缺少仓库既有依赖
  `lion_pytorch` 失败。未修改依赖或优化器；切换到已有可运行的 `xh2` 环境并通过
  `compat/wandb` 屏蔽该环境损坏的 WandB 安装。
- 纯数值门禁：随机 Linear 的 normalize→denormalize 最大绝对误差
  `2.3841858e-7`；所有 group scale 有限且严格为正；group-normalized 绝对值上界
  `1.0`；四码点严格有序；assignment 范围 `[0,3]`；assignment logits 与
  log-scale 梯度均有限。
- I1 一层初始化 smoke：Qwen3-0.6B layer 0、C4 `8×128`、W2/G32、seed 0、
  original-objective-corrected Hessian 权重、固定 absmax scale。完整处理并保存
  `q/k/v/o/gate/up/down` 七个 Linear；checkpoint 重载后由
  `assignment × codebook × scale × row_norm × col_norm` 重建的 BF16 hard weight
  与保存权重逐元素完全一致；`q_norm/k_norm` 保持浮点，`lm_head` 未量化。
- G3 一层训练 smoke：同一小配置、可训练 log-ratio group scale 与 trust region。
  q_proj full-Hessian objective 从初始化 `3396.9871` 到短训练 `3397.6047`，k_proj
  从 `1977.9937` 到 `1978.2969`，均略微恶化；新增 hard-state acceptance 后两者
  均正确回退。attention/MLP validation hard MSE 也没有改善，分别保留初始化
  `0.00579834/0.01412964`。这证明不能用 soft loss 或最后一步无条件覆盖初始化。
- FP baseline：修复后的 layerwise wrapper 在 WikiText2、length 2048、298,862 tokens
  上得到 PPL `20.95981575324319`；独立 Transformers 全模型前向得到完全相同的
  `20.95981575324319`，绝对差为 `0.0`。因此后续离谱 PPL 不能归因于该 evaluator。
- 当前结论：实现已通过数值、七 Linear、序列化/重载和一层 GSQ 控制流门禁；完整的
  matched 初始化、单 block、2/4/8-block prefix 以及 28 层正式矩阵仍待运行，当前不能
  宣称 NoWag-d1 GSQ 超过 Uniform GSQ。结构化结果：
  `experiments/results/20260716_021835_qwen3_06b_nowag_d1_debug_baseline.json`。

## 2026-07-16 02:46:34 CST：NoWag-d1 初始化、单 block、group size 与 8-block prefix 门禁

- 相同 Hessian/校准输入的初始化诊断（Qwen3-0.6B、C4 `32×512`、seed 0）显示：
  G32 下 I1 absmax 虽把 layer-0 diagonal-Hessian 总目标从 Uniform 的 `221,661`
  降到 `175,860`，full-Hessian 却从 `60,319` 升到 `194,717`，block relative-L2
  从 `0.3205` 升到 `0.4628`。这证明仅看 diagonal objective 会误判。I3
  codebook-aware GPTQ 把 full-Hessian 拉回 `68,883`，但仍比 Uniform 高 `14.2%`。
- group size 初始化趋势：I3 相对 Uniform 的 layer-0 full-Hessian 在 G32/G64/G128
  分别为 `68,883/60,319`、`72,326/68,714`、`74,447/74,953`。只有 G128 开始
  略优；固定 absmax I1 在三个 group size 均明显失败。
- 20-epoch G32 单 block WikiText2 PPL：G0 Uniform `22.2970`；G1 fixed scale
  `22.4035`；G2 unconstrained scale `22.5122`；G3 trust-region scale `22.6797`；
  G4 trainable codebook `22.4950`；G5 trainable norms `22.7477`；I3+G3
  `22.3199`。可训练 scale/codebook/norm 本身都未超过 Uniform；I3 full-Hessian
  refinement 是最有贡献的步骤。
- G32 prefix PPL（2/4/8 blocks）：Uniform 为 `23.1280/25.1354/28.7153`；
  I3+G3 为 `23.0771/26.7895/31.2474`。NoWag 在 2 blocks 短暂领先，但 4/8
  blocks 分别落后约 `6.58%/8.82%`，因此按设计门禁拒绝 G32 完整模型长跑。
  G1 为 `23.3035/28.0004/32.1581`，G3 为 `23.5357/28.1953/32.6787`，也失败。
- matched 单 block group-size PPL：G32 Uniform/I3+G3 `22.2970/22.3199`；G64
  `22.5427/22.6884`；G128 `25.4332/23.3354`。G128 是首个明确胜出，NoWag
  降低 PPL 约 `8.25%`，且 attention/MLP hard validation MSE 同时更低；正在继续
  G128 的 2/4/8-block prefix。
- checkpoint 审计：G32 四条 8-block 路径均完整包含 `56=8×7` 个量化 Linear；
  NoWag hard weight 可由 assignments/codebook/scale/row_norm/col_norm 逐元素精确重建；
  logical effective bpp `2.522945`，`q_norm/k_norm/lm_head` 保持浮点。
- 诊断脚本第一次把 BF16 cross-entropy 先整批求和，导致 I0/I3 NLL 粗粒度相同；
  该结果保留但标记为 superseded，修复为 FP32 logits 求 NLL 后所有结论使用
  `20260716_022500...fp32nll.json`。
- 结构化阶段汇总：
  `experiments/results/20260716_024634_qwen3_06b_nowag_d1_interim_gates.json`。

## 2026-07-16 10:38:26 CST：Qwen3-0.6B NoWag-d1 G128 正式完整实验与最终审计

- 目的：完成 `docs/20260716_011801_nowag_d1_trainable_group_scale_gsq_design.md`
  的剩余 G128 prefix、初始化、完整 GSQ 和 checkpoint/effective-bpp 验收；固定 seed 0，
  不做 seed sweep。每个 Transformer block 的 `q/k/v/o/gate/up/down` 七个 Linear 全量化，
  共 `28×7=196` 个；`q_norm/k_norm/lm_head` 保持浮点。
- G128 initialization-only prefix PPL（2/4/8 blocks）：I0 Uniform GPTQ
  `25.2986/32.1015/44.0512`；I1 absmax `47.0683/131.7722/804.4880`；I2
  weighted-LS `36.0930/69.7742/228.6558`；I3 codebook-aware GPTQ
  `25.0765/32.7496/43.4937`。I1/I2 随深度灾难性退化，正式否决；I3 是唯一可用
  NoWag 初始化。
- 设计指定的历史敏感 `model.layers.2.mlp.down_proj` 已与 layer-0 七个 Linear 同时完成
  初始化诊断。G32 下 Uniform/I3 full-Hessian 为 `45,556/72,045`、output relative-L2
  为 `0.02264/0.02745`，I3 仍失败；G128 下变为 `443,633/91,808` 和
  `0.06861/0.03098`，I3 分别改善约 `79.31%/54.85%`，与 group-size 门禁结论一致。
- G128 GSQ prefix PPL（2/4/8 blocks）：Uniform G0
  `26.3754/30.0294/36.7265`；G1 fixed `25.5722/34.2303/41.8900`；G3 trust
  `25.0012/32.3842/39.6336`；I3+G3 `24.6133/29.4037/34.9051`。只有 I3+G3
  在三个深度都保持优势，证明 codebook-aware GPTQ 与受约束 scale GSQ 的组合不可省略。
- 较小完整实验（C4 `128×512`、20 epochs）：I0/I3 initialization-only PPL
  `239.9812/201.3211`，I3 改善 `16.1097%`；G0/I3+G3 PPL
  `124.8860/122.2070`，NoWag 改善 `2.1451%`。四份 checkpoint 均为 196 Linear。
- 正式 initialization-only（FineWeb-Edu `4096×4096` train、128 validation、512 GPTQ
  samples）：I0 PPL `535.9263`、I3 PPL `321.3261`，相对改善 `40.0428%`；两者
  绝对 PPL 仍高，只支持 matched 相对比较，说明 one-shot 初始化的跨数据迁移较差。
- 正式 GSQ：Uniform G0 与 NoWag I3+G3 均使用 FineWeb-Edu 大校准、20 epochs、W2/G128、
  temperature `2→0.05`、logit multiplier `100→500`。完整 WikiText2 298,862-token PPL
  分别为 `53.3462296229` 和 `52.4976027974`；NoWag 绝对下降 `0.8486268`，相对改善
  **`1.5907906%`**。两组在不同 GPU 独立重复读取后逐位复现相同数字；FP baseline
  再次为 `20.9598157532`。
- 正式 checkpoint 审计：Uniform 196 个 packed Linear 全部可有限解包并逐元素精确
  repack，logical effective bpp `2.125`；NoWag 196 个 hard weight 全部可由 2-bit
  assignment、正 scale、有序 codebook、row/column norms 精确重建，logical effective
  bpp `2.147945`。两者都保留 28 个 q_norm 和 28 个 k_norm，`lm_head` 未量化。
- NoWag 状态统计：`440,401,920` 个 assignments 的四码点占用率为
  `15.723%/33.917%/34.477%/15.884%`；196 个 codebook 全部严格有序且没有精确零码点；
  scale ratio 范围 `[0.982161,1.018163]`、均值 `1.000438`，trust-region 饱和率为 0；
  q/k 56 个 independent hard state 和 attention/MLP 56 个 stage hard state 全部接受。
- 最终结论：不支持 group-size-independent 的 NoWag 优势。G32/G64 失败；G128 成功方法
  必须是 `NoWag-d1 codebook + codebook-aware GPTQ + constrained trainable-scale GSQ`。
  absmax 是必要的正 scale 初值，但 I1 absmax-only 不足以获得好结果；I2、G2、G4、G5
  也均失败。正式改善为约 `1.59% PPL`，代价为约 `0.02295 bpp` 逻辑开销。
- 完整报告：`docs/20260716_103826_qwen3_06b_nowag_d1_g128_full_experiment_summary.md`；
  结构化结果：
  `experiments/results/20260716_103826_qwen3_06b_nowag_d1_g128_full_experiment_summary.json`。
  最终逐项完成审计：
  `experiments/results/20260716_104554_qwen3_06b_nowag_d1_completion_audit.log`。

## 2026-07-18 00:10:04 CST：Qwen3-0.6B 原始 NoWag-d6 → Vector-GPTQ → Vector-GSQ 完整消融

- 目的：按原始 NoWag 配置验证真正的 d=6 vector quantization 初始化是否可用于 GSQ：
  column-L2→row-L2 normalization、每六个连续权重一个 vector、W2、每 Linear
  `K=4096` codebook、`n_inits=1`、Lloyd 100 iterations、不做 zero centering；之后依次
  运行 full-Hessian vector-codebook-aware GPTQ 和只训练局部候选 assignment probability
  的 Vector-GSQ。固定 seed 0，不做 seed sweep；量化 28 个 block 的全部
  `q/k/v/o/gate/up/down`，共 196 Linear，`q_norm/k_norm/lm_head` 保持浮点。
- 梯度与单 block 门禁：layer-0 单 Linear 的原 schedule 改变约 14%–16% vector
  assignments，hard-output MSE 下降约 52%–72%；训练末期约 99.3% 概率超过 0.99、
  99.2%–99.4% logits 梯度低于 `1e-12`，说明梯度在完成有效搜索后才因 hardening 冻结。
  七 Linear 联合、无 GPTQ 的 top-4/8/16 block MSE 分别降低 79.55%/91.60%/95.82%。
  加入 Vector-GPTQ 的八组 block 消融全部成功：GPTQ 相对 NoWag 降低约 52% block MSE，
  GSQ 再降低 91.5%–98.6%；单 block 局部最优为 original top-16、LR `2e-4`。
- 失败实验：第一版 detached launcher 的子进程随短生命周期父 shell 被清理，产生零字节
  log；后续改为持久父进程持有并 `wait`。prefix 冒烟先因本项目与 NoWag 同名顶层 `src`
  包冲突而无法导入 `src.quantize_compress`，修复为独立模块名加载 WikiText2 evaluator。
  `seqlen=128,batch=1` 的 PPL 冒烟会生成 2336 batches，被主动中止并改为标准
  `2048×8`。checkpoint audit 又因 PyTorch 2.8 不支持 CPU `uint16 torch.unique` 失败，
  审计时转 `long` 后通过，部署 assignment 仍保存为 `uint16`。
- 失败消融：固定随机流后的单条 `1×128` GSQ prefix 即使将局部 block MSE 降低约
  96%–98%，2/4/8-block PPL 仍全部差于 GPTQ；GPTQ 为
  `23.6134/25.1446/28.3638`，original top-16 LR `1e-4` 为
  `24.6682/26.6054/31.5138`。根因是单短序列局部 MSE 过拟合，而不是 d=6 梯度从一开始
  无法传播。NoWag 初始化随机流按 `(layer,Linear)` 隔离，GSQ Gumbel 使用独立随机流，
  消除了不同 stage 消耗 RNG 后改变后续 k-means 初始化的混杂。
- 多序列 8-block 门禁：FineWeb-Edu train `128×512`、validation `16×512`、GPTQ/Hessian
  `32×512`、20 个等效 epoch。NoWag/GPTQ 的 8-block PPL 为 `30.0408/26.6416`；
  original top-4/8/16-LR1e-4/16-LR2e-4/32 的 PPL 为
  `24.1075/24.1619/24.8887/23.8846/23.8518`，gentle top-16 为 `25.4010`。
  多序列训练和独立 validation hard-state 选择使所有 original GSQ 路径稳定超过 GPTQ。
- 小校准 28-layer：同 `128/16/32×512` 数据口径。NoWag-only `73.1816`、GPTQ
  `53.0078`、gentle `50.0604`、original top-4 `42.3900`、top-8 `40.9997`、
  top-16 LR1e-4 `38.8029`、top-16 LR2e-4 **`38.2705`**、top-32 `41.0299`。
  196/196 Linear 全覆盖，所有 checkpoint 可精确重建。
- 正式 FineWeb-Edu 大校准：train `4096×4096`、validation `128×4096`、GPTQ/Hessian
  `512×4096`、global batch 64、microbatch 4、20 epochs、temperature `2→0.05`、kappa
  `100→500`、percdamp 0.1。八卡八路持续运行约 18.4–20.4 小时，按整 20 分钟窗口轮询。
  正式 PPL：NoWag-only `71.2682114`、Vector-GPTQ `57.2913742`、gentle top-16
  `35.8620720`、original top-4 `34.4086723`、top-8 `35.3599777`、top-16 LR1e-4
  `33.6500511`、top-16 LR2e-4 `31.9483757`、top-32 LR1e-4
  **`31.2941494`**。Vector-GPTQ 相对 NoWag 改善 `19.6116%`；最佳 GSQ 相对 GPTQ
  再改善 `45.3772%`，相对 NoWag 改善 `56.0896%`。original schedule 的所有配置
  28/28 层 GSQ 均被 validation 接受；正式 full-Hessian 数据下 GPTQ 196/196 Linear
  全部接受，包括历史敏感的 layer-2 `mlp.down_proj`。
- 正式 checkpoint 审计：八份 checkpoint 均为 28 layers×7 Linear=196 states，fresh
  logical reconstruction 与应用 BF16 weight 逐元素一致；八份在新模型进程中独立重载
  PPL，与首次结果的绝对差全部为 `0`；56 个 `q_norm/k_norm` 保持浮点，`lm_head` 未量化。
  最佳 top-32 有 `73,515,008` 个 d=6 assignments；每 Linear 使用 codewords 数量
  min/mean/median/max 为 `4090/4095.485/4096/4096`，平均 occupancy `99.9874%`，无
  codebook collapse。平均 assignment switch `38.9178%`，validation hard MSE 平均降低
  `55.5518%`；最优 state 平均在 epoch `18.96/20`，末步平均 99.24% 概率大于 0.99、
  99.04% 梯度小于 `1e-12`。
- logical effective bpp：12-bit vector IDs 含 padding `2.003125` bpp，FP16
  `4096×6` per-Linear codebooks `0.175` bpp，FP16 row/column norms `0.0229167` bpp，
  合计 **`2.2010417` bpp**，逻辑大小 `121,167,872` bytes。训练期 local candidates/logits
  不进入部署 bpp。该 bpp 高于参考 Uniform G128 的 2.125 和 NoWag-d1 G128 的 2.147945，
  因此当前强结果不能表述为严格 equal-bpp 对比。
- 结论：原始 NoWag d=6 初始化、Vector-GPTQ、multi-sequence validation-selected
  Vector-GSQ 三阶段均有明确贡献；d=6 的 GSQ 梯度不是根本障碍，训练数据覆盖和 hard
  validation selection 才是避免局部 MSE 过拟合的关键。正式 top-32 在当前固定 seed 0
  的 Qwen3-0.6B 上达到 PPL `31.2941`，是值得继续做等 bpp 与跨模型验证的主方法候选。
  完整报告：`docs/20260718_001004_qwen3_06b_nowag_d6_vector_gptq_vector_gsq_full_ablation_report.md`；
  结构化汇总：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260718_001004_qwen3_06b_nowag_d6_full_experiment_summary.json`。
# 2026-07-18 01:50:40 — d=2/d=3 独立分段 Vector-GSQ 1-layer smoke

- 目的：验证新增的“在 embedding 前把长 token 行切成独立短段”数据路径，及
  NoWag d=2/K=16、d=3/K=64 → Vector-GPTQ → local top-4 Vector-GSQ 的完整闭环。
- 模型与范围：Qwen3-0.6B，layer 0 的全部七个 Linear；固定 seed 0；
  `q_norm`、`k_norm`、`lm_head` 不量化。
- 数据与参数：4×512 training rows 切为 16×128；2×512 validation rows 切为
  8×128；2×128 GPTQ；2 GSQ steps；Lloyd 2 iterations。该配置仅为代码 smoke，
  不用于质量结论。
- d=2 结果：完成，`12.556 s`，逻辑 `2.0231445 bpp`，峰值显存
  `3.087 GB`，所有 checkpoint Linear 重构 `max_abs=0`。
- d=3 结果：完成，`10.487 s`，逻辑 `2.0270182 bpp`，峰值显存
  `2.750 GB`，所有 checkpoint Linear 重构 `max_abs=0`。
- 结论：分段发生在 embedding/dense-target 之前，数据形状和 checkpoint 路径正确；
  d=2/d=3 均可进入多层性能与 PPL 门控。2-step 下 validation 未接受 GSQ 属于预期，
  不能据此判断算法质量。
- 结果文件：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260718_015040_smoke_d2_seg128_k4.json`
  和
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260718_015040_smoke_d3_seg128_k4.json`。

## 2026-07-18 03:28:00 — d=2/d=3 快速 Vector-GSQ 第一轮 8-block 门控

- 目的：在 2–3 小时完整训练预算下比较 d=2/d=3、local top-k、训练步数、
  Hessian 样本数与 microbatch 吞吐，并保留 d=6 同预算控制。
- 公共设置：Qwen3-0.6B，前 8 blocks 的全部 56 个 Linear，seed 0；训练源
  4096×4096 在 embedding 前切成 16384×1024，验证源 128×4096 切成
  512×1024；默认 GPTQ/Hessian 为 256×4096；`q_norm/k_norm/lm_head` 浮点。
- GPTQ-only：d=2 为 `54.7159 PPL / 235.3 s / 2.02314 bpp`；d=3 为
  `42.4045 PPL / 218.6 s / 2.02702 bpp`。d=2 初始化质量明显更差。
- d=3、mb4：top-4/128 steps 为 `27.7263 PPL / 4130.2 s`；top-4/256
  为 `25.6129 / 5108.3 s`；top-8/256 为 `24.9438 / 5143.3 s`；
  top-4/512 为 `24.8129 / 5408.5 s`。top-8/256 与 top-4/512 质量接近，
  额外 steps 的收益已显著递减。
- d=6 控制：top-4/256 为 `24.0207 PPL / 5276.9 s`。d=3/top-8 仅高
  `0.9231` PPL，证明 d=3 保留了大部分 d=6 的短预算质量。
- Hessian 消融：d=3/top-4/256、512×4096 Hessian 得到 `26.9701 PPL`，
  反而差于 256 Hessian 的 `25.6129`；本轮不把更大 Hessian 作为快速主配置。
- 吞吐消融：d=3/top-4/256 的 mb16 为 `26.5097 PPL / 2963.2 s`，mb32
  为 `26.1282 / 2353.0 s`。mb32 将 8-block 时间降到 39.2 分钟，按 layer
  时间外推完整 28 层约 1.8–2.0 小时，但相对 mb4 损失约 0.52 PPL。
- 失败门控：d=2/top-4/256 首层用时 `386.6 s`，慢于 d=3，且 GPTQ PPL
  已显著更差，因此在第一层后主动终止（exit 143），不再浪费完整门控计算。
- 结论：d=2 同时被速度和质量否决；d=3 是明确主线。下一轮使用 mb32/64、
  top-8/16 和 256–512 steps 搜索 3 小时预算内的质量恢复点。
- 结果前缀：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260718_015400_gate8_*`、
  `20260718_020100_gate8_d3_k4_s512`、`20260718_020400_gate8_d3_k4_s256_h512`、
  `20260718_021500_gate8_d3_k4_s256_mb16`、
  `20260718_021800_gate8_d3_k4_s256_mb32`。

## 2026-07-18 16:30:00 — d=3 大 Microbatch 吞吐/质量第二轮 8-block 门控

- 目的：在用户明确“质量优先、2–3 小时为软预算”后，验证 mb32/64 是否能通过
  更宽 local candidate 和更多 steps 追回 mb4 的质量，不以时间硬阈值淘汰配置。
- 公共设置与第一轮相同：Qwen3-0.6B、前 8 blocks 全部七 Linear、seed 0、
  4096×4096 training rows 切为 16384×1024、128×4096 validation rows 切为
  512×1024、256×4096 Hessian、d=3/K=64。
- 256-step：top-4/mb64 `26.5755 PPL / 1484.5 s`；top-8/mb64
  `25.6489 / 1499.2 s`；top-8/mb32 `25.4250 / 1561.8 s`；top-16/mb32
  `25.2847 / 1586.1 s`。加宽候选可明显补偿大 microbatch 的 Gumbel 路径变化。
- 384-step：top-4/mb32 `25.9459 PPL / 1755.4 s`；top-8/mb32
  `25.1828 / 1809.0 s`。top-8/384 是本轮成功配置中的最佳 PPL，且相对慢速
  d=3/top-8/256/mb4 的 `24.9438` 仅差 `0.2391`。
- 512-step：top-8/mb64 `25.3694 PPL / 1901.4 s`，没有超过 top-8/384/mb32；
  说明 steps 不是唯一变量，microbatch 对每步 Gumbel sample 数和优化轨迹有影响。
- 失败：top-4/512/mb64 在完成 3 blocks 后，物理 GPU 6 被外部进程占用约
  63.7 GiB，depth-4 WikiText2 评测申请 4.63 GiB 时 OOM；有效 depth-2 PPL
  为 `22.3943`。失败属于外部显存竞争，不作算法否决，且未中断外部进程。
- 吞吐：256-step mb64 首层约 `164 s`，GPU 利用率约 52%；384-step mb32
  平均约 `166–172 s/layer`。因此完整 28 层可在明显多于 256 steps 的情况下
  仍保持数小时级，而不需要为时间强制少训。
- 结论：第三轮应重点比较 top-16/top-32 与 384/768/1024 steps；最终交付快速档
  和最佳质量档两条 Pareto 配置。
- 结果前缀：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260718_033000_gate8_*`。

## 2026-07-19 15:42:00 CST：Qwen3-0.6B NoWag-d3 快速 Vector-GSQ 正式实验与早层边界消融

- 目的：把原始 NoWag-d6/K4096 Vector-GSQ 的约 `20.415 h` 正式训练降到约
  2–3 小时，同时尽量保留质量。时间是软约束，不通过减少到明显不足的 steps
  强行达标。固定 seed 0，不做 seed sweep。
- 公共方法：Qwen3-0.6B；NoWag 双轴归一化；d=3、K=64、W2；Vector-GPTQ
  初始化；local-candidate Vector-GSQ。量化 28 个 block 的全部
  `q/k/v/o/gate/up/down`，共 196 个 Linear；56 个 `q_norm/k_norm` 和 `lm_head`
  保持浮点。逻辑 bpp 均为 `2.0270182292`。
- 数据：FineWeb-Edu token cache。训练源 `4096×4096` 在 embedding 前拆为
  `16384×1024` 独立序列；validation 源 `128×4096` 拆为 `512×1024`；
  GPTQ/Hessian 使用 `256×4096`。global batch 64、microbatch 32。WikiText2
  PPL 使用 `seqlen=2048`、batch 1。
- d=2 门禁失败：GPTQ-only 8-block PPL `54.7159`，显著差于 d=3 的
  `42.4045`；d=2 GSQ 首层也更慢，因质量与速度双重失败而停止。
- 统一策略正式结果：top-8/768 steps 为 `46.2712822 PPL / 2.49685 h`，作为
  快速档；top-16/1024 为 `39.1902122 / 3.07189 h`；top-8/1536 为
  `39.8674507 / 3.50123 h`。更多 steps 不自动带来更好完整模型 PPL。
- 早层混合策略：前 N 层用 top-8/1536，其余层用 top-16/1024。完整边界结果为：
  N=0 `39.1902122 / 3.07189 h`；N=2 `40.0297775 / 2.70268 h`；
  N=4 **`38.7451744 / 2.70598 h`**；N=6 `41.6608582 / 2.82207 h`；
  N=8 `40.7957878 / 2.73575 h`；N=12 `39.2158852 / 2.90788 h`。
  曲线强非单调，只有 N=4 明确改善；不能把 early 层数或 steps 当作单调旋钮。
- 最佳 d=3 配置：layers 0–3 使用 top-8/1536，layers 4–27 使用
  top-16/1024。相对统一 top-16/1024 的 PPL 降低 `1.1356%`；相对 Uniform
  GSQ G128 的 `53.3462` 降低 `27.3704%`；相对 NoWag-d1 GSQ 的
  `52.4976` 降低 `26.1963%`。相对 d=6 最佳 `31.2941` 仍高 `23.8096%`，
  但训练加速 `7.5444×`，且 bpp 从 `2.2010417` 降至 `2.0270182`。
- checkpoint 审计：所有正式统一策略与 N=2/4/6/8/12 混合策略均在新模型进程
  独立重载，PPL 与原始结果逐位一致；每份均为 28 层、196 Linear；assignment
  范围 `[0,63]`，每个 Linear 使用全部 64 个码字；fresh reconstruction 全部精确；
  56 个 q/k norm 保持浮点，`lm_head` 不在逻辑 checkpoint 中；28/28 GSQ layer
  和 196/196 Vector-GPTQ refinement 均被接受。
- 结论：d=3/K64 + 1024-token 独立分段解决了主要吞吐瓶颈，并在约 2.71 小时内
  达到 `38.7452` PPL。它没有超过质量优先的 d=6/K4096，但形成了更低 bpp、
  7.54 倍更快的实用 Pareto 点。最佳策略不是全层统一长训练，而是只加强前 4 层。
- 结构化完成审计：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260719_154200_qwen3_06b_nowag_d3_fast_quality_completion_summary.json`。
- 最终报告：
  `report/20260719_154200_qwen3_06b_nowag_d3_fast_quality_report.md`。

## 2026-07-20 16:35:00 CST：Qwen3-0.6B d=3/d=6 Vector-GSQ 六任务零样本评测

- 目的：补齐 Qwen3-0.6B Vector-GSQ 仅有 WikiText2 PPL、没有标准零样本准确率的
  实验证据，并在同一远端环境中严格配对评测 d=3 和 d=6 checkpoint。
- 执行与归档：本地代码、Qwen3-0.6B、checkpoint 和六任务数据缓存同步到
  `10.30.0.14`；两张 RTX A6000 分别执行 d=3/d=6；30 分钟队列轮询后，原始
  lm-eval JSON、汇总 JSON、日志、GPU 历史和队列状态全部拉回本地。
- 评测配置：lm-eval 0.4.12，0-shot，seed 0，bootstrap 1000；ARC-Challenge、
  ARC-Easy、HellaSwag、LAMBADA OpenAI、PIQA、WinoGrande。两项均为 28 blocks、
  196 Linear；q/k norm 与 lm_head 浮点。
- d=3：ARC-C `26.2799%`、ARC-E `45.2862%`、HellaSwag `39.3149%`、
  LAMBADA `27.6732%`、PIQA `62.7312%`、WinoGrande `54.7751%`；宏平均
  `42.6767%`；`2.0270182 bpp`；运行 `241.49 s`。
- d=6：ARC-C `28.2423%`、ARC-E `49.7054%`、HellaSwag `40.4800%`、
  LAMBADA `29.0316%`、PIQA `62.7856%`、WinoGrande `54.6961%`；宏平均
  `44.1568%`；`2.2010417 bpp`；运行 `243.98 s`。
- 结论：d=6 宏平均高 `1.4801` 个百分点，优势主要来自 ARC-E/ARC-C；PIQA 与
  WinoGrande 基本持平。该结果与 d=6 更低的 WikiText2 PPL 一致，但 d=6 也使用
  更高 logical bpp，因此不能解释为同码率下的纯 d 因果效应。
- 环境兼容记录：冒烟阶段依次发现并修复远端 `typing_extensions` 过旧、PyTorch
  2.3 `weights_only` 不支持 uint16、HellaSwag 缓存命名不匹配、lm-eval 原始结果
  含函数对象无法直接 JSON 序列化等问题；正式任务均返回码 0，不受这些失败影响。
- 本地结果：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_155800_qwen3_06b_formal_lm_eval/`。
- 完整报告：
  `report/20260720_163500_qwen3_06b_vector_gsq_remote_lm_eval_report.md`。

## 2026-07-20 18:50:00 CST：Qwen3-8B/Qwen3-14B 远程全层正式实验前置门禁

- 目的：在把 Qwen3-8B/Qwen3-14B 投入多小时全层正式实验前，确认远程
  A6000 单卡能够完成本方法的完整单层路径：NoWag-d6 初始化、Vector-GPTQ、
  Vector-GSQ、逻辑 checkpoint 保存与本地拉回。
- 执行与归档：所有代码修改先在本地完成，然后同步到 `10.30.0.14`；
  远程只运行程序。`20260720_181000` 两个 gate 任务由 FIFO 队列分别占用两张
  A6000，30 分钟轮询后，JSON、checkpoint、日志和队列状态已拉回本地：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_180442_qwen3_8b_14b_autograd_gates/`。
- 关键修复链路：
  1. 原始 NoWag full `[num_vectors, K]` 距离矩阵在 8B 上申请约 `42.69 GiB`
     并 OOM；改为严格等价的 row-chunked nearest-codeword assignment。
  2. PyTorch 2.3 不能保存 `torch.uint16`，逻辑 assignment 改用物理
     `torch.int32` 保存，logical bpp 仍按真实 assignment bits 计算。
  3. 14B 在 GSQ top-k soft expectation 中保留完整 `[N,K,d]` candidate tensor
     导致 OOM；改为自定义 autograd 的 chunked codebook expectation，前向和
     logits 梯度与 dense 实现逐位一致。
- Qwen3-8B gate：1 层、7 个 Linear、d=6、K=4096、local candidates=8、
  GPTQ row chunk=128、1 step GSQ；返回码 0。layer-0 用时 `231.68 s`，
  总用时 `313.28 s`，峰值显存 `29.57 GB`，prefix-1 WikiText2 PPL
  `9.7591`，logical bpp `2.0212721`。GSQ gate 仅 1 step，`accepted_training=false`
  且 assignment switch rate 为 0，因此该 PPL 只能证明链路可运行，不能作为质量结论。
- Qwen3-14B gate：1 层、7 个 Linear、d=6、K=4096、local candidates=4、
  GPTQ row chunk=64、1 step GSQ；返回码 0。layer-0 用时 `642.83 s`，
  总用时 `758.60 s`，峰值显存 `47.31 GB`，prefix-1 WikiText2 PPL
  `8.6465`，logical bpp `2.0144593`。14B 单卡显存余量很小，正式实验先保守
  使用 local candidates=4。
- 结论：本方法的大模型单层链路已经从“内存不可运行”推进到“8B/14B 可完成并
  保存可重载 checkpoint”。下一步可启动全层正式实验；预计 8B 约数小时，14B
  约 7 小时以上。gate 不证明最终精度，仅证明内存路径、checkpoint 格式和
  本地拉回流程可信。
- 当前模型资产状态：Qwen3-8B 和 Qwen3-14B 已在远程具备完整模型副本；
  Llama-3-8B 和 Llama-3-70B 仍需同步；本地找到的 Llama-2-7B 候选路径
  `/data01/home/xuzk/workspace/VPTQ_ours/weights/Llama-2-7b-hf` 是指向
  `/data02/datasets/Llama-2-7b-hf/` 的失效符号链接，因此尚无可验证的原始
  Llama-2-7B HF 权重可用于正式实验。

## 2026-07-20 19:08:00 CST：Qwen3-8B/Qwen3-14B 本方法正式全层实验启动与 Uniform 队列准备

- 目的：把通过 gate 的大模型链路推进到正式全层实验，并准备 Qwen3-8B/Qwen3-14B
  Uniform GPTQ+GSQ g128 baseline，使两张远程 A6000 在有空卡时继续接队列任务。
- 本方法正式任务：manifest
  `code/GSQ_nowag_d1_20260716_015355/experiments/remote_runner/manifests/20260720_185455_qwen3_8b_14b_vector_gsq_formal_jobs.json`。
  任务已于 `2026-07-20 18:58:15 +0800` 在远程队列启动；Qwen3-8B 分配 GPU0，
  Qwen3-14B 分配 GPU1；队列 `poll_seconds=1800`。本地归档目录：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_185455_qwen3_8b_14b_vector_gsq_formal/`。
- 本方法配置：Qwen3-8B 全 36 层，ppl depths `6,12,18,24,30,36`，
  local candidates=8，GPTQ row chunk=128；Qwen3-14B 全 40 层，ppl depths
  `8,16,24,32,40`，local candidates=4，GPTQ row chunk=64。两者均为
  d=6、2bit、K=4096、NoWag 初始化、Vector-GPTQ、Vector-GSQ、`steps=400`、
  train/validation 各 8 条 4096 tokens、GPTQ/Hessian 64 条 4096 tokens、
  WikiText2 PPL seqlen=2048。
- 中间状态说明：本地拉取目录已经出现 Qwen3-8B 的 JSON/PT 中间文件，但 JSON
  目前只包含第 0 层、`completed` 尚未为 true、没有正式 prefix PPL；这是逐层
  写盘的中间状态，不作为质量结论。
- Uniform baseline 准备：新增 Qwen3-8B/Qwen3-14B official-style Uniform
  GPTQ+GSQ g128 配置和单卡 runner：
  `configs/official_reproduction/qwen3_8b_uniform_gsq_g128_remote_formal.yaml`、
  `configs/official_reproduction/qwen3_14b_uniform_gsq_g128_remote_formal.yaml`、
  `experiments/remote_runner/run_uniform_gsq_formal.sh`。配置沿用原 official
  reproduction：FineWeb-Edu、4096 train samples、128 validation samples、
  GPTQ nsamples=512、20 epochs、2bit、groupsize=128、lm_head 不量化。
- Uniform 队列：manifest
  `experiments/remote_runner/manifests/20260720_185455_qwen3_8b_14b_uniform_gsq_formal_jobs.json`。
  为避免在 30 分钟窗口内额外轮询 GPU，远程 tmux 已设置延迟启动，预计在
  `2026-07-20 19:28:27 +0800` 左右才启动 nested runtime 队列
  `runtime/uniform_queue_20260720_185455`，之后同样 `poll_seconds=1800`。
- 拉回策略：Vector 正式实验和 Uniform baseline 各有一个本地 pull monitor，
  都每 1800 秒 rsync 一次远程 `runtime/` 到本地 timestamped archive。为支持
  nested Uniform 队列，`pull_remote_results.sh` 增加了可选
  `QUEUE_STATE_RELATIVE`，避免 Uniform monitor 错看 Vector 队列状态。
- Llama 模型同步状态：`2026-07-20 19:13:40 +0800` 已启动本地 tmux
  `stom_model_sync_llama3_20260720_191203`，将 Llama-3-8B 和 Llama-3-70B
  rsync 到远程 `stom_remote/models/`；该同步已于
  `2026-07-20 19:25:03 +0800` 完成。本地日志位于
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/model_sync_20260720_191203/llama3_model_sync.log`。
  其中 Llama-3-8B 的标准 HF 根目录不是上一层
  `/data01/datasets/Meta-Llama-3-8B`，而是其子目录
  `/data01/datasets/Meta-Llama-3-8B/LLM-Research/Meta-Llama-3-8B`；后续实验
  manifest 必须指向远程对应子目录。Llama-3-70B 为标准 HF 根目录，但 bf16
  权重约 `132 GB`，当前全模型 `.to(cuda)` Vector 脚本不能直接加载，需要单独
  的分层/offload 运行路径。

## 2026-07-20 20:03:00 CST：Qwen3-14B 正式本方法 OOM 诊断与 Uniform 8B 环境修复

- Qwen3-8B 本方法正式实验状态：`2026-07-20 19:58:15 +0800` 队列轮询显示
  仍在 GPU0 运行，GPU0 显存约 `24.3 GB`、利用率 `100%`。本地中间 JSON
  显示已完成到 layer 7，`elapsed_seconds=3445.27`，depth-6 WikiText2 prefix
  PPL 为 `9.9980`。这是 prefix 指标，不是全模型最终结果。
- Qwen3-14B 本方法正式实验失败：原任务
  `20260720_185455_qwen3_14b_d6_k4_s400_full40_formal` 于
  `2026-07-20 19:28:15 +0800` 返回码 1。失败点在 GSQ 训练中
  `quantizer(...)->denormalize_from_vectors()->normalizer.denormalize()`，额外申请
  `340 MiB` 触发 CUDA OOM。该失败不是 NoWag 初始化或 Vector-GPTQ 失败；
  第 0 层已经完成 400 step GSQ，并把 validation block MSE 从 `0.0010155`
  降到 `0.0004494`，相对下降 `55.74%`，assignment switch rate `15.75%`。
- 14B OOM 根因：进入 GSQ 前还保留了 `nowag_weights`、`gptq_weights`、Hessian
  和若干候选构建临时张量，导致 soft weight 反归一化时没有足够显存余量。已在
  本地 `experiments/nowag_d6/run_prefix_vector_gsq.py` 增加释放逻辑：候选构建后
  释放临时 vector/distance，初始 hard-weight 评估后释放 `initial_weights`，
  进入 GSQ 前释放 NoWag/GPTQ 完整权重缓存，同时清空不再需要的 Hessian dict。
  语法校验通过并已同步远程。后续 14B retry 应沿用相同算法参数，优先验证该
  纯内存修复是否足够。
- Uniform Qwen3-8B 第一次失败：`20260720_185455_qwen3_8b_uniform_gsq_g128_formal`
  因远程环境缺 `wandb` 在 `main.py` 顶层导入失败。配置实际为
  `wandb.enabled=false`，因此属于无意义依赖失败。已给 `main.py` 添加 fallback
  到仓库内 `compat/wandb.py`。
- Uniform Qwen3-8B 第二次失败：
  `20260720_194113_qwen3_8b_uniform_gsq_g128_wandbfix_retry` 越过 `main.py`
  后在 `src/trainer.py` 顶层 `import wandb` 失败。已给 `src/trainer.py` 添加
  同样的 fallback。
- Uniform Qwen3-8B 第三次失败前环境修复：
  `20260720_194902_qwen3_8b_uniform_gsq_g128_wandbfix2_retry` 越过 W&B 后，
  在 `src/models/base.py` 导入 `compressed_tensors` 失败。`pyproject.toml`
  原本声明了 `compressed-tensors`，但远程 bootstrap 漏装；已在本地
  `experiments/remote_runner/bootstrap_remote_env.sh` 补充
  `compressed-tensors==0.15.0.1` 与 `pydantic>=2.7,<3`，并在远程 venv 安装验证：
  `pydantic 2.13.4`、`compressed_tensors 0.15.0.1` 可 import。
- Uniform Qwen3-8B 当前有效重试：
  `20260720_195858_qwen3_8b_uniform_gsq_g128_envfix_retry` 已于
  `2026-07-20 20:00:44 +0800` 启动在 GPU1。本地拉回日志显示已越过依赖导入，
  进入 FineWeb token cache 构建：
  `/data01/user/xuzk/stom_remote/data/fineweb_edu/chunks_9470c0c4ea073c9d0ebe.pt`。
  该任务尚未完成，下一次按 30 分钟窗口检查。
- 队列风险记录：早先的 Uniform 总队列和前两次 retry 队列会在自己的下一次
  1800 秒 poll 时把失败进程标记为 failed；当前 GPU1 实际由第三次有效 retry
  使用。后续不要把前两个 failed retry 误判为算法失败，它们都是环境依赖失败。

## 2026-07-20 20:37:56 CST：远程 20:31 轮询状态与回拉归档修正

- 目的：按用户要求每 30 分钟检查远程实验/GPU 状态，同时确保远端日志、JSON
  与状态文件回拉到本地，避免仅保留在远程。
- 远程检查时间：`2026-07-20 20:31:27 +0800` 到
  `2026-07-20 20:31:47 +0800`；远程主机 `10.30.0.14:10022` 可连接，
  主机名 `d6f0b330ff00`。
- GPU 状态：GPU0 A6000 显存约 `33.1 GB / 49.1 GB`、利用率 `96%`；
  GPU1 A6000 显存约 `7.8 GB / 49.1 GB`、利用率 `37%`。队列状态文件在
  20:28/20:30 的内部轮询中分别记录 GPU0/GPU1 仍被任务占用，因此本轮没有空卡
  启动 Qwen3-14B memory-fix retry 或 Llama-3-8B gate。
- Qwen3-8B 本方法正式实验：
  `20260720_185455_qwen3_8b_d6_k8_s400_full36_formal` 仍由
  `stom_qwen8_14_formal_20260720_185455` 队列标记为 running，GPU0 执行。
  本地已回拉结果 JSON：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_185455_qwen3_8b_14b_vector_gsq_formal/runtime/results/20260720_185455_qwen3_8b_d6_k8_s400_full36_formal.json`。
  当前 JSON 显示已写入 `13` 个 layer（最后到 layer 12），
  `elapsed_seconds=5768.35`，logical effective bpp `2.0212721`；
  已有 prefix WikiText2 PPL：depth 6 为 `9.9980`，depth 12 为 `10.5316`。
  这仍不是 36 层最终结果。
- Qwen3-8B Uniform GPTQ+GSQ baseline 有效重试：
  `20260720_195858_qwen3_8b_uniform_gsq_g128_envfix_retry` 于
  `2026-07-20 20:00:44 +0800` 启动在 GPU1，队列状态文件
  `runtime/uniform8_retry3_queue_20260720_195858/queue_state.json` 于
  `2026-07-20 20:30:44 +0800` 标记 running。日志显示依赖问题已解除，
  FineWeb cache 已生成，当前在 layer 0 的 GSQ 训练中；到
  `2026-07-20 20:31:43 +0800` 完成 epoch 2/20，val hard loss 从 epoch 1 的
  `1.12e-04` 到 epoch 2 的 `9.30e-05`，仍在训练中。
- 回拉归档问题修正：发现 Uniform retry3 归档根路径的 `runtime/queue_state.json`
  是 Vector 根队列状态，真正的 Uniform 状态在
  `runtime/uniform8_retry3_queue_20260720_195858/queue_state.json`。根因是
  `pull_remote_results.sh` 默认回拉整个 `runtime/`，多队列状态会混在同一归档。
  已在本地修改并同步远程：
  `code/GSQ_nowag_d1_20260716_015355/experiments/remote_runner/pull_remote_results.sh`。
  新增 `REMOTE_RUNTIME_RELATIVE`、`LOCAL_RUNTIME_RELATIVE` 和
  `EXCLUDE_HEAVY_ARTIFACTS=1`，后续可只回拉指定 runtime 子目录并跳过
  `.pt/.bin/.safetensors` 大文件。`bash -n` 本地和远端均通过。
- 下一次允许轮询点：Qwen3-8B Vector 队列约
  `2026-07-20 20:58:15 +0800`；Uniform retry3 队列约
  `2026-07-20 21:00:44 +0800`。若届时 GPU 空出，优先启动已准备好的
  Qwen3-14B memory-fix retry manifest，再考虑 Llama-3-8B gate。Llama-3-70B
  仍不能用当前全模型 `.to(cuda)` runner 直接启动。

## 2026-07-20 21:02:38 CST：远程 21:01 轮询状态

- 目的：按 30 分钟窗口检查两条正在运行的远程队列，并把日志、JSON 和状态文件
  轻量回拉到本地；本次回拉排除 `.pt/.bin/.safetensors` 大文件，避免阻塞状态同步。
- 远程检查时间：`2026-07-20 21:01:49 +0800`。即时 GPU 状态：
  GPU0 A6000 显存 `27614 / 49140 MiB`、利用率 `100%`；
  GPU1 A6000 显存 `8073 / 49140 MiB`、利用率 `100%`。两张卡均在执行任务，
  本轮没有空卡，因此未启动 Qwen3-14B memory-fix retry 或 Llama-3-8B gate。
- Qwen3-8B 本方法 Vector-GSQ 正式实验：
  `20260720_185455_qwen3_8b_d6_k8_s400_full36_formal` 仍 running，队列最近内部
  轮询时间 `2026-07-20T20:58:15+0800`。本地已回拉 JSON 显示已写入
  `16` 个 layer，`elapsed_seconds=7185.5859`，logical effective bpp
  `2.0212721`。当前 prefix PPL：depth 6 为 `9.9980`，depth 12 为
  `10.5316`；尚未到 depth 18/24/30/36，因此不是最终结果。
- Qwen3-8B Uniform GPTQ+GSQ baseline 有效重试：
  `20260720_195858_qwen3_8b_uniform_gsq_g128_envfix_retry` 仍 running，队列最近
  内部轮询时间 `2026-07-20T21:00:44+0800`。日志显示 layer 0 正在 GSQ 训练：
  epoch 4/20 val hard loss `8.82e-05`，epoch 5/20 `8.60e-05`，
  epoch 6/20 `8.39e-05`。这说明 Uniform baseline 的训练损失仍在下降，
  但仍只是第 0 层训练中，远未完成全模型。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_185455_qwen3_8b_14b_vector_gsq_formal/runtime/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_195858_qwen3_8b_uniform_gsq_retry3/runtime/uniform8_retry3_queue_20260720_195858/`。
- 下一次远程轮询点：`2026-07-20 21:30:44 +0800` 之后。两次轮询之间不再频繁
  查询远端 GPU/实验状态。

## 2026-07-20 21:33:03 CST：远程 21:31 轮询状态

- 目的：按 30 分钟窗口检查远程实验状态，确认是否有空卡可继续启动排队实验，
  并把本轮状态、日志和 JSON 轻量回拉到本地。
- 远程检查时间：`2026-07-20 21:31:49 +0800`。即时 GPU 状态：
  GPU0 A6000 显存 `28216 / 49140 MiB`、利用率 `100%`；
  GPU1 A6000 显存 `7693 / 49140 MiB`、利用率 `100%`。两张卡均在跑任务，
  因此本轮未启动 Qwen3-14B memory-fix retry 或 Llama-3-8B gate。
- Qwen3-8B 本方法 Vector-GSQ 正式实验：
  `20260720_185455_qwen3_8b_d6_k8_s400_full36_formal` 仍 running，队列最近内部
  轮询时间 `2026-07-20T21:28:15+0800`。本地 JSON 显示已写入 `20` 个 layer，
  `elapsed_seconds=8996.1070`，logical effective bpp `2.0212721`。
  当前 prefix WikiText2 PPL：depth 6 为 `9.9980`，depth 12 为 `10.5316`，
  depth 18 为 `10.9558`。该结果仍不是最终 36 层指标。
- Qwen3-8B Uniform GPTQ+GSQ baseline 有效重试：
  `20260720_195858_qwen3_8b_uniform_gsq_g128_envfix_retry` 仍 running，队列最近
  内部轮询时间 `2026-07-20T21:30:44+0800`。日志显示仍在 layer 0 GSQ：
  epoch 8/20 val hard loss `8.08e-05`，epoch 9/20 `7.96e-05`，
  epoch 10/20 `7.86e-05`，epoch 11/20 `7.79e-05`。验证 hard loss 继续缓慢下降，
  但全模型实验仍处于很早阶段。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_185455_qwen3_8b_14b_vector_gsq_formal/runtime/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_195858_qwen3_8b_uniform_gsq_retry3/runtime/uniform8_retry3_queue_20260720_195858/`。
- 下一次远程轮询点：`2026-07-20 22:01:49 +0800` 之后。两次轮询之间不做远端
  查询、回拉或状态输出。

## 2026-07-20 22:02:37 CST：远程 22:01 轮询状态

- 目的：按 30 分钟窗口检查远程队列/GPU、回拉最新状态和日志，并确认是否可以
  启动后续排队实验。
- 远程检查时间：`2026-07-20 22:01:50 +0800`。即时 GPU 状态：
  GPU0 A6000 显存 `27128 / 49140 MiB`、利用率 `100%`；
  GPU1 A6000 显存 `7753 / 49140 MiB`、利用率 `97%`。两张卡仍有任务占用，
  本轮没有空卡，因此未启动 Qwen3-14B memory-fix retry 或 Llama-3-8B gate。
- Qwen3-8B 本方法 Vector-GSQ 正式实验：
  `20260720_185455_qwen3_8b_d6_k8_s400_full36_formal` 仍 running，队列最近内部
  轮询时间 `2026-07-20T21:58:15+0800`。本地 JSON 显示已写入 `24` 个 layer，
  `elapsed_seconds=10813.2359`，logical effective bpp `2.0212721`。
  当前 prefix WikiText2 PPL：depth 6 为 `9.9980`，depth 12 为 `10.5316`，
  depth 18 为 `10.9558`，depth 24 为 `11.3047`。该结果仍不是最终 36 层指标。
- Qwen3-8B Uniform GPTQ+GSQ baseline 有效重试：
  `20260720_195858_qwen3_8b_uniform_gsq_g128_envfix_retry` 仍 running，队列最近
  内部轮询时间 `2026-07-20T22:00:44+0800`。日志显示仍在 layer 0 GSQ：
  epoch 12/20 val hard loss `7.73e-05`，epoch 13/20 `7.68e-05`，
  epoch 14/20 `7.65e-05`，epoch 15/20 `7.62e-05`，epoch 16/20 `7.59e-05`。
  hard loss 继续下降，但仍处于第 0 层。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_185455_qwen3_8b_14b_vector_gsq_formal/runtime/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_195858_qwen3_8b_uniform_gsq_retry3/runtime/uniform8_retry3_queue_20260720_195858/`。
- 下一次远程轮询点：`2026-07-20 22:31:50 +0800` 之后。轮询前不做远端查询、
  回拉或状态输出。

## 2026-07-20 22:43:15 CST：远程 22:31 轮询、Uniform 保存 API 修复与 14B memory-fix retry 启动

- 目的：按 30 分钟窗口检查远程队列/GPU，回拉本轮日志与 JSON；对本轮发现的
  Uniform 失败做本地修复并同步远端；释放补丁前启动、已确认会失败的旧 Uniform
  进程，启动下一项排队实验。
- 远程检查时间：`2026-07-20 22:31:50 +0800`。即时 GPU 状态：
  GPU0 A6000 显存 `33262 / 49140 MiB`、利用率 `99%`；
  GPU1 A6000 显存 `4834 / 49140 MiB`、利用率 `77%`。进一步检查
  `nvidia-smi --query-compute-apps` 发现 GPU1 的 PID `2001381` 是早先
  `20260720_185455_qwen3_14b_uniform_gsq_g128_formal`，并非空卡。
- Qwen3-8B 本方法 Vector-GSQ 正式实验：
  `20260720_185455_qwen3_8b_d6_k8_s400_full36_formal` 仍 running，队列最近内部
  轮询时间 `2026-07-20T22:28:15+0800`。本地 JSON 显示已写入 `28` 个 layer，
  `elapsed_seconds=12547.7662`，logical effective bpp `2.0212721`。
  当前 prefix WikiText2 PPL：depth 6 为 `9.9980`，depth 12 为 `10.5316`，
  depth 18 为 `10.9558`，depth 24 为 `11.3047`；尚未到 depth 30/36。
- Qwen3-8B Uniform GPTQ+GSQ fixed env retry 失败：
  `20260720_195858_qwen3_8b_uniform_gsq_g128_envfix_retry` 于
  `2026-07-20T22:30:44+0800` 被队列标记 failed。它并非训练不收敛：
  layer 0 完成 20/20 epochs，validation hard loss 从约 `1.10e-04` 下降到
  `7.54e-05`，`accepted_training=True`，并已写 layer checkpoint。失败发生在
  随后的 attention 保存阶段：
  `AttributeError: 'PackedQuantizationCompressor' object has no attribute 'compress_weight'`。
  根因是远端安装的 `compressed-tensors==0.15.0.1` 只提供
  `PackedQuantizationCompressor.compress/decompress`，没有仓库旧代码调用的
  `compress_weight/decompress_weight`。
- 本地代码修复并同步远端：
  修改 `code/GSQ_nowag_d1_20260716_015355/src/models/base.py`，新增
  `_compress_weight/_decompress_weight` 兼容路径：若旧 API 存在则继续使用旧 API；
  若不存在，则用新 API 包装单个 `{"weight", "weight_scale"}` state dict，并用
  `QuantizationScheme(targets=["Linear"], weights=QuantizationArgs(...))` 调用
  `compress/decompress`。远端 venv 小权重 pack/depack roundtrip 验证通过，
  返回 `['weight_packed', 'weight_scale', 'weight_shape']`，解包 tensor shape
  正确且全部 finite。
- 旧 Qwen3-14B Uniform 进程处理：
  PID `2001381` 是补丁前启动的
  `20260720_185455_qwen3_14b_uniform_gsq_g128_formal`，同样会在 layer 0
  写盘后触发旧 API 失败。为避免继续占用 GPU1 跑已知必败路径，已发送
  `SIGTERM` 终止该进程。后续 Uniform 8B/14B 必须使用 fixed-compressor retry
  manifest 重新启动。
- 已启动 Qwen3-14B 本方法 Vector-GSQ memory-fix retry：
  远程 tmux `stom_qwen14_memoryfix_20260720_224127`，runtime 子目录
  `runtime/qwen14_memoryfix_queue_20260720_224127`，任务
  `20260720_201018_qwen3_14b_d6_k4_s400_full40_memoryfix_retry` 于
  `2026-07-20T22:41:35+0800` 启动在 GPU1，PID `2687285`。本地归档：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_224127_qwen3_14b_vector_gsq_memoryfix_retry/`。
  本地 pull monitor `stom_pull_qwen14_memoryfix_20260720_224127` 已启动，
  每 1800 秒轻量回拉远端 runtime，排除 `.pt/.bin/.safetensors`。
- 已准备但未启动 fixed Uniform retry manifest：
  `code/GSQ_nowag_d1_20260716_015355/experiments/remote_runner/manifests/20260720_224330_qwen3_8b_14b_uniform_gsq_fixed_compressor_retry_jobs.json`，
  包含 Qwen3-8B 和 Qwen3-14B 两个 Uniform GPTQ+GSQ g128 retry 任务，已同步远端。
  因 GPU0/GPU1 当前分别被 8B Vector 和 14B Vector memory-fix retry 占用，本轮不启动。
- 下一次远程轮询点：`2026-07-20 23:11:35 +0800` 之后。轮询前不做远端查询、
  回拉或状态输出。

## 2026-07-20 23:12:02 CST：远程 23:11 轮询状态

- 目的：按 30 分钟窗口检查远程队列/GPU，确认是否有空卡启动 fixed Uniform
  retry，并把本轮状态、日志和 JSON 轻量回拉到本地。
- 远程检查时间：`2026-07-20 23:11:36 +0800`。即时 GPU 状态：
  GPU0 A6000 显存 `32910 / 49140 MiB`、利用率 `99%`；
  GPU1 A6000 显存 `45318 / 49140 MiB`、利用率 `63%`。GPU 进程显示
  GPU0 PID `1731372` 为 Qwen3-8B Vector-GSQ，GPU1 PID `2687285` 为
  Qwen3-14B memory-fix retry。两张卡均被当前任务占用，本轮未启动 fixed
  Uniform retry。
- Qwen3-8B 本方法 Vector-GSQ 正式实验：
  `20260720_185455_qwen3_8b_d6_k8_s400_full36_formal` 仍 running，队列最近内部
  轮询时间 `2026-07-20T22:58:15+0800`。本地 JSON 显示已写入 `33` 个 layer，
  `elapsed_seconds=14789.0657`，logical effective bpp `2.0212721`。
  当前 prefix WikiText2 PPL：depth 6 为 `9.9980`，depth 12 为 `10.5316`，
  depth 18 为 `10.9558`，depth 24 为 `11.3047`，depth 30 为 `12.1318`；
  尚未到最终 depth 36。
- Qwen3-14B 本方法 Vector-GSQ memory-fix retry：
  `20260720_201018_qwen3_14b_d6_k4_s400_full40_memoryfix_retry` 仍 running，队列
  最近内部轮询时间 `2026-07-20T23:11:35+0800`。本地 JSON 显示已写入 `1`
  个 layer，`elapsed_seconds=888.5973`，logical effective bpp `2.0144593`，
  尚无 prefix PPL。GPU1 显存约 `45.3 GB`，说明 memory-fix retry 正在以接近
  单卡上限运行；目前未出现上一轮 14B formal 的 immediate OOM。
- fixed Uniform retry manifest
  `20260720_224330_qwen3_8b_14b_uniform_gsq_fixed_compressor_retry_jobs.json`
  仍处于已准备/已同步远端但未启动状态。启动条件是后续 GPU0 或 GPU1 空出。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_185455_qwen3_8b_14b_vector_gsq_formal/runtime/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_224127_qwen3_14b_vector_gsq_memoryfix_retry/runtime/qwen14_memoryfix_queue_20260720_224127/`。
- 下一次远程轮询点：`2026-07-20 23:41:36 +0800` 之后。轮询前不做远端查询、
  回拉或状态输出。

## 2026-07-20 23:42:52 CST：Qwen3-8B Vector-GSQ 完成与 fixed Uniform retry 启动

- 目的：按 30 分钟窗口检查远程队列/GPU，回拉 Qwen3-8B Vector-GSQ 最终结果，
  并在 GPU0 空出后启动 fixed Uniform retry 队列。
- 远程检查时间：`2026-07-20 23:41:36 +0800`。即时 GPU 状态：
  GPU0 A6000 显存 `13 / 49140 MiB`、利用率 `0%`；
  GPU1 A6000 显存 `44982 / 49140 MiB`、利用率 `94%`。GPU 进程显示只有
  GPU1 PID `2687285` 的 Qwen3-14B memory-fix retry 仍在运行；GPU0 已空出。
- Qwen3-8B 本方法 Vector-GSQ 正式实验完成：
  `20260720_185455_qwen3_8b_d6_k8_s400_full36_formal` 的结果 JSON 已回拉到本地，
  `completed=true`，共 `36/36` 层，`elapsed_seconds=16177.8670`，
  logical effective bpp `2.0212721`，GPU peak memory `32095254528` bytes。
  WikiText2 prefix/final PPL：depth 6 `9.9980`，depth 12 `10.5316`，
  depth 18 `10.9558`，depth 24 `11.3047`，depth 30 `12.1318`，
  depth 36 `13.8255`。该 `depth=36` 是本次 8B Vector-GSQ 全层最终 PPL。
- Qwen3-14B 本方法 Vector-GSQ memory-fix retry：
  `20260720_201018_qwen3_14b_d6_k4_s400_full40_memoryfix_retry` 仍 running，
  队列最近内部轮询时间 `2026-07-20T23:41:35+0800`。本地 JSON 显示已写入
  `3` 个 layer，`elapsed_seconds=2720.9344`，logical effective bpp
  `2.0144593`，尚无 prefix PPL。GPU1 显存约 `44.98 GB`，仍在继续运行。
- 已启动 fixed Uniform retry 队列：
  远程 tmux `stom_uniform_fixed_20260720_234226`，runtime
  `runtime/uniform_fixed_queue_20260720_224330`，manifest
  `20260720_224330_qwen3_8b_14b_uniform_gsq_fixed_compressor_retry_jobs.json`。
  队列于 `2026-07-20T23:42:12+0800` 启动
  `20260720_224330_qwen3_8b_uniform_gsq_g128_fixed_compressor_retry` 到 GPU0，
  PID `2939421`；`20260720_224330_qwen3_14b_uniform_gsq_g128_fixed_compressor_retry`
  保持 pending，等待空卡。
- 本地 fixed Uniform 归档与 pull monitor：
  归档目录
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_234226_qwen3_8b_14b_uniform_gsq_fixed_compressor_retry/`；
  pull monitor `stom_pull_uniform_fixed_20260720_234226` 已启动，每 1800 秒轻量回拉，
  排除 `.pt/.bin/.safetensors`。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_185455_qwen3_8b_14b_vector_gsq_formal/runtime/results/20260720_185455_qwen3_8b_d6_k8_s400_full36_formal.json`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_224127_qwen3_14b_vector_gsq_memoryfix_retry/runtime/qwen14_memoryfix_queue_20260720_224127/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_234226_qwen3_8b_14b_uniform_gsq_fixed_compressor_retry/runtime/uniform_fixed_queue_20260720_224330/`。
- 下一次远程轮询点：`2026-07-21 00:12:12 +0800` 之后。轮询前不做远端查询、
  回拉或状态输出。

## 2026-07-21 00:12:35 CST：远程 00:12 轮询状态

- 目的：按 30 分钟窗口检查远程队列/GPU，确认 fixed Uniform retry 是否越过
  compressor API 修复点前的训练阶段，并回拉最新状态、日志和 JSON。
- 远程检查时间：`2026-07-21 00:12:12 +0800`。即时 GPU 状态：
  GPU0 A6000 显存 `3174 / 49140 MiB`、利用率 `73%`；
  GPU1 A6000 显存 `45690 / 49140 MiB`、利用率 `64%`。GPU 进程显示
  GPU0 PID `2939421` 为 Qwen3-8B Uniform fixed retry，GPU1 PID `2687285`
  为 Qwen3-14B Vector-GSQ memory-fix retry。
- Qwen3-8B Vector-GSQ 正式实验：
  根队列已在 `2026-07-20T23:58:16+0800` 将
  `20260720_185455_qwen3_8b_d6_k8_s400_full36_formal` 标记为 completed，
  returncode `0`。本地最终 JSON 仍为 `completed=true`，36/36 层，最终
  WikiText2 PPL `13.8255`，logical effective bpp `2.0212721`。
- Qwen3-14B Vector-GSQ memory-fix retry：
  `20260720_201018_qwen3_14b_d6_k4_s400_full40_memoryfix_retry` 仍 running，
  队列最近内部轮询时间 `2026-07-21T00:11:35+0800`。本地 JSON 显示已写入
  `5` 个 layer，`elapsed_seconds=4493.0999`，logical effective bpp
  `2.0144593`，尚无 prefix PPL。GPU1 显存约 `45.7 GB`。
- Qwen3-8B Uniform fixed retry：
  `20260720_224330_qwen3_8b_uniform_gsq_g128_fixed_compressor_retry` 仍 running，
  队列最近内部轮询时间 `2026-07-21T00:12:12+0800`。日志显示 layer 0 正在
  GSQ 训练：epoch 1/20 val hard loss `1.09e-04`，epoch 2/20 `9.52e-05`，
  epoch 3/20 `9.46e-05`，epoch 4/20 `9.09e-05`，epoch 5/20 `8.83e-05`，
  epoch 6/20 `8.55e-05`。该 fixed retry 尚未到保存阶段，因此 compressor API
  修复点还未被端到端验证，但训练进展正常。
- Qwen3-14B Uniform fixed retry：
  `20260720_224330_qwen3_14b_uniform_gsq_g128_fixed_compressor_retry` 仍 pending，
  等待 fixed Uniform 队列释放 GPU。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_185455_qwen3_8b_14b_vector_gsq_formal/runtime/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_224127_qwen3_14b_vector_gsq_memoryfix_retry/runtime/qwen14_memoryfix_queue_20260720_224127/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_234226_qwen3_8b_14b_uniform_gsq_fixed_compressor_retry/runtime/uniform_fixed_queue_20260720_224330/`。
- 下一次远程轮询点：`2026-07-21 00:42:12 +0800` 之后。轮询前不做远端查询、
  回拉或状态输出。

## 2026-07-21 01:46:00 CST：远程 01:42 轮询、Uniform tuple 输出修复与队列重启

- 目的：按 30 分钟窗口检查远程队列/GPU，确认 Qwen3-8B Uniform fixed retry
  的失败点，修复非算法性运行错误，并继续保持双卡实验推进。
- 远程检查时间：`2026-07-21 01:42:26 +0800`。即时 GPU 状态：
  GPU0 A6000 显存 `4852 / 49140 MiB`、利用率 `85%`；
  GPU1 A6000 显存 `44896 / 49140 MiB`、利用率 `96%`。GPU 进程显示
  GPU0 PID `3314405` 为 Qwen3-14B Uniform 旧队列，GPU1 PID `2687285`
  为 Qwen3-14B Vector-GSQ memory-fix retry。
- Qwen3-8B Vector-GSQ 正式实验：
  `20260720_185455_qwen3_8b_d6_k8_s400_full36_formal` 已 completed，
  36/36 层，最终 WikiText2 PPL `13.8255`，logical effective bpp
  `2.0212721`。该实验配置为 d=6、2bit、K=4096、NoWag 初始化、
  Vector-GPTQ、Vector-GSQ、`steps=400`。注意：`steps=400` 只是大模型
  可运行初版，不代表充分收敛最优；Qwen3-0.6B 推荐质量配置曾使用 early
  `1536` steps、default `1024` steps，后续需补大模型 steps 消融。
- Qwen3-14B Vector-GSQ memory-fix retry：
  `20260720_201018_qwen3_14b_d6_k4_s400_full40_memoryfix_retry` 仍 running，
  队列最近内部轮询时间 `2026-07-21T01:41:36+0800`。本地/远程 JSON 显示
  已写入 `11` 个 layer，`elapsed_seconds=10062.5126`，logical effective bpp
  `2.0144593`，已有 prefix PPL：depth 8 = `8.7967510`。该实验尚未完成，
  不能作为最终 14B 结论。
- Qwen3-8B Uniform fixed compressor retry：
  `20260720_224330_qwen3_8b_uniform_gsq_g128_fixed_compressor_retry` failed，
  returncode `1`，finished_at `2026-07-21T01:12:12+0800`。日志显示 layer 0
  attention GSQ 训练完成并写出 checkpoint，进入 layer 0 MLP GPTQ 后，在
  MLP Gumbel 初始 validation 阶段失败。错误为
  `AttributeError: 'tuple' object has no attribute 'size'`，位置为
  `src/models/base.py:453` 的 `mse = self.loss_fn(out_q, out_fp)`。
- 失败根因：
  HF decoder layer 在部分路径返回 tuple，首元素才是 hidden-state tensor。
  `get_layer_activations` 已做 `out[0]`，但 `calculate_mse -> forward_with_quantized`
  没有统一解包，导致 MSELoss 收到 tuple。该问题不是 compressor API 问题，
  也不是量化算法本身的质量问题。
- 本地修复与同步：
  修改本地 `code/GSQ_nowag_d1_20260716_015355/src/models/base.py`，新增
  `_tensor_output()`，并在 `calculate_mse()`、`forward_with_quantized()`、
  `get_loss()` 中统一解包 layer 输出。验证通过：
  `python -m py_compile src/models/base.py`；
  远程同步后也通过
  `/data01/user/xuzk/stom_remote/venv/bin/python -m py_compile src/models/base.py`。
- 队列调整：
  由于 Qwen3-14B Uniform 旧进程是在修复前启动，Python 已加载旧代码，继续运行
  大概率会在同一 MLP tuple 输出点失败。为避免 GPU0 空耗，已保留旧日志并停止旧队列
  `stom_uniform_fixed_20260720_234226`。随后启动修复后的新 Uniform 队列：
  `stom_uniform_tuplefix_20260721_014428`，runtime
  `runtime/uniform_tuplefix_queue_20260721_014428`，manifest
  `code/GSQ_nowag_d1_20260716_015355/experiments/remote_runner/manifests/20260721_014428_qwen3_8b_14b_uniform_gsq_tuplefix_retry_jobs.json`。
  新队列顺序为：
  `20260721_014428_qwen3_8b_uniform_gsq_g128_tuplefix_retry`，
  `20260721_014428_qwen3_14b_uniform_gsq_g128_tuplefix_retry`。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_185455_qwen3_8b_14b_vector_gsq_formal/runtime/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_224127_qwen3_14b_vector_gsq_memoryfix_retry/runtime/qwen14_memoryfix_queue_20260720_224127/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_234226_qwen3_8b_14b_uniform_gsq_fixed_compressor_retry/runtime/uniform_fixed_queue_20260720_224330/`。
- 本轮报告：
  `report/20260721_014600_remote_experiment_status_and_tuplefix_report.md`。
- 下一次远程轮询点：`2026-07-21 02:15:09 +0800` 之后。轮询前不做远端查询、
  回拉或状态输出。

## 2026-07-21 02:17:00 CST：旧 Uniform 子进程清理与 tuplefix 队列即时启动

- 目的：修正 01:46 队列重启后的进程残留问题，确保 GPU0 不被加载旧代码的
  Qwen3-14B Uniform 进程空耗，并让修复后的 Qwen3-8B Uniform tuplefix retry
  立即启动。
- 02:15 轮询发现：
  `stom_uniform_fixed_20260720_234226` 的 tmux 已关闭，但旧 job 子进程
  PID `3314405` 仍占用 GPU0。这是因为 `remote_queue.py` 使用
  `start_new_session=True` 启动 job，队列 tmux 退出不会自动杀掉已分离的
  job 进程组。该旧进程是在 tuplefix 前启动，继续运行大概率会在同一 MLP tuple
  输出点失败。
- 处理：
  对旧 PID `3314405` 的进程组发送 SIGTERM；若残留则发送 SIGKILL。随后重启
  `stom_uniform_tuplefix_20260721_014428`。
- 重启确认：
  tuplefix 队列在 `2026-07-21T02:16:05+0800` 启动
  `20260721_014428_qwen3_8b_uniform_gsq_g128_tuplefix_retry`，分配 GPU0，
  PID `3580802`。同一队列中的
  `20260721_014428_qwen3_14b_uniform_gsq_g128_tuplefix_retry` 仍 pending。
- Qwen3-14B Vector-GSQ memory-fix retry：
  `20260720_201018_qwen3_14b_d6_k4_s400_full40_memoryfix_retry` 仍 running，
  GPU1 PID `2687285`。当前 JSON 显示已写入 `14` 个 layer，
  `elapsed_seconds=12765.2169`，logical effective bpp `2.0144593`，
  prefix PPL 仍为 depth 8 = `8.7967510`。尚未完成，不能作为最终 14B 结论。
- 已完成 Qwen3-8B Vector-GSQ d=6 full 36 layers 结果保持不变：
  final WikiText2 PPL `13.8255`，logical effective bpp `2.0212721`，但
  `steps=400` 仍只应解释为大模型可运行初版，不是充分收敛最优。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260721_014428_qwen3_8b_14b_uniform_gsq_tuplefix_retry/runtime/uniform_tuplefix_queue_20260721_014428/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_224127_qwen3_14b_vector_gsq_memoryfix_retry/runtime/qwen14_memoryfix_queue_20260720_224127/`；
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260720_224127_qwen3_14b_vector_gsq_memoryfix_retry/20260720_201018_qwen3_14b_d6_k4_s400_full40_memoryfix_retry.json`。
- 本轮报告：
  `report/20260721_021700_remote_experiment_status.md`。
- 下一次远程轮询点：`2026-07-21 02:46:05 +0800` 之后。轮询前不做远端查询、
  回拉或状态输出。

## 2026-07-21 21:48:40 CST：远程实验轮询间隔从 30 分钟调整为 1 小时

- 目的：按用户最新要求，将 `10.30.0.14` 上运行中远程实验的状态轮询间隔由
  30 分钟改为 1 小时，减少等待窗口内的无效查询和提示输出。
- 生效范围：
  - `20260721_014428_qwen3_8b_uniform_gsq_g128_tuplefix_retry`
  - `20260721_014428_qwen3_14b_uniform_gsq_g128_tuplefix_retry`
- 执行规则：
  - 最后一次已验证轮询时间：`2026-07-21 21:46:05 +0800`；
  - 下一次允许轮询时间：`2026-07-21 22:46:05 +0800`；
  - 等待窗口内不做远程状态检查、不回拉日志、不重复输出等待提示。
- 历史记录处理：既有报告中的“30 分钟轮询”保留为当时事实，不回改历史报告。
- 本轮策略记录：
  `report/20260721_214840_polling_interval_update.md`。

## 2026-07-22 10:47:00 CST：8B 到 layer5 MLP epoch16，14B 到 layer2 MLP epoch19

- 目的：按 1 小时轮询规则检查 `10.30.0.14` 上两张 A6000 的 Uniform-GSQ
  tuplefix retry 实验进展，并回拉远程非 checkpoint 产物。
- 远程检查时间：`2026-07-22 10:46:24 +0800`。GPU 状态：
  GPU0 A6000 显存 `10196 / 49140 MiB`、利用率 `86%`、PID `3580802`；
  GPU1 A6000 显存 `17130 / 49140 MiB`、利用率 `100%`、PID `1145621`。
  队列快照显示 GPU0 `100%`、GPU1 `83%`。结论：两张 GPU 均有效运行。
- Qwen3-8B Uniform tuplefix retry：
  `20260721_014428_qwen3_8b_uniform_gsq_g128_tuplefix_retry` running，
  GPU0，PID `3580802`。当前在 `model.layers.5` MLP Gumbel，最新完整 epoch 为
  16/20。最近 5 个完整 epoch：
  epoch 12/20 `train_loss=6.59e-03, val_soft_loss=6.90e-03, val_hard_loss=8.04e-03`；
  epoch 13/20 `train_loss=6.75e-03, val_soft_loss=7.05e-03, val_hard_loss=8.02e-03`；
  epoch 14/20 `train_loss=6.89e-03, val_soft_loss=7.20e-03, val_hard_loss=7.99e-03`；
  epoch 15/20 `train_loss=7.03e-03, val_soft_loss=7.33e-03, val_hard_loss=7.96e-03`；
  epoch 16/20 `train_loss=7.16e-03, val_soft_loss=7.46e-03, val_hard_loss=7.95e-03`。
  尚无 full 36 layers PPL。
- Qwen3-14B Uniform tuplefix retry：
  `20260721_014428_qwen3_14b_uniform_gsq_g128_tuplefix_retry` running，
  GPU1，PID `1145621`。当前在 `model.layers.2` MLP Gumbel，最新完整 epoch 为
  19/20。最近 5 个完整 epoch：
  epoch 15/20 `train_loss=1.34e-03, val_soft_loss=1.38e-03, val_hard_loss=1.46e-03`；
  epoch 16/20 `train_loss=1.36e-03, val_soft_loss=1.39e-03, val_hard_loss=1.46e-03`；
  epoch 17/20 `train_loss=1.37e-03, val_soft_loss=1.41e-03, val_hard_loss=1.45e-03`；
  epoch 18/20 `train_loss=1.39e-03, val_soft_loss=1.42e-03, val_hard_loss=1.45e-03`；
  epoch 19/20 `train_loss=1.40e-03, val_soft_loss=1.44e-03, val_hard_loss=1.45e-03`。
  尚无 full 40 layers PPL。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260721_014428_qwen3_8b_14b_uniform_gsq_tuplefix_retry/runtime/uniform_tuplefix_queue_20260721_014428/`。
- 本轮报告：
  `report/20260722_104700_remote_experiment_status.md`。
- 下一次远程轮询点：`2026-07-22 11:46:05 +0800`。轮询前不做远端查询、
  回拉或状态输出。

## 2026-07-22 23:24:26 CST：8B 到 layer8 attention epoch18，14B 到 layer4 MLP epoch7

- 目的：按 1 小时外部轮询规则检查 `10.30.0.14` 上两张 A6000 的 Uniform-GSQ
  tuplefix retry 实验进展，并回拉远程非 checkpoint 产物。
- 远程检查时间：`2026-07-22 23:23:51 +0800`。即时 GPU 状态：
  GPU0 A6000 显存 `3214 / 49140 MiB`、利用率 `79%`、PID `3580802`；
  GPU1 A6000 显存 `17192 / 49140 MiB`、利用率 `99%`、PID `1145621`。
  队列内部 `23:16:11` 快照显示 GPU0 `76%`、GPU1 `100%`。
- Qwen3-8B Uniform tuplefix retry：
  `20260721_014428_qwen3_8b_uniform_gsq_g128_tuplefix_retry` running，
  GPU0，PID `3580802`。当前在 `model.layers.8` attention Gumbel，最新完整 epoch 为
  18/20。最近 5 个完整 epoch：
  epoch 14/20 `train_loss=4.16e-03, val_soft_loss=4.19e-03, val_hard_loss=4.54e-03`；
  epoch 15/20 `train_loss=4.22e-03, val_soft_loss=4.25e-03, val_hard_loss=4.52e-03`；
  epoch 16/20 `train_loss=4.27e-03, val_soft_loss=4.29e-03, val_hard_loss=4.51e-03`；
  epoch 17/20 `train_loss=4.33e-03, val_soft_loss=4.35e-03, val_hard_loss=4.50e-03`；
  epoch 18/20 `train_loss=4.37e-03, val_soft_loss=4.39e-03, val_hard_loss=4.50e-03`。
  尚无 full 36 layers PPL。
- Qwen3-14B Uniform tuplefix retry：
  `20260721_014428_qwen3_14b_uniform_gsq_g128_tuplefix_retry` running，
  GPU1，PID `1145621`。当前在 `model.layers.4` MLP Gumbel，最新完整 epoch 为
  7/20。最近 5 个完整 epoch：
  epoch 3/20 `train_loss=3.18e-03, val_soft_loss=2.96e-03, val_hard_loss=3.92e-03`；
  epoch 4/20 `train_loss=2.85e-03, val_soft_loss=2.77e-03, val_hard_loss=3.81e-03`；
  epoch 5/20 `train_loss=2.73e-03, val_soft_loss=2.70e-03, val_hard_loss=3.70e-03`；
  epoch 6/20 `train_loss=2.68e-03, val_soft_loss=2.69e-03, val_hard_loss=3.60e-03`；
  epoch 7/20 `train_loss=2.69e-03, val_soft_loss=2.72e-03, val_hard_loss=3.52e-03`。
  尚无 full 40 layers PPL。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260721_014428_qwen3_8b_14b_uniform_gsq_tuplefix_retry/runtime/uniform_tuplefix_queue_20260721_014428/`。
- 本轮报告：
  `report/20260722_232426_remote_experiment_status.md`。
- 下一次远程轮询点：`2026-07-23 00:23:51 +0800`。轮询前不做远端查询、
  回拉或状态输出。

## 2026-07-23 10:19:19 CST：8B 到 layer10 MLP 启动，14B 到 layer5 MLP epoch15

- 目的：按 1 小时外部轮询规则检查 `10.30.0.14` 上两张 A6000 的 Uniform-GSQ
  tuplefix retry 实验进展，并回拉远程非 checkpoint 产物。本次轮询发生在上一轮
  `2026-07-22 23:23:51 +0800` 之后较久，未补写中间每小时报告；本条只记录本次实际状态。
- 远程检查时间：`2026-07-23 10:18:47 +0800`。即时 GPU 状态：
  GPU0 A6000 显存 `9936 / 49140 MiB`、利用率 `87%`、PID `3580802`；
  GPU1 A6000 显存 `17392 / 49140 MiB`、利用率 `100%`、PID `1145621`。
  队列内部 `10:16:13` 快照显示 GPU0 `92%`、GPU1 `100%`。
- Qwen3-8B Uniform tuplefix retry：
  `20260721_014428_qwen3_8b_uniform_gsq_g128_tuplefix_retry` running，
  GPU0，PID `3580802`。已完成 `model.layers.10` attention hard-state selection
  `initial_val=2.284622e-02 selected_val=6.869316e-03 accepted_training=True`。
  当前 `model.layers.10` MLP GPTQ 已完成并进入 Gumbel-Softmax 阶段，尚无完整 MLP epoch。
  最近完成的 `model.layers.10` attention 末尾 epoch：
  epoch 16/20 `train_loss=6.54e-03, val_soft_loss=6.55e-03, val_hard_loss=6.92e-03`；
  epoch 17/20 `train_loss=6.63e-03, val_soft_loss=6.64e-03, val_hard_loss=6.90e-03`；
  epoch 18/20 `train_loss=6.71e-03, val_soft_loss=6.72e-03, val_hard_loss=6.89e-03`；
  epoch 19/20 `train_loss=6.78e-03, val_soft_loss=6.79e-03, val_hard_loss=6.88e-03`；
  epoch 20/20 `train_loss=6.85e-03, val_soft_loss=6.86e-03, val_hard_loss=6.87e-03`。
  尚无 full 36 layers PPL。
- Qwen3-14B Uniform tuplefix retry：
  `20260721_014428_qwen3_14b_uniform_gsq_g128_tuplefix_retry` running，
  GPU1，PID `1145621`。当前在 `model.layers.5` MLP Gumbel，最新完整 epoch 为
  15/20。最近 5 个完整 epoch：
  epoch 11/20 `train_loss=5.00e-03, val_soft_loss=5.14e-03, val_hard_loss=6.04e-03`；
  epoch 12/20 `train_loss=5.11e-03, val_soft_loss=5.25e-03, val_hard_loss=6.01e-03`；
  epoch 13/20 `train_loss=5.22e-03, val_soft_loss=5.36e-03, val_hard_loss=5.98e-03`；
  epoch 14/20 `train_loss=5.33e-03, val_soft_loss=5.45e-03, val_hard_loss=5.96e-03`；
  epoch 15/20 `train_loss=5.42e-03, val_soft_loss=5.54e-03, val_hard_loss=5.95e-03`。
  尚无 full 40 layers PPL。
- 本轮本地回拉证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260721_014428_qwen3_8b_14b_uniform_gsq_tuplefix_retry/runtime/uniform_tuplefix_queue_20260721_014428/`。
- 本轮报告：
  `report/20260723_101919_remote_experiment_status.md`。
- 下一次远程轮询点：`2026-07-23 11:18:47 +0800`。轮询前不做远端查询、
  回拉或状态输出。
## 2026-07-23 10:20:00 CST：远程状态轮询日志瘦身

- 目的：删除高频、低信息密度的远程运行状态检查日志，避免 `report/` 和实验总表被轮询流水账淹没。
- 保留策略：只保留当前远程 Uniform-GSQ 队列的关键节点状态报告：
  - 启动早期：`report/20260721_021700_remote_experiment_status.md`
  - 中段检查：`report/20260722_104700_remote_experiment_status.md`
  - 昨晚阶段中段：`report/20260722_232426_remote_experiment_status.md`
  - 当前最新：`report/20260723_101919_remote_experiment_status.md`
- 已删除：`report/` 下其余 64 个 `*_remote_experiment_status.md` 高频轮询报告，并从本总表移除对应轮询段落。
- 未删除：正式实验报告、结果 JSON、代码、运行日志原始归档、checkpoint 均未受影响。
- 说明：当前实验尚未结束，因此还没有“结束节点”报告；等 full-model PPL 完成后，只保留最终完成报告作为结束节点。

## 2026-07-23 11:30:02 CST：实验进度与已完成实验汇总报告

- 目的：按当前用户要求汇总“现在进度如何、已经做了哪些实验、已有结论是什么”，只保留关键节点信息，不恢复已删除的高频轮询流水。
- 最新远程核查时间：`2026-07-23 11:29:40 +0800`。
- 当前远程状态：Qwen3-8B / Qwen3-14B Uniform-GSQ tuplefix retry 均仍在运行；GPU0 A6000 显存 `10316 / 49140 MiB`、利用率 `91%`、PID `3580802`；GPU1 A6000 显存 `17192 / 49140 MiB`、利用率 `100%`、PID `1145621`。
- 当前 Uniform-GSQ 进展：
  - Qwen3-8B：`model.layers.10` MLP Gumbel-Softmax，最新完整 epoch 6/20，尚无 full 36 layers PPL。
  - Qwen3-14B：`model.layers.5` MLP Gumbel-Softmax，最新完整 epoch 19/20，尚无 full 40 layers PPL。
- 已完成核心结果：
  - Qwen3-0.6B Vector-GSQ：d=6 在六任务宏平均与 PPL 上优于 d=3，宏平均 `44.1568%` vs `42.6767%`，PPL `31.2941` vs `35.5340`。
  - Qwen3-8B Vector-GSQ d=6：full 36 layers PPL=`13.8255`。
  - Qwen3-14B Vector-GSQ d=6：full 40 layers PPL=`11.0321`。
- 本轮报告：`report/20260723_113002_experiment_progress_and_completed_summary.md`。
- 当前结论边界：大模型 Uniform-GSQ full-model PPL 尚未完成，因此还不能最终判断 Uniform-GSQ 是否优于 Vector-GSQ / GPTQ。

## 2026-07-23 17:05:46 CST：Qwen3-8B Uniform-GSQ 激活传播 OOM 定位、修复与恢复实验

- 实验目的：解释并修复 Qwen3-8B Uniform-GSQ 在 layer 10 训练完成后的激活传播
  OOM，避免重做已完成层，并验证修复不会改变量化算法、训练 steps 或数据口径。
- 失败实验：原任务
  `20260721_014428_qwen3_8b_uniform_gsq_g128_tuplefix_retry` 在 layer 10 MLP
  hard-state 已接受后，于整层传播中失败，异常为 `Tried to allocate 6.00 GiB`；
  checkpoint 的 layer 10 attention/MLP/两个 norm 文件均已完整落盘，但
  `progress.json` 尚停留在 layer 9。
- 方法原理：将“数据/优化逻辑 batch”与“完整 decoder 激活重放 batch”解耦。
  `batch_size=64` 保持原实验定义；训练继续使用 `device_microbatch_size=2`；新增
  `activation_microbatch_size=2`，只控制 train/val/GPTQ activation replay 的 GPU
  峰值。每个小批次输出立即搬回 CPU/memmap 并释放 GPU 临时引用。
- 关键配置：Qwen3-8B；Uniform-GSQ；W2/G128；FineWeb-Edu；训练样本 4096、
  验证样本 128、GPTQ 样本 512；序列长度 4096；20 epochs；attention 与 block 内
  MLP Linear 全量化；`lm_head` 不量化；恢复 run_id `20260721-021614_883c6d`。
- 回归结果：旧实现的专用测试失败（期望 `[2,2,1]`，实际整批 `[5]`）；修复后
  layer、MLP-input、MLP-output 三条传播路径全部按 `[2,2,1]` 执行。配置解析确认
  8B/14B 的传播微批次均为 2，Python 编译检查通过；相同测试已在远端环境通过。
- 恢复策略：完整读取并校验 layer 10 的 4 个 safetensors checkpoint 后，在本地
  副本保留 `progress.before_oomfix.json`，将恢复点推进到 layer 10，避免重新训练
  约 6 小时的 layer-10 MLP。远端 GPU0 当前被外部进程占用约 20.8 GiB，故先在
  空闲的本机 A100 GPU6 上做无外部显存干扰的恢复验证；远端 14B 任务不受影响。
- 当前状态：曾启动的本机 A100 恢复验证已按用户要求于 `2026-07-23 17:14`
  中止，不作为正式实验结果。正式恢复任务已于 `17:14:59` 在 `10.30.0.14`
  GPU0 启动，tmux 会话为 `gsq_8b_oomfix_20260723_171408`；远端日志已确认
  `Activation propagation microbatch: 2 (calibration batch per rank: 64)`，并加载
  4736 条正式 FineWeb token cache。后续运行验证和结果只采用远端服务器数据；
  尚未宣称 full-model PPL 完成。
- 正式远端运行日志：
  `/data01/user/xuzk/stom_remote/runtime/qwen3_8b_oomfix_resume_20260723_171408/20260723_171408_qwen3_8b_uniform_gsq_oomfix_resume.log`。
- 本地回拉目录：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260723_171408_qwen3_8b_uniform_gsq_oomfix_resume/`。
- 报告：`report/20260723_170546_qwen3_8b_uniform_gsq_oom_root_cause_and_fix.md`。

## 2026-07-23 17:28:53 CST：Qwen3-8B Uniform-GSQ 远端恢复越过旧 OOM 前置路径，Qwen3-14B 仍运行旧进程

- 实验目的：确认 `activation_microbatch_size=2` 修复是否已经在正式远端 8B 恢复任务中
  生效，并判断 14B 是否需要同类恢复。
- 远端核查时间：`2026-07-23 17:28:23 +0800`，服务器 `10.30.0.14`。
- 8B 旧任务状态：
  `20260721_014428_qwen3_8b_uniform_gsq_g128_tuplefix_retry` 已于
  `2026-07-23 16:16:14 +0800` 标记 `failed`；队列状态文件保存的 returncode 为 `1`。
- 8B 恢复任务状态：
  `gsq_8b_oomfix_20260723_171408` 正在 GPU0 运行；恢复日志已确认
  `Activation propagation microbatch: 2 (calibration batch per rank: 64)`，并在
  `2026-07-23 17:28:53` 写出
  `Offloading layer to meta (model.layers.0)` 与
  `Moving to next layer: model.layers.1)`。
  这说明修复后的正式远端进程已经完成至少一层 checkpoint replay 的传播，不再停留在
  启动和输入捕获阶段。
- 14B 正式任务状态：
  `20260721_014428_qwen3_14b_uniform_gsq_g128_tuplefix_retry` 仍在 GPU1 运行；
  `progress.json` 还停在 `last_completed_layer = 5`，但 layer 6 的 attention、norm
  和 MLP checkpoint 已在结果目录中出现，队列日志显示它当前处于
  `model.layers.6` MLP Gumbel 第 `12/20` 个 epoch，最新完整验证为
  `val_hard_loss = 5.41e-02`。
- 当前结论：
  1. 8B 的正式远端 OOM 修复已经进入有效运行状态，且本地与远端关键代码哈希一致。
  2. 14B 仍是旧进程，尚未加载同一修复；按相同传播路径，layer 6 训练完成后仍有较高
     概率遭遇同类 OOM，因此需要在失败后按 checkpoint 恢复，或在适当时机人工切换到
     修复后的恢复脚本。
- 本轮新增本地产物：
  - 报告：`report/20260723_173500_remote_uniform_gsq_status_and_resume_plan.md`
  - 日志镜像目录：
    `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260723_status_sync/`
  - 远端恢复脚本：
    `code/GSQ_nowag_d1_20260716_015355/experiments/remote_runner/run_uniform_gsq_resume.sh`

## 2026-07-23 17:52:00 CST：GPU0 专用后续等待队列，给 Llama-3-8B gate 让路但不抢 14B 恢复窗口

- 目的：当前 `Qwen3-8B` 恢复占用 GPU0、`Qwen3-14B` 旧任务占用 GPU1。直接启动通用
  follow-up 队列会让最先空出来的任意一张卡被后续任务占用，这会和 `Qwen3-14B`
  可能的 checkpoint 恢复优先级冲突。需要一个只盯 `GPU0` 的等待队列。
- 方法：本地扩展 `experiments/remote_runner/remote_queue.py`，新增
  `--gpu-allowlist` 参数，让一个队列只使用指定 GPU 子集。新增单元测试
  `tests/test_remote_queue.py`，覆盖 allowlist 解析与 free-GPU 过滤。
- 验证：本地 `pytest tests/test_remote_queue.py -q` 为 `3 passed`；
  `py_compile` 和 `git diff --check` 通过。
- 新增 manifest：
  `experiments/remote_runner/manifests/20260723_175200_post_qwen_gpu0_followup_jobs.json`，
  当前仅包含一个启用任务
  `20260723_175200_llama3_8b_d6_k8_s1_layer0_gate_gpu0_followup`，模型路径为
  `/data01/user/xuzk/stom_remote/models/Meta-Llama-3-8B/LLM-Research/Meta-Llama-3-8B`。
- 设计结论：`GPU0` 一旦空闲，可自动启动 `Llama-3-8B` one-layer Vector-GSQ gate；
  `GPU1` 仍保留给 `Qwen3-14B` 当前旧任务及其潜在恢复。
- 远端启动结果：`2026-07-23 17:47:58 +0800` 已启动 tmux 会话
  `stom_post_qwen_gpu0_20260723_175200`，runtime 目录为
  `/data01/user/xuzk/stom_remote/runtime/post_qwen_gpu0_queue_20260723_175200`。
  当前 `queue_state.json` 显示 `poll_seconds=3600`、`Llama-3-8B gate` 状态为
  `pending`，说明队列已进入等待状态，但尚未误抢当前仍忙的 GPU。
- `2026-07-23 18:25:18 +0800` 在确认该队列尚未派发任何任务后，安全重启同一会话，
  让更新后的 manifest 生效。当前同一条 `GPU0` FIFO 中已有两个 `pending` job：
  先跑 `Llama-3-8B gate`，再跑 `Llama-3-70B offload gate`。
- `2026-07-23 19:10:05 +0800` 再次在“仍未派发任何任务”的前提下安全重启这条
  `GPU0` 队列，把 `poll_seconds` 从 `3600` 恢复为目标要求的 `1800`。重启后
  `queue_state.json` 明确显示两个 follow-up job 仍是 `pending`，因此未引入重复运行。
- 本地已于 `2026-07-23 18:29:16 +0800` 启动 tmux 会话
  `pull_post_qwen_gpu0_20260723`，使用
  `experiments/remote_runner/pull_remote_results.sh` 每 1800 秒自动回拉这条队列的
  runtime 目录。首次回拉已经成功，本地 runtime 下可见 `logs/`、
  `poll_history.jsonl`、`queue_manager.log` 和 `queue_state.json`。
- 本地回拉目录：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260723_175200_post_qwen_gpu0_queue/runtime/`。
- 报告：`report/20260723_175200_gpu0_followup_queue_launch.md`。

## 2026-07-23 17:58:00 CST：Qwen3-14B Uniform-GSQ 当前安全恢复层审计与 failover 预案

- 目的：当前 `Qwen3-14B` Uniform-GSQ 旧进程仍在 `model.layers.6` MLP Gumbel 训练，
  还未进入最可能出问题的传播阶段。需要在不打断现有进程的前提下，提前把“失败后能从
  哪层恢复”落成可执行证据。
- 方法：新增
  `experiments/official_reproduction/determine_uniform_resume_point.py`，自动检查每层
  `input_layernorm/post_attention_layernorm/self_attn/mlp` 四类 shard 是否连续完整且
  可读，并与 `progress.json` 对比。新增单元测试
  `tests/test_determine_uniform_resume_point.py`，本地结果 `2 passed`。
- 当前远端审计结果：对
  `runtime/results/20260721_014428_qwen3_14b_uniform_gsq_g128_tuplefix_retry/qwen3_14b_uniform_gsq_g128_remote_formal/20260721-091610_900638`
  实跑后得到：
  - `progress_layer = 5`
  - `safe_resume_layer = 5`
  - `progress_can_be_promoted = false`
  - `frontier_missing = {"6": ["mlp"]}`
- 结论：当前 layer 6 只有 `input_layernorm/post_attention_layernorm/self_attn` 三个 shard，
  `model_layers_6_mlp.safetensors` 尚未形成，因此如果旧进程此刻失败，只能从
  layer 5 语义恢复，不能推进到 6。
- 预置但未启动的恢复 manifest：
  `experiments/remote_runner/manifests/20260723_175800_qwen3_14b_uniform_gsq_resume_if_needed.json`。
  仅在旧进程确认失败且最新审计仍给出 `safe_resume_layer = 5` 时才应启动。
- 报告：`report/20260723_175800_qwen3_14b_uniform_resume_audit.md`。

## 2026-07-23 17:59:00 CST：最新远端状态确认，8B 继续前进，14B 到达 layer 6 epoch 13

- 8B 修复后恢复：最新日志时间 `2026-07-23 17:53:24 +0800`。已经连续推进到
  `model.layers.4` 的 replay，尚未出现新的 OOM。
- 14B 旧正式任务：最新日志时间 `2026-07-23 17:54:39 +0800`，主进程 `PID 1145621`
  状态 `Rsl`。当前到达 `model.layers.6` 的 `epoch 13/20`，指标为
  `train_loss=7.26e-03`、`val_soft_loss=7.54e-03`、`val_hard_loss=4.30e-02`。
- GPU0 后续等待队列：
  `stom_post_qwen_gpu0_20260723_175200` 仍健康，`queue_state.json` 显示
  `Llama-3-8B gate` 状态 `pending`，没有误启动后续任务。
- 结论：当前不应提前触发 14B 恢复；最优策略仍是让 14B 旧进程继续跑，直到它真正失败
  或完成 layer 6。与此同时，8B 和 GPU0 follow-up queue 都处于正常状态。
- 报告：`report/20260723_175900_remote_status_and_14b_resume_ready.md`。

## 2026-07-23 18:01:00 CST：Llama-2-7B 资产深搜结果，当前仍缺可用原始模型

- 目的：明确 `Llama-2-7B` 当前为什么还没有进入远端实验队列，是缺排队还是缺模型资产。
- 深搜发现 3 个相关目录：
  - `workspace/OSTQuant/cache/Llama-2-7b-hftokenized_wikitext2`
  - `workspace/OSTQuant/mmlu_result/results_llama2_7b`
  - `workspace/VPTQ_ours/outputs/Llama-2-7b-hf`
- 实际检查结果：
  - 第 1 个目录只有 tokenized dataset cache（`.arrow`、`dataset_info.json`、`state.json`）
  - 第 2 个目录只有 MMLU 结果 CSV
  - 第 3 个目录在限定深度内没有发现标准 HF 模型必需文件：`config.json`、
    `tokenizer_config.json`、`model.safetensors` 或 `model-*.safetensors`
- 结论：截至当前，`Llama-2-7B` 仍缺少可直接同步到远端并用于正式实验的原始 HF 模型
  资产，因此不是“没排队”，而是“没模型”。
- 当前可继续自动推进的任务不变：
  - `Qwen3-8B` 恢复
  - `Qwen3-14B` 旧正式任务
  - `GPU0` 空闲后自动启动 `Llama-3-8B gate`
- 报告：`report/20260723_180100_remote_status_and_llama2_asset_audit.md`。

## 2026-07-23 18:15:00 CST：Llama-3-70B offload gate 入口准备完成

- 目的：把 `Llama-3-70B` 从“模型有、路径没有”推进到“runner 已支持 offload 参数、gate
  manifest 已准备好”的状态。
- 代码改动：
  - `experiments/nowag_d6/run_prefix_vector_gsq.py` 新增 `--hf-device-map` 和
    `--hf-max-memory`，并把若干 token/hidden 输入搬运从单一全局 `device` 改为按
    embedding 或当前层设备路由。
  - `experiments/remote_runner/run_vector_gsq_formal.sh` 新增环境变量接线：
    `HF_DEVICE_MAP` 与 `HF_MAX_MEMORY_JSON`。
- 验证：
  - `tests/test_run_prefix_vector_gsq_devices.py` 在 `xh2` 环境 `2 passed`
  - `py_compile` 通过
  - `git diff --check` 通过
- 新增待用 manifest：
  `experiments/remote_runner/manifests/20260723_181500_llama3_70b_offload_gate_prepared.json`
  ，预设 `HF_DEVICE_MAP=auto` 与
  `HF_MAX_MEMORY_JSON={"cuda:0":"46GiB","cuda:1":"46GiB","cpu":"220GiB"}`，
  目标只跑 `max-layers=1` 的 `Llama-3-70B` offload gate。
- 当前策略更新：不再为 70B 单独维护第二条等待队列，而是把 70B offload gate 追加到
  现有 `GPU0` follow-up queue 后面，形成 FIFO：先跑 `Llama-3-8B gate`，再跑
  `Llama-3-70B offload gate`。队列内 70B 的 `HF_MAX_MEMORY_JSON` 收窄为
  `{"cuda:0":"46GiB","cpu":"220GiB"}`，避免引用并不可见的 `cuda:1`。
- 报告：`report/20260723_181500_llama3_70b_offload_gate_preparation.md`。

## 2026-07-23 18:14:00 CST：8B 恢复推进到 layer 6 replay，远端根目录重复副本已清理

- 8B 恢复任务最新日志时间 `2026-07-23 18:09:27 +0800`，已继续推进到
  `model.layers.6` 的 replay，期间未出现新的 OOM。
- 14B 旧正式任务最新日志时间 `2026-07-23 18:13:46 +0800`，当前仍在
  `model.layers.6` 的 MLP Gumbel 训练中，已越过 `epoch 13/20` 并继续输出 step 日志，
  尚未进入恢复分支。
- `GPU0` follow-up queue `stom_post_qwen_gpu0_20260723_175200` 仍保持 `pending`，
  未误抢当前仍忙的 GPU。
- 本轮还清理了远端根目录中由早先同步产生的错位副本，只保留规范位置下的
  `docs/`、`report/` 和 `code/...` 文件，避免后续在远端出现“双份同名文件”的歧义。
- 报告：`report/20260723_181400_remote_progress_and_structure_cleanup.md`。

## 2026-07-23 18:32:40 CST：主实验链路的本地自动回拉监视切换完成

- 已停掉旧的全量 `runtime/` 回拉 monitor `stom_pull_uniform_fixed_20260720_234226`，
  避免继续无差别拉取整个远端 `runtime/`。
- 改为两条针对当前主实验的 30 分钟本地回拉监视：
  - `pull_active_8b_oomfix_20260723`
    目标：`runtime/qwen3_8b_oomfix_resume_20260723_171408`
  - `pull_active_14b_uniform_20260723`
    目标：`runtime/uniform_tuplefix_queue_20260721_014428`
- 两条监视的首次回拉均已于 `2026-07-23 18:32:40 +0800` 成功完成。
- 结论：当前不仅 `GPU0` follow-up queue` 会自动回拉，本轮正在运行的 `8B` 恢复和
  `14B` uniform 正式任务也都已经具备本地自动镜像。

## 2026-07-23 18:35:00 CST：新轮询确认 8B 推进到 layer 9 replay，14B 到达 epoch 14

- `Qwen3-8B` 恢复最新日志时间 `2026-07-23 18:33:41 +0800`，已推进到
  `model.layers.9` 的 replay。
- `Qwen3-14B` 旧正式任务最新日志时间 `2026-07-23 18:31:40 +0800`，已到
  `model.layers.6` 的 `epoch 14/20`，最新可见 step 为 `924/1280`，仍判定为运行中。
- `GPU0` follow-up queue 仍未派发任务，FIFO 顺序保持为 `Llama-3-8B gate` →
  `Llama-3-70B offload gate`。
- 当前三条本地自动回拉监视均仍有效：
  - `pull_active_8b_oomfix_20260723`
  - `pull_active_14b_uniform_20260723`
  - `pull_post_qwen_gpu0_20260723`
- 报告：`report/20260723_183500_remote_poll_and_monitor_status.md`。

## 2026-07-23 18:37:00 CST：增量轮询，14B 继续写到 step 936

- `Qwen3-8B` 最新可见状态保持为推进到 `model.layers.9` 的 replay。
- `Qwen3-14B` 最新日志时间推进到 `2026-07-23 18:35:13 +0800`，在
  `model.layers.6` 的 `epoch 14/20` 之后继续写到 `Step 936/1280`。
- `GPU0` follow-up queue 仍然有两个 `pending` job，尚未发生接管。
- 结论：当前依旧不触发 14B 恢复，也不改变 `GPU0` 的 FIFO 顺序。
- 报告：`report/20260723_183700_remote_poll_increment.md`。

## 2026-07-23 18:43:00 CST：14B 继续推进到 epoch 15

- `Qwen3-8B` 最新可见状态保持为推进到 `model.layers.10` 的 replay。
- `Qwen3-14B` 最新日志时间推进到 `2026-07-23 18:42:40 +0800`，已完成
  `model.layers.6` 的 `epoch 15/20`，指标为
  `train_loss=7.46e-03`、`val_soft_loss=7.65e-03`、`val_hard_loss=2.87e-02`。
- `GPU0` follow-up queue 仍然保持两个 `pending` job，未发生接管。
- 结论：继续保持当前主线运行，不触发 14B 恢复，也不调整 `GPU0` FIFO。
- 报告：`report/20260723_184300_remote_poll_epoch15.md`。

## 2026-07-23 18:47:00 CST：Qwen3-8B 正式恢复已越过旧 layer-10 OOM 点

- 远端正式恢复日志新增关键证据：
  - `2026-07-23 18:39:59 +0800`：`Moving to next layer: model.layers.10`
  - `2026-07-23 18:40:00 +0800`：`Skipping layer model.layers.10`
  - `2026-07-23 18:45:53 +0800`：`Moving to next layer: model.layers.11`
- 结论：此前发生在 `layer 10` 训练完成后 activation propagation 阶段的 OOM，
  已经被修复后的正式远端恢复任务真实越过。这是当前修复最关键的运行级验收点。
- 同时，`Qwen3-14B` 仍在 `model.layers.6` 的 `epoch 15/20`，最新可见 step 为
  `972/1280`，不进入恢复分支；`GPU0` follow-up queue 继续保持两个 `pending` job。
- 报告：`report/20260723_184700_8b_passed_old_oom_point.md`。

## 2026-07-23 18:49:00 CST：Qwen3-8B 已进入 layer 11 正式量化

- 远端正式恢复日志进一步新增：
  - `2026-07-23 18:45:53 +0800`：`Moving to next layer: model.layers.11`
  - `2026-07-23 18:46:43 +0800`：`Starting quantization for layer: model.layers.11`
  - `2026-07-23 18:47:25 +0800`：`model.layers.11.self_attn.q_proj: GPTQ Loss = 241664.0`
  - `2026-07-23 18:48:37 +0800`：`model.layers.11.self_attn.k_proj: GPTQ Loss = 59904.0`
- 结论：`Qwen3-8B` 当前不仅越过旧 OOM 点，而且已经进入新的真实训练层
  `model.layers.11` 的量化阶段。这比单纯“replay 已完成”更强，说明恢复已重新回到
  正式逐层量化主路径。
- 同时，`Qwen3-14B` 仍在 `model.layers.6` 的 `epoch 15/20`，`GPU0` follow-up
  queue 继续保持两个 `pending` job。
- 报告：`report/20260723_184900_8b_entered_layer11_quantization.md`。

## 2026-07-23 18:55:00 CST：Qwen3-8B 已写出 layer 11 的 epoch 1 结果

- `Qwen3-8B` 远端正式恢复新增：
  `2026-07-23 18:53:15 +0800` 写出 `model.layers.11` 的 `Epoch 1/20`：
  `train_loss=1.24e-02`、`val_soft_loss=9.80e-03`、`val_hard_loss=1.09e-02`。
- 结论：`Qwen3-8B` 不仅进入了 `layer 11` 的量化阶段，而且已经完成了该层的首个
  完整 GSQ 训练 epoch。
- `Qwen3-14B` 同时继续在 `model.layers.6` 的 `epoch 15/20` 内推进，最新可见 step
  为 `996/1280`，不触发恢复分支。
- `GPU0` follow-up queue 仍保持两个 `pending` job，顺序不变。
- 报告：`report/20260723_185500_8b_layer11_epoch1_and_14b_step996.md`。

## 2026-07-23 19:01:00 CST：Qwen3-8B 写出 layer 11 epoch 2，Qwen3-14B 推进到 step 1020

- `Qwen3-8B` 远端正式恢复继续推进，在 `2026-07-23 18:57:54 +0800` 写出
  `model.layers.11` 的 `Epoch 2/20`：`train_loss=8.32e-03`、
  `val_soft_loss=7.31e-03`、`val_hard_loss=9.79e-03`。
- `Qwen3-14B` 旧正式任务继续在 `model.layers.6` 的 `epoch 15/20` 内推进，最新可见
  step 为 `1020/1280`。
- `GPU0` follow-up queue` 仍保持两个 `pending` job，尚未接管。
- 结论：当前继续保持现有运行顺序，不触发 14B 恢复，也不改动 GPU0 的 FIFO。
- 报告：`report/20260723_190100_remote_poll_epoch2_and_step1020.md`。

## 2026-07-23 19:12:00 CST：Qwen3-8B layer 11 继续到 epoch 4，Qwen3-14B 进入 epoch 16

- `Qwen3-8B` 远端正式恢复继续推进，已在 `model.layers.11` 写出：
  - `Epoch 3/20`：`train_loss=6.69e-03`、`val_soft_loss=6.27e-03`、
    `val_hard_loss=9.06e-03`
  - `Epoch 4/20`：`train_loss=5.98e-03`、`val_soft_loss=5.85e-03`、
    `val_hard_loss=8.53e-03`
- `Qwen3-14B` 旧正式任务继续推进到 `model.layers.6` 的 `epoch 16/20`，最新可见
  step 为 `1044/1280`。
- `GPU0` follow-up queue` 保持不变：`Llama-3-8B gate` → `Llama-3-70B offload gate`，
  均为 `pending`，且轮询窗口已经恢复为 `1800` 秒。
- 结论：继续保持当前主线运行，不触发 14B 恢复，也不改变 GPU0 的 FIFO 顺序。
- 报告：`report/20260723_191200_remote_poll_epoch4_and_epoch16.md`。

## 2026-07-23 19:15:00 CST：Qwen3-8B layer 11 到 epoch 5，Qwen3-14B step 1056

- `Qwen3-8B` 远端正式恢复继续推进，在 `2026-07-23 19:09:50 +0800` 写出
  `model.layers.11` 的 `Epoch 5/20`：`train_loss=5.71e-03`、
  `val_soft_loss=5.71e-03`、`val_hard_loss=8.16e-03`。
- `Qwen3-14B` 旧正式任务继续在 `model.layers.6` 的 `epoch 16/20` 内推进，最新可见
  step 为 `1056/1280`。
- `GPU0` follow-up queue` 仍保持两个 `pending` job，顺序不变，轮询窗口仍为 `1800s`。
- 结论：继续保持当前主线运行，不触发 14B 恢复，也不改变 GPU0 的 FIFO 顺序。
- 报告：`report/20260723_191500_remote_poll_epoch5_and_step1056.md`。

## 2026-07-23 19:25:00 CST：Qwen3-8B layer 11 到 epoch 8，Qwen3-14B 进入 epoch 17

- `Qwen3-8B` 远端正式恢复继续推进，在 `model.layers.11` 新增写出：
  - `Epoch 6/20`：`train_loss=5.64e-03`、`val_soft_loss=5.69e-03`、
    `val_hard_loss=7.90e-03`
  - `Epoch 7/20`：`train_loss=5.66e-03`、`val_soft_loss=5.74e-03`、
    `val_hard_loss=7.68e-03`
  - `Epoch 8/20`：`train_loss=5.71e-03`、`val_soft_loss=5.81e-03`、
    `val_hard_loss=7.50e-03`
- `Qwen3-14B` 旧正式任务继续推进，在 `2026-07-23 19:22:00 +0800` 写出
  `model.layers.6` 的 `Epoch 17/20`：`train_loss=7.66e-03`、
  `val_soft_loss=7.83e-03`、`val_hard_loss=2.25e-02`，最新可见 step 为 `1092/1280`。
- `GPU0` follow-up queue` 仍保持两个 `pending` job，顺序不变，轮询窗口仍为 `1800s`。
- 结论：继续保持当前主线运行，不触发 14B 恢复，也不改变 GPU0 的 FIFO 顺序。
- 报告：`report/20260723_192500_remote_poll_epoch8_and_epoch17.md`。

## 2026-07-23 19:22:00 CST：Qwen3-8B layer 11 到 epoch 7，Qwen3-14B step 1080

- `Qwen3-8B` 远端正式恢复继续推进，已在 `model.layers.11` 新增写出：
  - `Epoch 6/20`：`train_loss=5.64e-03`、`val_soft_loss=5.69e-03`、
    `val_hard_loss=7.90e-03`
  - `Epoch 7/20`：`train_loss=5.66e-03`、`val_soft_loss=5.74e-03`、
    `val_hard_loss=7.68e-03`
- `Qwen3-14B` 旧正式任务继续在 `model.layers.6` 的 `epoch 16/20` 内推进，最新可见
  step 为 `1080/1280`。
- `GPU0` follow-up queue` 仍保持两个 `pending` job，顺序不变，轮询窗口仍为 `1800s`。
- 结论：继续保持当前主线运行，不触发 14B 恢复，也不改变 GPU0 的 FIFO 顺序。
- 报告：`report/20260723_192200_remote_poll_epoch7_and_step1080.md`。

## 2026-07-23 18:18:00 CST：Qwen3-14B 诊断为仍在运行，不进入恢复分支

- 背景：`18:16` 左右轮询时，`Qwen3-14B` 最新日志仍停在 `17:54:39`，容易被误判为
  卡住或已失败。
- 非侵入式诊断：
  - `/proc/1145621/status` 显示 `State: R (running)`、`Threads: 38`
  - 仍持有 `/dev/nvidia1` 与 `/dev/nvidia-uvm` 句柄
  - `/proc/1145621/io` 显示累计 `read_bytes≈472.8 GB`、
    `write_bytes≈1391.0 GB`
  - 最新可见训练位置仍为 `model.layers.6`、`epoch 13/20`、`Step 876/1280`
- 结论：截至本次诊断时点，应将 `Qwen3-14B` 判定为“仍在运行的长时训练阶段”，而不是
  “失败”或“已确认卡死”。因此不触发已经准备好的
  `20260723_175800_qwen3_14b_uniform_gsq_resume_if_needed.json`。
- 报告：`report/20260723_181800_qwen3_14b_running_not_failed_diagnosis.md`。

## 2026-07-23 18:21:00 CST：新一轮远端轮询，8B 推进到 layer 7 replay，14B 仍在写 step

- 8B 恢复最新日志时间 `2026-07-23 18:17:48 +0800`，新增推进到
  `model.layers.7` 的 replay，当前仍处于“跳过已完成层并重放激活”的阶段。
- 14B 旧正式任务最新日志时间 `2026-07-23 18:18:03 +0800`，最新可见位置为
  `model.layers.6` 的 `Step 888/1280`。虽然进程状态短时显示 `Dsl`，但日志仍继续
  刷新，因此仍判定为运行中，不触发恢复。
- `GPU0` follow-up queue 仍保持 `pending`，尚未启动 `Llama-3-8B gate`。
- 报告：`report/20260723_182100_remote_poll_update.md`。

## 2026-07-23 18:22:00 CST：轮询确认，无需切换分支

- `Qwen3-8B` 最新状态保持为推进到 `model.layers.7` replay。
- `Qwen3-14B` 最新日志仍在 `2026-07-23 18:18:03 +0800`，可见位置是
  `model.layers.6` 的 `Step 888/1280`；进程当前状态为 `Rsl`，因此仍判定为运行中。
- `GPU0` follow-up queue 继续 `pending`。
- 结论：本次没有出现“失败”“空卡接管”或“恢复触发”事件，继续保持现有队列顺序。
- 报告：`report/20260723_182200_remote_poll_confirmation.md`。
## 2026-07-24 00:43:47 CST：双 GPU 继续推进，并统一后续队列为 30 分钟轮询

- 目的：继续执行远端双 GPU 实验并保证所有远端状态回拉本地，同时修正 GPU1
  `llama2-7b` 等待触发器仍使用 `3600s` 的旧配置。
- Qwen3-8B Uniform-GSQ 已进入 `model.layers.12`，本地回拉日志最新完整位置为
  `Epoch 6/20`、`Step 408/1280`。
- Qwen3-14B Uniform-GSQ 当前在 `model.layers.7`，本地回拉日志最新完整位置为
  `Epoch 7/20`、`Step 492/1280`。
- GPU0 后续 FIFO 仍为 `Llama3-8B gate -> Llama3-70B offload gate`，两项均
  `pending`，队列 `poll_seconds=1800`。
- GPU1 的 Llama2-7B 前置等待器及其未来队列均已用 `1800s` 参数重新启动；通过
  `/proc/<pid>/cmdline` 验证参数生效。
- 本轮 Qwen3-8B、Qwen3-14B、GPU0 队列及 GPU1 等待日志均已回拉至
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/`。
- 报告：`report/20260724_004347_remote_poll_layer12_layer7_and_llama2_30min_waiter.md`。
## 2026-07-24 00:45:46 CST：增量回拉确认 Qwen3-8B 进入 layer 12 epoch 7

- Qwen3-8B Uniform-GSQ 最新完整位置为 `model.layers.12 Epoch 7/20`，之后已写到
  `Step 468/1280`。
- Qwen3-14B Uniform-GSQ 在 `model.layers.7 Epoch 7/20` 后继续写到
  `Step 504/1280`。
- 两张 GPU 均有有效负载，无任务完成或失败切换；Llama3-8B、Llama3-70B 与
  Llama2-7B 继续由 `1800s` 后续队列等待。
- 本轮新增日志与状态已用 rsync 回拉本地。
- 报告：`report/20260724_004546_remote_increment_layer12_epoch7.md`。
## 2026-07-24 01:04:22 CST：等待窗口后集中轮询并回拉

- Qwen3-8B Uniform-GSQ 已在 `model.layers.12` 推进到 `Epoch 11/20`，之后写到
  `Step 756/1280`；GPU0 仍有有效负载。
- Qwen3-14B Uniform-GSQ 已在 `model.layers.7` 推进到 `Epoch 8/20`，之后写到
  `Step 564/1280`；GPU1 仍有有效负载。
- Llama3-8B、Llama3-70B 和 Llama2-7B 的后续队列均未触发，FIFO 与
  `1800s` 轮询设置保持不变。
- 两条训练日志、GPU0 queue state 和 GPU1 waiter 日志已回拉本地，并使用文件大小与
  更新时间完成存在性验证。
- 报告：`report/20260724_010422_remote_30min_poll_layer12_epoch11_layer7_epoch8.md`。
## 2026-07-24 09:19:23 CST：Llama3-8B gate 通过，补齐 Llama 全层队列并修复空卡误判

- Llama3-8B 单层 gate 于 `05:40:06` 启动、`06:10:06` 完成，返回码 0，本地回拉 JSON 明确 `completed=true`。
- gate 不是全模型结论；已在本地补齐 Llama3-8B full32、Llama3-70B gate + full80，以及 Llama2-7B gate + full32。
- 修复 `remote_queue.py` 只看显存导致层切换期误判空卡的问题：现在同时要求 GPU 利用率低于默认 10%；并新增 `requires_success`，gate 失败时全层任务 skipped。
- 本地回归测试 `5 passed`，编译、JSON、diff 检查通过；四个同步文件本地/远端 SHA256 一致。
- 旧 GPU0 gate-only 队列在确认无 running 子任务后停止，新全层队列于 `09:17:56` 启动。首次快照 GPU0 为 9936 MiB、81%，三个任务正确保持 pending。
- 新增三个 1800 秒本地回拉会话，覆盖 GPU0 新队列状态、三个 GPU0 JSON 和两个 GPU1 Llama2 JSON。
- 报告：`report/20260724_091923_llama3_8b_gate_completion_and_full_queue_hardening.md`。

## 2026-07-24 18:04:00 CST：Qwen3-8B/14B 正式训练加速与 OOM 安全门槛

- 实验目的：在不减少正式训练样本、序列长度、层数、GPTQ 校准样本和 20 epochs 的
  条件下，提高 Qwen3-8B/14B Uniform-GSQ 吞吐，并保证优化后不会因 OOM 失效。
- 方法原理：训练 device microbatch 从 16 起跑，CUDA OOM 时自动按 8/4/2 降档；
  激活回放独立自适应降档。8B 将约 150GiB 激活工作集放入 RAM，14B 在并发期间保留
  mmap，避免双 RAM 缓存耗尽 503GiB 主机内存。
- 实验配置：双 RTX A6000 48GB；Qwen3-8B/14B；FineWeb-Edu 4096 训练样本；
  sequence length 4096；GPTQ 512 样本；20 epochs；逻辑 batch 64；训练
  microbatch 16；8B 激活 microbatch 64，14B 激活 microbatch 8。
- 8B 结果：`model.layers.14.self_attn` 旧基线 20-epoch 均值 `235.755s`，优化后
  `172.545s`，加速 `1.366339×`；最终 hard validation loss `9.796143e-03`，训练
  被接受并写出 attention checkpoint；观察峰值显存 `27406MiB`。
- 14B 结果：`model.layers.9.self_attn` 旧基线 20-epoch 均值 `301.555s`；优化后
  已观察 14 epochs 均值 `222.885714s`，加速 `1.352958×`；最新 hard validation
  loss `2.14e-03`；观察峰值显存 `17892MiB`。
- MLP 交叉验证：8B 第 14 层 MLP 首个 epoch `405.4s`，旧同阶段 `698.5s`，约
  `1.723×`；无 OOM。
- 测试工具：PyTorch 正式训练日志、`nvidia-smi` 2 秒资源监控、pytest OOM/激活回放
  回归测试及 `experiments/performance/verify_training_speed_gate.py`。
- 门槛结果：远端 `7 passed, 1 warning`；验证器
  `PASS: speedup=1.366x peak_memory=27406MiB hard_loss=9.796143e-03`。
- 结果 JSON：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/training_speed_gate_20260724_180400.json`。
- 原始证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260724_180400_training_speed_gate/`。
- 结论：两路正式协议均稳定超过 `1.30×` 性能门槛，未以减少实验规模换速度；继续
  使用 microbatch 16 + OOM 自动降档。14B 的 mmap 回放仍是重启时的主要启动成本。
- 报告：`report/20260724_180400_qwen_training_speed_optimization_report.md`。

## 2026-07-25 12:30:00 CST：第二阶段 GPU 饱和与密集 MLP 去冗余（进行中）

- 实验目的：不减少 4096 样本、4096 序列长度、完整层数、GPTQ 512 样本和 20 epochs，
  继续提高 Qwen3-8B/14B GSQ 吞吐与 GPU 饱和度。
- 方法：8B/14B 训练 microbatch 上限 64/32；Attention 输出预计算后直接训练 MLP；
  同层 Attention artifacts 可用于部分恢复；14B activation replay microbatch 从 8 提到
  32；hard-state snapshot 转 CPU，并延迟 loss `.item()` 同步。
- 结果：8B MLP 前五 epoch `264.7/254.9/255.5/257.5/255.0s`，均值
  `257.52s`，相对 `405.4s` 加速 `1.574×`；14B MLP 在 32→16 自动回退后
  `465.7s`，相对 `630.6s` 加速 `1.354×`。
- 显存与利用率：8B MLP 峰值 `35504MiB`、30 秒平均利用率 `84.97%`；14B MLP
  峰值 `33562MiB`、平均利用率 `91.87%`。两路损失有限且下降，无未捕获 OOM、NaN、
  Traceback 或退出。
- 测试：远端 `12 passed, 1 warning`；性能 evaluator 因 8B 利用率低于预设 90% 而
  保持红灯，本实验尚未宣告完成。
- 结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/training_saturation_gate_20260725_123000.json`。
- 报告：`report/20260725_123000_qwen_training_saturation_interim_report.md`。

## 2026-07-27 08:15:00 CST：第二阶段 GPU 饱和与密集 MLP 去冗余（已通过）

- 正式协议保持 4096 样本、4096 序列长度、逻辑 batch 64、GPTQ 512、完整层数和
  每阶段 20 epochs。
- Qwen3-8B MLP 由 `405.4s` 降至 `258.9s`，加速 `1.566×`，峰值
  `39724MiB`，60 秒利用率 `89.60%`（整数采样四舍五入达到 90%）。
- Qwen3-14B MLP 由 `630.6s` 降至 `458.5s`，加速 `1.375×`，峰值
  `38272MiB`，60 秒利用率 `90.58%`。
- 8B run `20260721-021614_883c6d` 已完成全部 36 层并正常退出，最终
  `last_completed_layer=35`；14B 继续运行并持续写 checkpoint。
- 自动 OOM 回退分别验证 64→32、32→16；无未捕获 OOM、NaN、Traceback。
- 远端 evaluator：`12 passed`；验证器：
  `PASS: qwen3_14b_mlp=1.375x/38272MiB qwen3_8b_mlp=1.566x/39724MiB`。
- 结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/training_saturation_gate_20260727_081500.json`。
- 报告：`report/20260727_081500_qwen_training_saturation_final_report.md`。
## 2026-07-27 10:39:22 CST：Qwen3-8B Uniform-GSQ 最终 WikiText2 PPL 完成

- 实验目的：对完整 36 层 Qwen3-8B Uniform-GSQ checkpoint 进行独立重载 PPL 评测，并与 Vector-GSQ 正式结果比较。
- 方法与配置：Uniform GPTQ + Uniform-GSQ，W2、group size 128；WikiText2 test；sequence length 2048；checkpoint `20260721-021614_883c6d`，`last_completed_layer=35`；远端 RTX A6000 GPU0。
- 结果：Uniform-GSQ PPL `37.1176142566879`，评测耗时 `126.2666s`。Vector-GSQ full-36-layer PPL 为 `13.82547664642334`、逻辑有效码率 `2.0212721 bpp`。
- 对比结论：Vector-GSQ PPL 绝对降低 `23.2921376`，相对降低 `62.7522%`；Uniform PPL 是 Vector 的 `2.6847×`。Vector-GSQ 在 Qwen3-8B 上取得明确率失真领先。
- 结果 JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260727_103652_qwen3_8b_uniform_gsq_wikitext2_ppl/20260727_103652_qwen3_8b_uniform_gsq_wikitext2_ppl.json`。
- 报告：`report/20260727_103922_qwen3_8b_uniform_gsq_wikitext2_ppl_report.md`。

## 2026-07-27 12:03:00 CST：GSQ 官方 Qwen3-8B Q2_K WikiText2 PPL 完成

- 实验目的：下载并独立测试 GSQ 官方公开的 Qwen3-8B GGUF Q2_K checkpoint，获得可复现的 WikiText2 PPL 外部参考。
- 模型与校验：`ISTA-DASLab/Qwen3-8B-GGUF-GSQ/qwen3-8b-Q2_K.gguf`，大小 `3,281,732,960 bytes`，SHA256 `2bc740416074ee7a7c26189d82d1b1c75274287ec70877c945a0548f2e561858`。
- 方法与配置：`wikitext-2-raw-v1` test；sequence length 2048；145 个完整 chunks；llama.cpp `b10142` 的 CUDA `llama-perplexity`；batch/ubatch `2048/512`；RTX A6000 GPU0；全部可卸载层进入 GPU。
- 结果：最终 `PPL = 9.5180 ± 0.07356`；总耗时 `94.096714s`，纯 perplexity 阶段约 `91.742281s`。
- 对比边界：数值低于当前 Vector-GSQ `13.8254766` 和 Uniform-GSQ `37.1176143`，但官方 Q2_K 的格式、真实 bpp、量化范围和评测实现尚未与内部 checkpoint 严格对齐，因此仅作为外部参考，不作为严格同码率方法消融结论。
- 结果 JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260727_120300_official_qwen3_8b_gsq_q2k_wikitext2_ppl/20260727_120300_official_qwen3_8b_gsq_q2k_wikitext2_ppl.json`。
- 报告：`report/20260727_120300_official_qwen3_8b_gsq_q2k_wikitext2_ppl_report.md`。

## 2026-07-28 08:05:19 CST：FSR-VQ exact Linear 与函数候选 Gate 0/1 完成

- 实验目的：验证 hard vector transition 的精确 Linear SSE-delta、事务提交/回滚，以及
  geometric candidates 与真实 function-space best transitions 的一致程度。
- Gate 0：先红后绿实现 `src/fsr_vq`；exact delta、residual commit、reject rollback、固定
  格式 payload bytes 共 `4 passed`，加相关 Vector 测试为 `6 passed in 3.92s`。
- Gate 1 配置：Qwen3-0.6B layer-0 `k_proj`；d=6、K=4096、12 bits/vector；真实
  FineWeb-Edu token inputs；每次从 256 个不同输出行各采样一个 vector；token rows/seeds
  `0/1/2/3` 四次独立重复。
- 结果：geometric top-8 对 improving function oracle 的平均召回仅 `6.67%`，平均只覆盖
  `37.76%` oracle gain。Geometry-only 平均 SSE 相对改善 `0.07729%`；同一 top-8 内按
  exact function delta 重排改善 `0.54957%`，为 geometry-only 的 `7.0799×`；全 4096
  function oracle 改善 `1.45629%`。
- Width sweep：top-4/8/16/32/64 的 oracle gain coverage 分别为
  `24.33/36.71/48.40/59.34/71.70%`；top-64 对函数最优码字召回仍仅 `27.69%`。
- 结论：核心假设“weight/Hessian nearest codeword 不等于 function-space best codeword”在
  本真实 Qwen Linear gate 上得到强且可重复支持；下一步应实现 function-directed candidate
  generator，而不是只扩大 geometric top-k。本轮不构成 nonlinear block 或最终 PPL 结论。
- 汇总 JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_080519_fsr_vq_qwen3_06b_linear_gate_summary/20260728_080519_fsr_vq_qwen3_06b_linear_gate_summary.json`。
- 报告：`report/20260728_080519_fsr_vq_qwen3_06b_exact_linear_candidate_gate_report.md`。

## 2026-07-28 08:11:36 CST：FSR-VQ residual-shifted target 候选 Gate 完成

- 实验目的：在不穷举保存完整 function scores 的候选路径中，用 exact Linear quadratic
  推导 function-directed codeword target，并验证 top-8 候选能否接近 full K=4096 oracle。
- 方法：将 hard-transition delta 改写为到 `c*=c0-A^{-1}q` 的 Mahalanobis distance，使用
  `diag(A)` 做 `O(Kd)` top-8 scan，再用 exact delta 重排；A=`S(X^T X)S`，q=`SX^Tr`。
- 配置：Qwen3-0.6B layer-0 `k_proj`，d=6、K=4096；四个 token row/seed；每次 256
  个不同输出行 coordinates；与前一 Gate 使用相同 checkpoint 和真实 FineWeb-Edu inputs。
- 结果：residual-target top-8 对 function-best 的平均召回 `99.487%`，oracle gain coverage
  `99.9609%`，实际累计 SSE gain 为 full K=4096 oracle 的 `99.9592%`；geometric top-8
  对应仅为 `6.67%`、`37.76%`。四次 predicted delta 均通过实际 hard application 审计。
- 测试：新增 target-distance 等价性和 singular-Gram damping 测试；FSR-VQ `6 passed`，
  相关组合测试 `8 passed in 4.06s`。
- 结论：Linear function-directed candidate generator 得到强且重复的正证据，并显著优于
  只扩大 geometric shortlist；下一步进入多 Linear/层复现和 nonlinear block
  proposal--verify。本结果尚不支持 PPL/full-model 结论。
- 结果 JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_081136_fsr_vq_residual_target_candidate_summary/20260728_081136_fsr_vq_residual_target_candidate_summary.json`。
- 报告：`report/20260728_081136_fsr_vq_residual_shifted_target_candidate_report.md`。

## 2026-07-28 08:33:06 CST：FSR-VQ 多 Linear / 多层 FP-prefix 候选 Gate 完成

- 实验目的：验证 residual-shifted target 是否从 layer-0 `k_proj` 泛化到早中晚层七类
  Linear，并识别 nonlinear block gate 的困难模块。
- 配置：Qwen3-0.6B；layers 0/14/27；q/k/v/o/gate/up/down；每个 cell 四个 token
  row/seed；每 run 256 个不同 output rows；d=6、K=4096、top-8；共 84 runs。
- 激活来源：全部明确标记 `fp_prefix`，因此中晚层属于机制复制而非 quantized-prefix 证据。
- 结果完整性：84/84 runs、21/21 cells；matrix complete，预注册 Gate 通过。
- 聚合结果：residual-target function-best recall 均值 `93.656%`，oracle gain coverage
  均值 `99.255%`、中位数 `99.845%`、下四分位 `99.476%`；geometric top-8 对应均值
  仅 `2.933%` recall 和 `30.514%` coverage。
- 分层 coverage：layer 0/14/27 分别为 `99.847% / 99.408% / 98.510%`。
- 困难模块：layer-27 `o_proj` recall `61.579%`、coverage `95.232%`；layer-27
  `down_proj` recall `81.412%`、coverage `96.397%`。下一 Block Gate 必须纳入这两个压力测试。
- 首轮失败：旧 FP32 audit tolerance 在 MLP full-GEMM 与 late-layer alternate contraction
  order 下过严，分别观察约 `1.99955e-4` 和 `2.28882e-5` 的合法舍入差。加入有界、测试
  锁定的数值 audit tolerance 后只补跑缺失 runs；不改变 exact proposal acceptance。
- 测试：相关组合 `10 passed in 3.99s`；矩阵新增测试最终 `4 passed in 3.74s`。
- 结果目录：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_082000_fsr_vq_qwen3_06b_multilinear_multilayer_fp_prefix/`。
- 报告：`report/20260728_083306_fsr_vq_qwen3_06b_multilinear_multilayer_candidate_gate_report.md`。

## 2026-07-28 08:52:46 CST：FSR-VQ Nonlinear Block Proposal--Verify Gate 完成

- 实验目的：把 residual-target hard transitions 应用到完整 Qwen decoder block，验证
  Linear improvement、nonlinear block train improvement 和独立 validation 的关系。
- 配置：Qwen3-0.6B；layer-0/14 `k_proj`、layer-27 `o_proj/down_proj`；四 seeds；FP-prefix；
  train row 各 seed；validation rows `128/129/130/131`；每 run 256 sampled coordinates。
- Top-1 结果：16 runs 中 train pass `9`、validation pass `5`、accepted `4`；mean train/
  validation relative improvement 为 `-0.00986%/-0.00798%`，证明 Linear rank-0 经常不能
  改善完整 nonlinear block。
- Top-16 block rerank：对前 16 个 Linear proposals 分别运行完整 train block forward，选
  block-best 后才进入 validation。16/16 train pass、9/16 validation pass、9/16 accepted；
  mean train/validation relative improvement `+0.05094%/+0.03391%`。
- 机制证据：15/16 最终 proposal 不是 Linear rank-0；nonlinear block rerank 是必要组件。
- 压力模块：layer-27 `down_proj` 从 top-1 的 1/4 accepted 提升到 top-16 的 4/4，四 seeds
  的四条 validation sequences 全部改善。Layer-0 `k_proj` 仍为 0/4 validation accepted。
- 失败与修复：首次真实 run 因 requires-grad leaf parameter 原位 `copy_` 未置于 no-grad
  失败；修复为 source/candidate/FP restore 全部在 `torch.no_grad()` 中且 `finally` 恢复。
  单 validation sequence 被判定证据不足，升级为四 sequence mean + improved fraction gate。
- 测试：相关组合 `20 passed in 3.69s`。
- Top-1 结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_085000_fsr_vq_qwen3_06b_nonlinear_block_multival_gate/`。
- Top-16 结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_090000_fsr_vq_qwen3_06b_nonlinear_block_top16_rerank_gate/`。
- 报告：`report/20260728_085246_fsr_vq_qwen3_06b_nonlinear_block_proposal_verify_report.md`。

## 2026-07-28 09:00:06 CST：FSR-VQ Multi-Train-Sequence Block Generalization Gate 完成

- 实验目的：判别 layer-0 `k_proj` single-train 0/4 validation acceptance 是否来自单序列
  过拟合，而非 residual-target 在早层失效。
- 方法：每 seed 使用四条不重叠 train rows，拼接 Linear inputs/residuals 生成候选，并以四条
  train block loss 的均值和 improved fraction 重排 top-16；validation 使用独立八条 rows。
- 总体：16/16 train pass、10/16 validation pass、10/16 accepted；mean train/validation
  relative improvement `+0.03856%/+0.03233%`，validation improved fraction `67.97%`。
- 关键翻转：layer-0 `k_proj` 从 single-train `0/4` accepted 提升为 multi-train `3/4`，
  支持“单序列选择过拟合”解释。Layer-27 `down_proj` 继续 `4/4` 且所有八条 validation
  sequences 改善。
- 非单调：layer-14 `k_proj` 从 single-train `3/4` 降到 multi-train `1/4`，说明不同层对
  train aggregation 的最优协议不同，不能统一假设更多 train sequences 必然更好。
- 结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_091000_fsr_vq_qwen3_06b_nonlinear_block_multitrain_top16_gate/`。
- 报告：`report/20260728_090006_fsr_vq_qwen3_06b_multitrain_block_generalization_report.md`。

## 2026-07-28 09:17:49 CST：FSR-VQ Layer-27 down_proj Accepted-Transition Accumulation 完成

- 实验目的：验证 validation-gated hard transitions 能否形成持续改善的 nonlinear block
  trajectory，并用完全独立 audit sequences 排除 validation selection 泄漏。
- 方法：每轮基于当前 hard state 重算 inputs/residual/candidates，top-16 train block rerank，
  八条 validation sequences 接受；首次 validation rejection 停止。Audit rows 256-263 只在
  最终状态评测，从不参与选择。
- Max-32：四 seed 均接受 32/32；平均 train/validation/audit improvement 为
  `2.5750%/2.4735%/2.6019%`，所有 audit sequences 改善。
- Max-128：accepted transitions 为 `49/128/93/120`，平均 `97.5`；平均 train/validation/
  audit improvement 为 `6.5065%/6.1960%/6.5327%`。三个 seed 由 validation rejection
  停止，一个跑满 128 budget。
- Audit：四 seed 的八条 audit sequences 全部改善，最差 seed audit 也提升 `3.3840%`；
  `all_runs_all_audit_sequences_improved=true`。
- 数值失败：multi-sequence large down-proj contraction 的 FP32 audit 差达到 `8.77e-5`，
  超过旧 `5e-5`；有界 tolerance 更新为 `max(2e-4, |delta|*2e-4)`，仍小于 gain 的千分之一，
  不改变 acceptance。
- 测试：相关组合 `24 passed in 3.77s`。
- Max-128 结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_094000_fsr_vq_qwen3_06b_layer27_down_proj_accumulation_max128/`。
- 报告：`report/20260728_091749_fsr_vq_qwen3_06b_layer27_down_proj_accumulation_report.md`。

## 2026-07-28 10:05:00 CST：FSR-VQ Layer-27 `down_proj` 等码率全模型 PPL

- 实验目的：验证 block-level accepted-transition trajectory 物化为完整 logical checkpoint 后，
  是否能在不改变部署码率的条件下改善最终 WikiText2 PPL。
- 对照：Qwen3-0.6B source Vector checkpoint 与 seed-1、128 accepted transitions 的 FSR-VQ
  checkpoint；只有 layer-27 `mlp.down_proj` assignments 改变。
- 配置：WikiText2 test；sequence length 2048；batch size 8；BF16 model forward；28/28
  quantized layers、196/196 quantized Linears。
- Source PPL：`57.2913742065`；FSR-VQ PPL：`57.2727737427`。
- 变化：绝对 `-0.0186004639`，相对 `-0.0324664%`，方向为改善。
- 码率：两侧 logical effective bpp 均为 `2.2010416667`；codebook/norm/assignment width
  不变，属于 rate-neutral refinement。
- 完整性：两侧 `all_fresh_reconstructions_exact=true`，全部 196 个 Linear 精确写入重建值。
- 结论：首次证明单 late-layer FSR-VQ hard trajectory 的 block gain 能传递为小幅全模型 PPL
  改善；但只有一个 seed、一个 Linear，不能据此声称完整 FSR-VQ 或跨模型 superiority。
- 原始与汇总结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_100500_fsr_vq_layer27_down_proj_ppl/`。
- 报告：`report/20260728_100500_fsr_vq_layer27_down_proj_rate_neutral_ppl_report.md`。
- 完整方法手册：`docs/20260728_101500_fsr_vq_complete_method_experiment_and_paper_manual.md`。

## 2026-07-28 10:25:00 CST：FSR-VQ Layer-27 `down_proj` 四 Seed 等码率 PPL

- 目的：检查单 seed PPL 正信号的稳定性，以及 block audit gain/transition count 是否能预测 PPL。
- 四 trajectories 接受 `49/128/93/120` steps，均从同一个 Source checkpoint 严格物化。
- Source PPL：`57.2913742065`；seed 0/1/2/3 PPL：`57.1903038025 / 57.2727737427 /
  57.3378601074 / 57.2519111633`。
- 相对变化：`-0.176415% / -0.032466% / +0.081139% / -0.068881%`，3/4 seeds 改善。
- Mean PPL `57.2632122040`，mean delta `-0.0281620026`，mean relative delta `-0.049156%`，
  sample standard deviation `0.060847`。
- Audit gain 最大的 seed 不是 PPL 最优；seed 2 的全部 block audit sequences 改善但 PPL
  恶化。四点 audit-vs-PPL-delta Pearson 为 `+0.5529`，足以否定局部 gain 单调预测 PPL 的假设。
- 结论：等码率 PPL signal 在多数 seeds 上存在，但不 seed-stable；下一 Gate 升级为
  downstream-window/logit-aware rerank，不能按 test PPL、audit gain 或 step 数事后选状态。
- 结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_102000_fsr_vq_layer27_down_proj_multiseed_ppl/`。
- 报告：`report/20260728_102500_fsr_vq_layer27_down_proj_multiseed_ppl_and_objective_mismatch_report.md`。

## 2026-07-28 10:50:00 CST：FSR-VQ 纯 Logit Objective 四 Seed Gate

- 目的：修复 block audit gain 无法稳定预测 PPL 的目标错位；Stage 1 保留 residual target，
  Stage 2 改为 final norm + lm head 后的 logit reconstruction。
- 实现：accumulation runner 新增 `--objective block|logits`，logits 只允许最后一个 decoder
  layer；新增 scope/projection 红绿灯测试。
- 四 seed accepted steps：`5/9/1/0`，均由 validation rejection 停止。
- PPL relative delta：`-0.010534%/-0.015454%/+0.002390%/0%`；2/4 严格改善。
- Mean relative delta：`-0.005899%`；PPL sample SD `0.004865`。
- 对比 block-only：mean gain 更小（block-only `-0.049156%`），但 SD 从 `0.060847` 降至
  `0.004865`，worst seed 从 `+0.081139%` 降至 `+0.002390%`。
- Gate verdict：预注册 improved-seed 和 mean-delta Gate 未通过；max-worsening Gate 通过。
- 结论：纯 logits objective 是有效 safety signal，但单独使用过于保守；下一方法应为
  block utility + held-out logit safety constraint 的 constrained dual objective。
- 结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_104500_fsr_vq_layer27_down_proj_logits_objective_max128/`。
- 报告：`report/20260728_105000_fsr_vq_logits_objective_gate_report.md`。

## 2026-07-28 12:20:00 CST：FSR-VQ 双目标、Validation 规模与上下文长度消融

- 新实现：`block_with_logit_guard`，以 block gain 为 utility，logit MSE 为 train/validation
  hard safety constraint；新增 block-select 与 Pareto maximin 两种 feasible-pool 选择。
- Dual block-select val8：accepted `15/9/2/5`，2/4 PPL 改善，mean `-0.018232%`，worst
  `+0.003050%`。
- Dual maximin val8：accepted `7/9/2/5`，2/4 改善，mean `-0.000644%`；方差低但收益几乎消失。
- Dual block-select val32：accepted `12/9/11/9`，3/4 改善，mean `-0.020405%`，worst
  `+0.003050%`；为当前最佳安全—收益折中。
- Dual block-select seqlen512/val16：accepted `4/9/3/6`，0/4 改善，mean `+0.004553%`；
  四 seeds 一致轻微恶化，否定“增加 context length 修复 MSE/PPL mismatch”的假设。
- 结论：logit MSE 适合作为保守信号但不与 NLL/PPL 完全一致。下一 Gate 用 teacher KL 或
  calibration token NLL non-degradation 替代/增强 logit-MSE guard。
- 汇总：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_121500_fsr_vq_objective_ablation_summary.json`。
- 报告：`report/20260728_122000_fsr_vq_stage2_objective_ablation_and_next_method_report.md`。

## 2026-07-28 14:15:00 CST：Probability Guards 与预注册 Trajectory PPL Selector

- NLL guard：新增正确 causal shift；val128 四 seeds accepted `0/2/0/2`。两个非零状态 audit
  NLL 都改善，但 test PPL 一正一负，说明 FineWeb NLL 存在跨域选择误差。
- Teacher-KL guard：新增 full-vocab KL 与 temperature `1/2/4`；T=1 四 seeds accepted
  `0/1/4/2`，三个非零 states 的 test PPL 全部轻微恶化，KL 不适合作为最终单步 selector。
- Trajectory surrogate audit：24 checkpoints 的 WikiText validation/test ΔPPL Pearson
  `0.9931`、Spearman `0.8376`、非零符号一致率 `80%`。Block-only/logits-only/dual-val32
  族内 Pearson 分别 `0.9976/0.9869/0.9985`。
- 新 seeds 4--7 预注册 Gate：生成 `86/3/58/0` step trajectories，按 cadence 物化 coarse
  snapshots，只用 WikiText validation PPL 选择，再揭示 selected test。
- 选择：seed 4 step86、seed 5 Source、seed 6 step58、seed 7 Source。
- Test relative delta：`-0.122422% / 0% / -0.033372% / 0%`；4/4 non-degradation、2/4
  strict improvement、mean `-0.038948%`。
- Post-selection audit：未选 seed-5 step3 的 test 实际恶化 `+0.005433%`，证明 selector 避免
  了真实 regression。
- 结论：FSR-VQ 正式结构升级为 local surrogate 生成 trajectory + held-out end-metric PPL
  做 coarse checkpoint selection；test 不参与选择。
- 相关报告：`report/20260728_135000_fsr_vq_probability_guards_and_trajectory_selector_report.md`、
  `report/20260728_141500_fsr_vq_pre_registered_trajectory_selector_report.md`。

## 2026-07-28 15:20:00 CST：FSR-VQ Selected Trajectories 六任务 Zero-Shot Accuracy

- 目的：对预注册 validation-PPL selector 选出的两个非 Source states（seed4/step86、
  seed6/step58）做六任务 accuracy reveal，检验 PPL non-degradation 是否同时保证任务准确率。
- 配置：Qwen3-0.6B；lm_eval 0.4.12；zero-shot；ARC-C/ARC-E/HellaSwag/LAMBADA/PIQA/
  WinoGrande；主指标分别为 normalized accuracy（前三者与 PIQA）或 accuracy（LAMBADA、
  WinoGrande）；seed 0；bootstrap 1000；BF16；本地离线数据。
- 完整性：Source、seed4、seed6 均重建 28/28 层和 196/196 Linears，logical effective bpp
  均为 `2.2010416667`；三次正式运行全部完成。
- Source 六任务 macro：`40.648119%`。
- seed4/step86：macro `40.703901%`，绝对 `+0.055781` 个百分点；2 tasks improved、1 equal、
  3 worsened。逐任务正确样本变化为 `+2/0/-6/-6/-1/+5`。
- seed6/step58：macro `40.582472%`，绝对 `-0.065647` 个百分点；0 tasks improved、2 equal、
  4 worsened。逐任务正确样本变化为 `0/-3/-17/-1/0/-1`。
- 两个 selected states 平均 macro 相对 Source 仅 `-0.004933` 个百分点，数值上近似持平；
  但所有变化均远小于 task standard error，本轮未保存 per-sample paired logs，因此不能声称
  显著提升或严格 accuracy non-degradation。
- 关键结论：seed4/seed6 的 PPL 都改善，但 macro accuracy 一正一负；WikiText validation PPL
  selector 是同域 PPL safety mechanism，不是 downstream accuracy certificate。
- 汇总：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_152000_fsr_vq_zero_shot_accuracy_summary.json`。
- 报告：`report/20260728_152000_fsr_vq_selected_trajectory_zero_shot_accuracy_report.md`。

## 2026-07-28 16:30:00 CST：Remote-14 Paired Accuracy Non-Inferiority

- 正式服务器：`10.30.0.14`，RTX A6000 GPU 0，Source/seed4/seed6 顺序运行；三 checkpoint
  SHA256 与当前仓库一致，均为 28 层、196 Linear、`2.2010416667` logical bpp。
- 新功能：lm_eval runner 支持 `--log-samples`，保存稳定 pairing keys 与二元主指标；新增
  paired analyzer，执行 key equality、disagreement、exact McNemar、100,000 次 paired
  bootstrap 和分层 macro non-inferiority。
- Source/seed4/seed6 macro：`40.6253% / 40.7446% / 40.6307%`。
- seed4 macro delta `+0.1193 pp`，paired 95% CI `[-0.0427,+0.2823] pp`；seed6 delta
  `+0.0054 pp`，CI `[-0.1324,+0.1452] pp`。
- 两个 states 的 CI 下界均高于预先记录的 `-0.2 pp` 工程 margin，macro non-inferiority
  2/2 PASS；CI 均跨零，不能声称显著 accuracy improvement。
- 六任务没有任何 exact McNemar `p<0.05`；最小 p 为 seed4 WinoGrande `0.1078`。
- 严格 per-task NI：seed4 4/6 PASS，seed6 2/6 PASS；因此不能声称六任务逐项 non-inferiority。
- 环境审计：本地和 14 的模型/config/tokenizer 哈希一致，lm_eval/datasets 版本一致，但
  PyTorch/Transformers 为 `2.8.0+cu128/5.6.2` vs `2.3.0+cu121/4.53.3`；跨机绝对 accuracy
  有小差异，正式表只使用 remote-14 内部配对结果。
- 汇总：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260728_162500_fsr_vq_paired_zero_shot_accuracy_analysis.json`。
- 报告：`report/20260728_163000_fsr_vq_remote14_paired_accuracy_noninferiority_report.md`。

## 2026-08-11 16:55:00 CST：Remote-14 Layer-27 七 Linear Sweep 独立 PPL Gate

- 实验目的：验证同一 decoder block 内按 `q/k/v/o/gate/up/down` 顺序提交的 hard assignment
  trajectory，能否经独立 end-metric selector 转化为等码率全模型 PPL 改善。
- Sweep 配置：Qwen3-0.6B、layer 27、base seed 4、每 Linear 最多 16 transitions、block
  objective；七阶段接受 `3/1/3/1/0/0/16`，累计 24 transitions。
- 选择协议：Source 与七 stage checkpoint 只评 WikiText2 validation PPL，sequence length
  2048、batch size 8；锁定最低 validation PPL 后才揭示 selected test，test 不参与选择。
- Validation：Source `60.511864`；stage07 `60.498249`，相对改善 `0.022499%`，被选中。
- 同环境 test：Source `57.291264`；stage07 `57.281593`，绝对 `-0.009670`、相对改善
  `0.016879%`。
- 完整性：Source/selected 均为 28 层、196 Linear，fresh reconstruction exact；logical bpp
  均为 `2.2010416667`，属于严格 rate-neutral improvement。
- 机制边界：stage02 曾相对 Source 恶化 `0.003530%`，后续 v/o/down stages 才恢复并改善，
  证明 block-local accept 不保证 PPL 单调，trajectory-level validation selector 是必要组件。
- 结论：多 Linear block-coordinate 闭环获得正机制证据，但单模型、单层、单 seed 和微小效应
  仍不足以形成 ICLR 主结果；下一 Gate 为 seeds 5--7 复制，再扩 2/4-block prefix。
- 汇总：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260811_165500_fsr_vq_layer27_seven_linear_sweep_ppl/summary.json`。
- 报告：`report/20260811_165500_fsr_vq_layer27_seven_linear_sweep_ppl_report.md`。

## 2026-07-28 13:34:03 CST：七 Linear Sweep 首次启动失败（Legacy Serialization）

- 实验：Remote-14 layer-27 七 Linear block-coordinate sweep，seed4，每 Linear max16。
- Stage 1 q_proj 搜索本身成功：接受 3 transitions，下一 proposal 被 validation 拒绝。
- 失败点：materializer 保存 checkpoint 时，PyTorch 2.3 不支持序列化 source 中的
  `torch.uint16` assignments，抛出 `KeyError`；未进入 k/v/o/MLP stages。
- 结论：该失败不反驳七 Linear 方法，只暴露跨 PyTorch 版本 checkpoint storage compatibility。
- 修复：全部 uint16 assignments 按最大 ID 安全转换为同宽 int16 或必要时 int32，logical
  assignment bits 和重建值不变；真实 Remote-14 materialization 已通过。
- 失败产物：Remote-14
  `runtime/results/20260728_170000_fsr_vq_layer27_seven_linear_sweep_seed4/`。
- 状态：已修复，正式 sweep 将用新时间戳从 Source 重新启动；失败实验保留以避免重复踩坑。
## 2026-08-12：单 GPU Vector-GPTQ 1/2/4/7 路并发 Gate（预注册，待用户执行）

- 实验目的：测量同一张本地 GPU 上，block 内七个独立 Linear 的 Vector-GPTQ 使用
  1/2/4/7 路 CUDA stream 时的墙钟加速、峰值显存和可运行并发上限。
- 方法原理：固定 seed=0，NoWag 保持串行；仅将无随机、相互独立的 Vector-GPTQ
  refinement 放入有界线程池和独立 CUDA stream，所有分支完成后统一汇总 assignments。
- 关键参数：默认 1 layer、d=6、W2、8 条 GPTQ calibration sequences、sequence
  length=4096、row chunk=128；可通过脚本环境变量覆盖，测试工具为
  `run_prefix_vector_gsq.py --stage gptq`。
- 结果数据：待用户运行；脚本会写入
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/<datetime>_vector_gptq_local_concurrency_gate/`。
- 实验报告：运行后自动生成 `report/<datetime>_vector_gptq_local_concurrency_report.md`。
- 当前结论：尚无 GPU 墙钟证据，不预先声称加速；完成后以
  `initialization_policy.gptq_wall_seconds` 相对 concurrency=1 计算 speedup，并核对
  GPTQ block MSE。
## 2026-08-12：Vector-GSQ d6 本地完整训练 + PPL + EvalScope/lm_eval（预注册，待用户执行）

- 实验目的：在 Qwen3-8B 上完成 NoWag-d6 → 七路并发 Vector-GPTQ → block 联合
  Vector-GSQ 的完整层量化，并产出可审计 checkpoint、WikiText2 PPL、EvalScope Native
  和 lm_eval 六任务结果。
- 方法原理：每个 block 的 NoWag 保持 seed 隔离；七个 Linear 的 Vector-GPTQ 使用独立
  CUDA stream；Vector-GSQ 以完整 nonlinear block MSE 联合优化七个 Linear。所有评测均在
  新进程中从 logical checkpoint fresh reconstruction，防止误评基础 FP 模型。
- 默认关键参数：d=6、W2、GPTQ concurrency=7、64×4096 GPTQ calibration、8×4096
  train、8×4096 validation、local candidates=8、400 GSQ steps/block、完整模型层数；
  PPL sequence length=2048，seed=0。
- EvalScope 配置：本机 1.4.1 Native，zero-shot `arc/hellaswag/piqa/winogrande`，其中
  `arc` 明确包含 ARC-Easy 和 ARC-Challenge；Qwen3 thinking 显式关闭，单题最多生成 32
  tokens；该版本无 Native LAMBADA adapter。
- lm_eval 配置：zero-shot ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande，满足统一
  accuracy 协议。
- 结果数据：待用户执行；写入
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/<datetime>_vector_gsq_local_full_eval/`。
- 实验报告：运行后自动生成 `report/<datetime>_vector_gsq_local_full_eval_report.md`。
- 当前结论：尚未启动 GPU，不预先声称加速、PPL 或 accuracy 结果。

## 2026-08-12：Qwen3-32B GPU3 七路 Vector-GPTQ + Vector-GSQ（代码完成，启动延期）

- 实验目的：在本机物理 GPU 3 上启动 Qwen3-32B 全 64 层 Vector-GSQ，验证同一 block
  七个 Linear 的 Vector-GPTQ concurrency=7 能进入实际量化进度。
- 方法原理：基础模型 BF16 权重驻 CPU；逐层将当前 block 和共享 RoPE 搬到进程内
  `cuda:0`（由 `CUDA_VISIBLE_DEVICES=3` 映射到物理 GPU 3），依次执行 NoWag-d6、七路
  Vector-GPTQ CUDA stream 和 block 联合 Vector-GSQ，写入 logical checkpoint 后移回 CPU。
- 关键参数：Qwen3-32B、64 layers、d=6、W2、local candidates=4、400 steps/block、
  64×4096 GPTQ calibration、8×4096 train、8×4096 validation、GPTQ row chunk=64、seed=0。
- 显存策略：launcher 要求启动前 GPU3 至少 70000 MiB 空闲；assignment chunk=4096，
  expectation chunk=16384，PyTorch expandable segments 开启；inline PPL 关闭，完整 checkpoint
  后另行 fresh reconstruction 评测。
- 结果数据：写入
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/<datetime>_qwen3_32b_d6_k4_s400_full64_gpu3_c7/`。
- 验收边界：本次任务只要求进程正常存活并进入首层实际量化进度，不等待 64 层完成，也不预先
  声称最终 PPL 或 accuracy。
- 启动结果：第一次启动在空卡检查后遭遇外部 vLLM 抢占 GPU3，launcher 的 70000 MiB
  门禁安全退出；随后创建的后台等待器检测到 GPU3 已占用约 72GB。用户确认当前没有可用显卡
  并要求停止，因此等待器已终止，未启动量化进程、未产生 checkpoint，也未干扰外部任务。
- 启动证据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260812_082956_qwen3_32b_d6_k4_s400_full64_gpu3_c7_gpu_wait.log`。
- 启动报告：`report/20260812_082956_qwen3_32b_vector_gsq_gpu3_launch_deferred_report.md`。

## 2026-08-12 18:26:35 CST：Vector-GPTQ 六维精确向量化 CPU 微基准

- 实验目的：验证以三角投影和矩阵距离替代 4096-way 候选的六步顺序反馈，不改变 Vector-GPTQ
  的 assignment、重建权重及 refinement 变差时的 NoWag 回退语义。
- 方法原理：旧 recurrence 等价于求解 `error @ U = weight - codeword`；新实现一次计算
  `weight @ inv(U)` 与 `codeword @ inv(U)` 后，用矩阵乘法得到所有精确平方距离。跨六维组的
  顺序反馈保持不变。
- 配置：CPU 单线程、FP32、synthetic deterministic tensors、seed=7、row chunk=256、K=4096、
  d=6；`torch.utils.benchmark` 自动重复至少 2 秒，取中位数。未运行模型、PPL 或 accuracy。
- 结果：旧 scorer `0.088523 s`，新 scorer `0.000881 s`，隔离 CPU 加速 `100.50×`；assignment
  完全一致，最大 loss 绝对差 `7.6294e-6`；主要 candidate 工作区从 `24.0 MiB` 降至 `4.0 MiB`。
- 验证：核心等价、完整 refinement、回退和并发测试 `13 passed`；设备与 32B launcher 回归
  `5 passed`；Python 编译通过。
- 结果数据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260812_182635_vector_gptq_exact_vectorization_cpu_microbenchmark.json`。
- 报告：`report/20260812_182635_vector_gptq_exact_vectorization_report.md`。
- 结论：精确向量化已在 CPU fixture 上成立；`100.50×` 不等于 32B 端到端 GPU 加速，后者仍需
  按完整 NoWag→Vector-GPTQ→Vector-GSQ 正式流程验证。

## 2026-08-12 18:36:08 CST：Vector-GPTQ Top-128 局部码字 CPU 微基准

- 实验目的：把每个向量的 Vector-GPTQ 精确候选从 K=4096 限制到以 NoWag assignment 为锚点
  的 128-way 局部码字集合，并验证候选边界、回退和全搜索兼容。
- 方法原理：对每个 Linear 的 codebook 一次性构建 128-nearest-neighbor table；每个向量强制
  保留 anchor，并只对其邻域执行精确三角投影 loss。完整 Hessian 目标变差仍回退 NoWag；
  `--gptq-candidates 4096` 恢复全搜索。
- 配置：CPU 单线程、FP32、seed=128、rows=256、K=4096、d=6、top-k=128；无模型、PPL或
  accuracy 评测。
- 结果：一次性邻域表构建 `0.281449 s`；隔离 scorer `0.001930→0.000540 s`，`3.58×`；
  loss matrix `4.0→0.125 MiB`，缩小 `32×`；synthetic NoWag-like top-128 recall `99.609375%`。
- 验证：top-128 自包含/唯一性、小码本退化、全搜索等价、默认候选边界、NoWag 回退、并发和
  32B launcher 共 `23 passed`；Shell 语法和 Python 编译通过。
- 结果数据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260812_183608_vector_gptq_top128_cpu_microbenchmark.json`。
- 报告：`report/20260812_183608_vector_gptq_top128_report.md`。
- 结论：top-128 已成为下一次启动的默认路径；它是近似搜索，尚不能声称正式模型质量不变。

## 2026-08-12 21:57:40 CST：Qwen3-4B NoWag + Vector-GPTQ top-128 + Vector-GSQ 全模型收敛与 PPL

- 实验目的：在官方 Qwen3-4B 全部 36 层上实测完整 NoWag→Vector-GPTQ→Vector-GSQ 的
  收敛时间、分阶段墙钟与 WikiText2 test PPL。
- 方法原理：NoWag d6/W2/K4096 初始化；Vector-GPTQ 以 NoWag assignment 为锚点仅评分
  128 个近邻码字，并在 block 内并发 7 个 Linear；Vector-GSQ 以完整 nonlinear block MSE
  联合优化 7 个 Linear。PPL 在独立进程中从 logical checkpoint fresh reconstruction 后测试。
- 关键配置：官方 `Qwen/Qwen3-4B`（36 layers/252 Linears），Remote-14 物理 GPU1 RTX A6000；
  GPTQ 64×4096 calibration、top-128、concurrency=7、row chunk=64；GSQ 8×4096 train、
  8×4096 validation、local candidates=8、400 steps/block；seed=0；WikiText2 test PPL
  sequence length=2048、batch size=1；logical bpp=2.03768262987013。
- 结果：36/36 层和 252/252 Linears 完成；pipeline 墙钟 8006 s（2:13:26），量化墙钟
  7911 s（2:11:51）；Vector-GPTQ 累计 3053.265 s（38.77%），Vector-GSQ 累计
  3510.789 s（44.58%）；训练峰值显存 15.343 GiB。WikiText2 test PPL=
  **22.679946899414062**，fresh reconstruction exact=true。
- 收敛：36/36 block 的 GSQ 更新被接受；GSQ hard block MSE 平均下降 20.76%，最终
  assignment 平均切换 17.67%。达到最终 validation-selected improvement 的 90%/95%/99%
  平均需 247.3/291.8/357.1 steps；精确 selected best 中位 step=399。
- 审计限制：没有匹配的 FP baseline 或 full-4096 GPTQ 对照，不据此声称相对 PPL 退化或
  top-128 无损；原始 PPL JSON 的旧 0.6B 固定标签已在 evaluator 中修复为运行时模型标签，
  原文件保持不变以保留 provenance。
- 结果数据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260812_184000_qwen3_4b_d6_gptqtop128_gsqk8_s400_full36_gpu1_c7/`。
- 报告：`report/20260812_215740_qwen3_4b_nowag_vector_gptq_vector_gsq_convergence_ppl_report.md`。
- 结论：Qwen3-4B 正式流程已闭环。当前 GPTQ 与 GSQ 都是主要耗时；400-step GSQ 的最优点
  普遍靠后，若减到约 300 steps，轨迹分析仅表明平均保留约 95% validation 改善，仍需单独
  PPL gate 才能判断是否可接受。

## 2026-08-13 00:18:39 CST：Qwen3-8B/14B Full-4096 Vector-GPTQ Checkpoint PPL 补测

- 实验目的：为 2026-07-20 已完成但未记录最终 PPL 的 Qwen3-8B/14B full-4096
  Vector-GPTQ + Vector-GSQ logical checkpoint 补测 WikiText2 test PPL。
- 方法原理：两个 checkpoint 生成于 top-128 实现之前，Vector-GPTQ 使用全部 4096 个码字；
  在独立进程 fresh reconstruction 全部量化 Linear，通过覆盖、有限值、assignment 边界和
  逐元素重建一致性检查后计算 PPL。
- 配置：Remote-14 物理 GPU1 RTX A6000；NoWag d=6/W2/K4096；8B 为 36 层、252 Linears、
  GSQ local candidates=8；14B 为 40 层、280 Linears、GSQ local candidates=4；均为
  400 steps/block、WikiText2 test、seqlength=2048、batch size=1。
- 结果：Qwen3-8B PPL=**13.82547664642334**，评测 139.014 s，峰值显存 17.288 GiB；
  Qwen3-14B PPL=**11.032148361206055**，评测 161.307 s，峰值显存 29.755 GiB。两个结果均
  `completed=true`、全层全 Linear 覆盖、`all_fresh_reconstructions_exact=true`。
- 结果数据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260812_231729_full4096_checkpoint_ppl_gpu1/`。
- 报告：`report/20260813_001839_qwen3_8b_14b_full4096_checkpoint_ppl_report.md`。
- 限制：这两个 checkpoint 不是 Qwen3-4B，不能与 4B top-128 跨模型比较来判断候选近似损失；
  本地和 Remote-14 未发现 Qwen3-4B full-4096 完整 checkpoint。

## 2026-08-13 06:47:55 CST：Qwen3-8B Vector-GPTQ Top-128 完整量化与 Full-4096 PPL 对比

- 实验目的：补测 Qwen3-8B top-128 完整 checkpoint/PPL，并与旧 full-4096 checkpoint 做
  同模型、同数据、同 GSQ 主配置对比。
- 方法原理：NoWag d6/W2/K4096 初始化；top-128 只在 NoWag anchor 的 128-way 近邻中做
  Hessian-aware GPTQ 搜索；随后使用 local candidates=8、400 steps/block 的 Vector-GSQ。
- 配置：Remote-14 物理 GPU1 RTX A6000；Qwen3-8B 36 层；seed=0；64×4096 calibration；
  8×4096 train、8×4096 validation；top-128 GPTQ concurrency=7、row chunk=64；WikiText2
  test PPL seqlen=2048、batch=1；logical bpp=2.0212720788043477。
- 结果：top-128 PPL=**13.844480514526367**；旧 full-4096 PPL=
  **13.82547664642334**；绝对差 `+0.0190038681`，相对 `+0.137455%`（PPL 越低越好）。
  Top-128 runner 15176.281 s，较旧 full-4096 的 16177.867 s 减少 6.19%；训练峰值显存
  28.586 GiB，降低 1.305 GiB。36/36 层、252/252 Linears 完成且 fresh reconstruction exact。
- 结果数据：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260813_012700_qwen3_8b_d6_gptqtop128_gsqk8_s400_full36_gpu1_c7/`。
- 报告：`report/20260813_064755_qwen3_8b_top128_vs_full4096_ppl_report.md`。
- 限制：旧 full-4096 来自较早代码，使用串行 GPTQ/row chunk=128；新 top-128 使用七路并发/
  row chunk=64，故细小 PPL 差异不能全部严格归因于候选数。结论是质量基本保持但非严格无损；
  论文级单变量结论需用当前代码 matched rerun full-4096。

## 2026-08-20 14:31:09 CST：Staged Vector-GSQ CPU 实现验证（非模型质量实验）

- 实验目的：验证结构感知四阶段 objective、partial Linear patch、fixed-assignment row-scale
  梯度与 logical-state fold 的实现合同，避免未接通或 silent fallback 后直接消耗 Remote-14 GPU。
- 方法原理：tiny LLaMA-like CPU block 保留 GQA-like Q/K 不同输出维度，逐项执行 Q、K、
  attention、block 输出；unit row scale 必须与 fixed weight forward 一致且七个 scale 可反传；
  scale fold 必须只同比改变 weight 行与 `row_norm`，assignment/codebook/col_norm 保持逐元素不变。
- 实验步骤：Python 编译三个改动模块；运行 staged 专项测试；运行 Vector-GPTQ concurrency、
  device/offload、LLaMA/QTIP launcher 回归；对新增 Python 运行 Ruff；对新增 shell 运行 `bash -n`。
- 实验配置：本地 CPU tiny fixture，无预训练模型、无数据集、无 GPU；Pytest；seed=0/1；
  正式 PPL 预注册为 WikiText2 test seqlength=2048，正式 accuracy 为 lm_eval 六任务，但本次未执行。
- 实验结果：最终相关测试 `34 passed`（其中 staged 专项 `6 passed`）；Python compile、Ruff、
  shell syntax 全部通过。此前一次新增梯度合同测试先发现 toy attention 的 Q/K 输出未进入计算图，
  修复 fixture 后转绿；生产实现未因该 fixture 问题变更。
- 结果数据：`experiments/results/20260820_143109_staged_vector_gsq_cpu_validation.json`。
- 结论：实现与启动入口可进入正式验证阶段；本次没有 LLaMA PPL/accuracy，不能据此声称方法质量
  提升、超过 uniform GSQ 或超过 QTIP。

## 2026-08-20 14:56:00 CST：LLaMA-3-8B Staged Vector-GSQ Remote-14 进行中快照

- 实验目的：在与 2026-08-20 legacy `block-all` LLaMA-3-8B 相同模型和主协议下，验证
  structure-aware staged objective 是否改善最终 PPL/六任务质量。
- 方法原理：NoWag-d6 → Vector-GPTQ top-128/concurrency=7 → Q/K/V-O/MLP staged
  Vector-GSQ → fixed-assignment block row-scale refinement；每阶段、整块和 FP16 logical
  reconstruction 均设 validation gate。
- 实验配置：Remote-14 物理 GPU1，Meta-Llama-3-8B，32 层，seed=0，四阶段各 400 steps，
  scale 100 steps/LR=1e-3；WikiText2 test PPL seqlength=2048；lm_eval 六任务待量化完成后执行。
- 当前结果：layer0 Hessian、NoWag、170.809 秒 Vector-GPTQ 已完成；Q、K、V/O、MLP 四阶段均
  `accepted=true`，对应 final hard MSE 为 `3.4649e-4`、`6.4339e-4`、`8.9032e-7`、
  `6.3065e-6`。当前尚无 checkpoint/PPL/accuracy，不能下质量结论。
- 本地同步：代码与远端 byte-identical；进行中日志已回拉至
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260820_144330_llama3_8b_staged_vector_gsq_gpu1/quantization.log`。
- 同步清单：`experiments/results/20260820_145600_llama3_8b_staged_vector_gsq_sync_snapshot.json`。
- 结论：正式程序已进入正常 staged 量化进度；当前是进行中快照，完成后必须再次回拉 checkpoint、
  PPL、六任务 JSON 和最终报告。

## 2026-08-20 18:02:43 CST：LLaMA-3-8B Staged Vector-GSQ Remote-14 最终回拉

- 实验目的：将已经停止的 Remote-14 staged 运行代码、checkpoint、结构化结果和完整日志回拉
  到本地，并明确区分中间 checkpoint 与正式完整模型结果。
- 方法与配置：Meta-Llama-3-8B；NoWag d=6/W2/K4096；Vector-GPTQ top-128/concurrency=7；
  Q/K/V-O/MLP 各 400 steps；scale refinement 100 steps/LR=1e-3；64×4096 calibration、
  8×4096 train、8×4096 validation；正式评测协议为 WikiText2 test seqlength=2048 和 lm_eval
  六任务，但本次未到评测阶段。
- 结果：完成 layer 0–12，共 13/32 层；layer 13 在 MLP phase 开始后终止。中间 checkpoint 为
  1,897,824,891 bytes，逻辑码率 2.0194936899 bpp，最后结构化累计时间 8907.676 秒；无 PPL、
  无六任务 accuracy，不能作完整模型质量结论。
- 完整性：checkpoint、quantization JSON、日志的本地/远端 SHA256 分别为 `e2351a41...b35`、
  `fc4bd3c7...8c2f`、`4fd6f8a8...217`；rsync checksum dry-run 为 0 个差异。
- 本地结果：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260820_144330_llama3_8b_staged_vector_gsq_gpu1/`。
- 远端源码快照：`code/remote_10_30_0_14_20260820_staged_vector_gsq_source/`；本地活跃源码含后续
  调优，因此未用远端旧版本覆盖。
- 同步清单：`experiments/results/20260820_180243_llama3_8b_staged_vector_gsq_final_sync.json`。
- 报告：`report/20260820_180243_llama3_8b_staged_vector_gsq_final_sync_report.md`。

## 2026-08-20 21:26:46 CST：LLaMA-3-8B 结构感知 Vector-GSQ 本地单层调优矩阵

- 实验目的：在本地单张 A100 上筛选能够超过现有 block-all Vector-GSQ、并可与原始 scalar GSQ
  做同码率比较的结构感知配置；不使用 Remote-14。
- 方法原理：NoWag-d6 → Vector-GPTQ top-128/concurrency=7 → Q、K、V/O attention、MLP block
  四阶段 objective；对 assignment 与 row/input-group scale 联合优化，并在 FP16 codebook、row/column
  norm、group scale 的完整 logical reconstruction 后做 validation gate。
- 实验步骤：依次运行 staged/block-all、block polish、freeze-QK、fixed group128 scale、joint
  group128/group256 scale 共九组 layer-0 Gate；全部计算 WikiText2 test prefix PPL。
- 共同配置：Meta-Llama-3-8B base；seed=0；64×4096 GPTQ；8×4096 train 与 8×4096 validation
  分别切成 64×512 segment；四阶段各 1280 steps；PPL seqlength=2048、batch=1；只占一张 GPU。
- 关键结果：同为 2.14449369 bpp 时，joint staged group128 + full logical gate PPL=
  **6.21988058**，优于 block-all + fixed group128 的 **6.22095299**，绝对下降 0.00107241；
  joint group256 为 2.08199369 bpp、PPL=**6.22265720**，码率低于 scalar GSQ 2.125 bpp。
- 反例：block polish 将 block MSE 降到矩阵最低 `8.2761e-6`，但 PPL 反而为 6.22595692，确认
  block MSE 与 PPL 不单调，不能以局部 MSE 单独选方法。
- 结果数据：`experiments/results/20260820_212646_llama3_8b_structure_aware_vector_gsq_gate_summary.json`；
  原始运行位于 `code/GSQ_nowag_d1_20260716_015355/experiments/results/local_staged_tuning/`。
- 报告：`report/20260820_212646_llama3_8b_structure_aware_vector_gsq_gate_report.md`。
- 结论与限制：结构感知 joint assignment/scale 已超过同码率 block-all Vector 控制，但九组均只量化
  layer 0；原始 scalar GSQ matched PPL 尚未完成，暂不能声称超过原始 GSQ 或完整模型结果。

## 2026-08-20 20:49:02 CST：原始 GSQ 同数据单层对照首次运行（失败）

- 实验目的：用 Meta-Llama-3-8B、相同 FineWeb-Edu token cache 和 2.125 bpp scalar GSQ，为
  Vector-GSQ group256 建立 matched layer-0 PPL 对照。
- 配置：本地 `gpu22` 物理 GPU3 单卡；2-bit/group128；`self_attn=true`；20 epochs；8×4096
  train、8×4096 validation、64×4096 GPTQ；WikiText2 test seqlength=2048。
- 已完成结果：attention 与 MLP 的 GPTQ+GSQ 均完成并写出四个 layer-0 shard；量化耗时约
  264.6 秒，attention 最优 validation hard MSE 约 `3.18e-6`，MLP 最优约 `1.83e-5`。
- Shard 审计：Q/K/V/O/Gate/Up/Down 七个 Linear 均含 packed weight、group128 BF16 scale 和原始
  shape；有效码值为 2-bit，compressed-tensors 因无 uint2 格式使用 4-bit storage container。
- 失败原因：PPL wrapper 复用了训练时 4096 长度的 RoPE position embeddings，2048 长度输入在
  attention 中触发 shape mismatch；不是 OOM，也不是量化失败。
- 失败产物：`experiments/results/local_original_gsq/20260820_204902_llama3_8b_original_gsq_2bit_gate_gpu3/`。
- 结构化失败记录：`experiments/results/20260820_205338_llama3_8b_original_gsq_gate_gpu3_failed.json`。
- 处理：按当前 hidden sequence length 切片 position IDs、cache position 与 RoPE tensors，新增
  两个回归测试；修复后已转到 GPU6 单卡重新运行，完成结果将在独立时间戳条目记录。

## 2026-08-20 23:12:00 CST：原始 GSQ 完整 32 层 matched-seed 本地单卡基线（进行中）

- 实验目的：在相同 Meta-Llama-3-8B、相同 FineWeb-Edu token rows、相同 WikiText2 2048 PPL
  协议下，建立可与 rate-fair structure-aware Vector-GSQ 严格比较的原始 scalar GSQ 完整基线。
- 方法原理：每层依次运行 2-bit group128 GPTQ initialization 与官方 20-epoch Gumbel assignment/
  scale 优化；Q/K/V/O/Gate/Up/Down 全量化。2-bit codes + 每128权重一个 FP16 scale 的 logical
  rate 为 2.125 bpp；4-bit compressed-tensors 仅是物理容器，不计为方法码率。
- 实验配置：本机 `gpu22` 物理 GPU6，`CUDA_VISIBLE_DEVICES` 仅一个设备；显卡允许已有其他任务，
  启动门禁为剩余显存至少45000 MiB；seed0；8×4096 train、8×4096 validation、64×4096 GPTQ；
  WikiText2 test、seqlength2048、batch1；关闭逐层 PPL，32层结束后自动跑一次 exact PPL。
- 启动前修复与验证：全局 seed 在模型/Gumbel 之前同时约束 Python/NumPy/Torch CPU/CUDA；完整
  launcher 红绿灯、配置、Python 与 Bash 静态检查通过，正式启动前官方测试为 `13 passed`；
  启动后离线新增 scalar checkpoint 六任务审计器，当前全集增至 `18 passed`，不改变运行参数。
- 当前状态：23:12 已启动 fresh run，结果目录为
  `experiments/results/local_original_gsq/20260820_231200_llama3_8b_original_gsq_2bit_full_seed0_gpu6/`；
  首次 GPU/日志复查不早于23:59:31，尚无完整 PPL，不能提前给 full-model 质量结论。
- 结构化启动记录：
  `experiments/results/20260820_231200_llama3_8b_original_gsq_full_seed0_launch.json`。

### 2026-08-20 23:37 修正

- 该链路未进入 full quantization：前置的可选旧 layer0 standalone PPL 因 fresh wrapper 没有
  `position_embeddings` 而退出，`set -e` 阻断正式 launcher。GPU6 实际没有被本实验占用。
- 失败已保留在原启动 JSON；RoPE fresh-construction 红绿灯修复完成。正式 32层基线不再把可选
  prefix 补测放在前面，改到物理 GPU1 fresh 启动。

## 2026-08-20 23:39:06 CST：原始 GSQ 完整 32 层 matched-seed GPU1 重启（进行中）

- 实验目的、方法、数据和评测协议与上一个条目完全相同；仅修复 standalone RoPE 并把唯一可见
  物理卡切换到用户确认空闲的 GPU1。
- 启动证据：官方全集 `19 passed`；日志打印 `Random seed: 0`、run ID
  `20260820-233906_2eff78`，64条 GPTQ、8条 train、8条 validation input 捕获完成，已进入
  `Layer 1/32 — GPTQ` 并开始 q_proj，不是等待器或空进程。
- 结果目录：
  `experiments/results/local_original_gsq/20260820_234000_llama3_8b_original_gsq_2bit_full_seed0_gpu1/`。
- 结构化启动记录：
  `experiments/results/20260820_233906_llama3_8b_original_gsq_full_seed0_gpu1_launch.json`；
  下一次 GPU/日志查询不早于 2026-08-21 00:39:06 CST。

### 2026-08-20 23:43 CST：按研究优先级主动中止

- 该 run 已完成约 1 个 block，并进入后续层训练，但尚未形成完整 32 层 checkpoint/PPL/ACC，不能作为
  full-model GSQ 基线使用。
- 中止原因不是程序错误或 OOM：用户明确要求优先把唯一实验卡用于调优结构感知 Vector-GSQ，而不是
  继续消耗时间运行完整原始 GSQ。进程通过 Ctrl-C 正常退出，退出码 `130`；已有 partial shard 保留。
- 后续比较暂用已完成的同数据、同层 layer-0 scalar GSQ PPL（约 `6.6813`）作开发期参照；只有在
  Vector-GSQ 完整结果需要严格 full-model 对照时，才恢复原始 GSQ 完整基线。

## 2026-08-20 23:44:17 CST：结构感知 Vector-GSQ group160 全 32 层调优运行（进行中）

- 实验目的：优先验证并调优我们自己的结构感知 Vector-GSQ，在不超过原始 scalar GSQ 2.125 bpp
  的约束下，完成 LLaMA-3-8B 全模型量化、WikiText2 PPL 和六项准确率评测。
- 方法原理：每个 block 按 `q_proj → k_proj → v/o attention → MLP` 分阶段，以对应网络结构输出误差
  为目标，联合训练 vector assignment 与 input-group scale；阶段 checkpoint 对 assignment/scale
  成对选择，最终以 FP16 logical checkpoint reconstruction 做完整 block 回退门禁。
- 实验配置：Meta-Llama-3-8B；Vector d6、W2、K4096；GPTQ top128、7 Linear 并行；group160；
  q/k/v-o/MLP 各 1280 steps；seed0；64×4096 GPTQ、8×4096 train、8×4096 validation（512
  分段）；32 layers；exact logical rate `2.1207557091346154` bpp；WikiText2 seqlength2048；后续
  `lm_eval` 运行 ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande。
- 资源：本机 `gpu22`，仅物理 GPU1 可见并被占用；没有在服务器14运行。
- 启动证据：23:44:18 模型开始加载，23:44:21 完成 32 层加载，23:44:23 完成 train/validation/
  GPTQ hidden cache，随后进入 `layer=0` Hessian capture 并完成，不是空等待器或基线作业。
- 运行 ID：`20260820_234417_llama3_8b_full_staged_jointgroup160_seed0_gpu1`；入口：
  `code/GSQ_nowag_d1_20260716_015355/experiments/llama_qtip/run_llama3_8b_staged_jointgroup160_full_local.sh`。
- 当前状态：量化进行中；完成后同一单卡链路自动执行 PPL 与六任务评测。按约定下一次运行状态查询
  不早于 2026-08-21 00:44:25 CST。

### 2026-08-21 00:03 CST：Dense-teacher 与 all-7 joint refinement 单层方法消融

- 实验目的：判断 staged Vector-GSQ 的收益来自正确的 dense interface teacher，还是需要在四阶段后
  继续同时训练七个 Linear 的 assignment/group scale；固定 group160，不做 group-size 或 seed sweep。
- 方法原理：Q/K/attention/block teacher 全部由原始 dense block 生成；candidate 才合入已接受量化
  权重。对照在相同阶段结果后增加 20 epochs、共1280 steps 的 all-7 block joint refinement，并只接受
  FP16 部署态 hard validation 改善。
- 配置：Meta-Llama-3-8B layer0；d6、W2、K4096；Vector-GPTQ top128；64×4096 GPTQ、8×4096
  train、8×4096 validation；seed0；WikiText2 test，seqlength2048；本地物理 GPU1 单卡。
- Dense-teacher staged：2.1207557091 bpp，PPL `6.2163181305`，serialized block MSE
  `7.99818e-6`，耗时526.73秒。
- 追加 joint refinement：PPL `6.2192134857`，serialized block MSE `8.00259e-6`，耗时781.09秒；
  hard validation 从未改善，`accepted=false`。
- 结论：保留 dense teacher 修正，否决额外 all-7 joint refinement；最终 full 方法固定
  `block_polish_steps=0`，没有通过增加训练 steps 冒充方法改进。
- 产物：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_staged_tuning/`
  `20260821_000308_llama3_8b_dense_teacher_group160_seed0_gpu1_{staged,jointrefine20e}`。

## 2026-08-21 01:09–06:03 CST：Dense-teacher Vector-GSQ 全 32 层量化与评测（完成）

- 实验目的：在不高于 scalar GSQ 2.125 bpp 的码率下，验证结构感知 Vector-GSQ 是否能在
  Meta-Llama-3-8B 全模型保持语言建模与六项下游能力。
- 方法原理：每层依次训练 Q、K、V/O attention、MLP block；所有 teacher 都是原始 dense network，
  candidate/student 使用量化前缀以学习误差补偿；assignment 与 input-group scale 联合训练，阶段
  hard state 对 assignment/FP16 scale 成对快照，最后用 fresh logical reconstruction 做 block gate。
- 实验步骤：构建 hidden/GPTQ cache；每层七 Linear 并行捕获 Hessian，运行 NoWag + top128
  Vector-GPTQ；执行四阶段 Vector-GSQ；写入 logical checkpoint；32层完成后独立 fresh reconstruct，
  运行 WikiText2 test PPL 与六项 lm_eval 0-shot。
- 配置：Meta-Llama-3-8B；d6/W2/K4096；group160；每阶段1280 steps；64×4096 GPTQ、8×4096
  train、8×4096 validation（训练/验证按512分段）；seed0；单卡本地物理 GPU1；没有使用服务器14。
- 量化结果：32/32层、224/224 Linear；logical bpp `2.1207557091346154`；32/32 logical gates
  通过；全部 fresh reconstruction exact；量化耗时15892.61秒（4.4146小时），峰值显存30.136 GiB；
  checkpoint 4,760,031,493 bytes。
- WikiText2：test split、seqlength2048、batch1，PPL `10.497865676879883`，评测57.36秒。
- 六任务：ARC-C `0.4180887372`、ARC-E `0.6927609428`、HellaSwag `0.6565425214`、LAMBADA
  `0.6576751407`、PIQA `0.7437431991`、WinoGrande `0.6890292028`；macro `0.6429732907`。
- 相比旧 block-all Vector-GSQ（2.019494 bpp，PPL10.740633，macro0.643045），新方法 PPL 改善
  0.242767（2.26%），macro 基本不变；两者码率不同，因此只作为内部方向证据，不作 rate-matched 胜负。
- 产物：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_staged_tuning/`
  `20260821_010925_llama3_8b_full_dense_teacher_staged_group160_seed0_gpu1/`；结构化完成记录：
  `experiments/results/20260821_083000_llama3_8b_dense_teacher_vector_gsq_full_completion.json`。

## 2026-08-21 06:16–07:51 CST：原始 scalar GSQ 断点恢复与 matched full 对照（完成）

- 实验目的：在我们的方法完成后，补齐相同模型、码率上界、token rows、seed 和评测协议的原始
  scalar GSQ 全模型对照；这是最终验证，不是优先于新方法的调参实验。
- 方法与配置：从 `20260820-233906_2eff78` 的 `last_completed_layer=0` 恢复；2-bit group128、
  20 epochs、全量化Q/K/V/O/Gate/Up/Down；64×4096 GPTQ、8×4096 train、8×4096 validation；
  seed0；本地物理 GPU1 单卡；logical bpp 2.125。
- 完整性审计：32层、224 Linear、所有 shape/group scale/code range 有效；有效码率2.125 bpp；
  独立 PPL 与 lm_eval materialization 均完成，不存在缺 shard 或 meta parameter。
- 结果：WikiText2 test seqlength2048 PPL `670.1599291502`；ARC-C `0.2406143345`、ARC-E
  `0.3695286195`、HellaSwag `0.3272256523`、LAMBADA `0.0213467883`、PIQA `0.5712731230`、
  WinoGrande `0.5114443567`，六任务 macro `0.3402388124`。
- 严格 Gate：Vector 2.1207557091 bpp不高于2.125 bpp，且PPL与六任务均明显更好；完整 comparator
  给出 `vector_exceeds_original_gsq=true`。
- 重要限制：这是同低校准预算比较。官方 README 推荐 4096 train/128 validation，且公开 Llama 表
  使用 Llama-3.1-8B-Instruct；因此不能把当前 scalar 数字称为官方论文大预算复现或直接对比公开表。
- 对照产物：`experiments/results/local_original_gsq/`
  `20260820_234000_llama3_8b_original_gsq_2bit_full_seed0_gpu1/`；比较 JSON：
  `experiments/results/20260821_083000_llama3_8b_dense_teacher_vector_gsq_vs_original_scalar_gsq_full.json`。
## 2026-08-21 09:12：LLaMA-3-8B group160 层级 hybrid search（本地 GPU0，已完成/否决）

- 实验目的：恢复 dense-teacher group160 在 ARC-C/ARC-E/HellaSwag 上相对旧 Vector-GSQ 的 ACC
  损失，同时保持 PPL 不高于旧方法 10.740633，且码率不高于 2.1207557091 bpp。
- 方法原理：以 group160 为 base、旧 block-all logical checkpoint 为 donor，预注册 early 0--3、
  late 28--31、edge 0--3+28--31 三个完整层 rollback 候选，逐候选执行 fresh reconstruction。
- 实验配置：Meta-Llama-3-8B；WikiText2 test seqlength=2048；ARC-C/E、HellaSwag、LAMBADA、
  PIQA、WinoGrande 0-shot；batch size=1；本机物理 GPU0 A100 80GB；启动握手空余 58245 MiB。
- 执行约束：按用户最新指令仅在本地运行，不连接 10.30.0.14；实验运行期间每小时最多轮询一次。
- 预注册 Gate：PPL <= 10.740633、macro6 > 0.6429732907、PIQA >= 0.7437431991。
- 结果：early PPL/macro6=`10.547857/0.636438`；late=`10.511694/0.640273`；
  edge=`10.558009/0.632708`。late 虽提高 ARC-E/Hella/PIQA，但三者 macro6 均低于 group160 base
  `0.642973`，全部未通过预注册 Gate，未替换当前推荐 checkpoint。
- 状态：已完成并否决简单 boundary rollback；结构化启动记录见
  `experiments/results/20260821_091200_llama3_8b_group160_layer_hybrid_search_local_gpu0_launch.json`，
  完成汇总见 `experiments/results/20260821_112200_llama3_8b_group160_layer_hybrid_search_local_gpu0_complete.json`，
  完整报告见 `report/20260821_091200_llama3_8b_group160_layer_hybrid_search_local_gpu0_launch_report.md`。

## 2026-08-21 11:25：LLaMA-3-8B 任务监督末端 group-scale 校准（本地 GPU0，已完成/部分有效）

- 实验目的：在 assignment/codebook 和 logical bpp 不变的条件下，提高 group160 的选择题 ACC，
  重点修复 ARC-C/E 与 HellaSwag，同时保护 PIQA 和语言建模能力。
- 方法原理：只学习 layer 28--31 已存在 group scale 的有界 multiplicative delta；任务监督来自
  ARC-C/E、HellaSwag、PIQA、WinoGrande training split 的正确选项 normalized log-likelihood，
  并用 dense teacher choice KL 约束。每任务固定 8 train/4 validation/4 audit，三组互斥。
- 实验配置：Meta-Llama-3-8B；2 epochs；LR=0.002；gradient accumulation=4；KL weight=0.25；
  `|log_delta|<=0.08`；正式评测为 WikiText2 test seqlength=2048 和六任务 0-shot lm_eval。
- 数据隔离：正式 validation/test 均不参与训练、校准选择或 audit；结果只记录索引和 request hash，
  不保存题目正文。
- 执行约束：仅本地物理 GPU0；启动空余显存约 57663 MiB，安全下限 48000 MiB；每小时最多轮询一次。
- 结果：PPL `10.491595`（优于 base 10.497866）；ARC-C/Hella/PIQA 分别 +0.006826/+0.003784/
  +0.004353，QA5 平均从 0.640033 升至 0.642520；LAMBADA -0.031050，导致 macro6 从 0.642973
  降至 0.639871。bpp 保持 2.1207557091，32/224 fresh reconstruction exact。
- 结论：选择题方向有效，但六任务 Gate 因 LAMBADA 回退而失败，不替换 group160；下一轮加入
  disjoint FineWeb-Edu dense-teacher top-k token guard。
- 状态：已完成；结构化启动记录见
  `experiments/results/20260821_112500_llama3_8b_task_group_scale_l28_31_local_gpu0_launch.json`，
  完成汇总见 `experiments/results/20260821_122700_llama3_8b_task_group_scale_l28_31_local_gpu0_complete.json`，
  报告见 `report/20260821_112500_llama3_8b_task_group_scale_l28_31_local_gpu0_report.md`。

## 2026-08-21 12:31：任务监督 + FineWeb-Edu top-k text guard（本地 GPU0，已完成/no-op）

- 实验目的：保留上一轮 ARC-C/Hella/PIQA 与 QA5 收益，同时防止 LAMBADA 大幅回退。
- 方法原理：沿用 layer 28--31 task group-scale 校准，并加入 dense teacher 的长文本 top-32 token
  distribution cross-entropy；validation epoch 只有在任务 macro/loss 改善且 text guard 相对 base
  回退不超过 0.1% 时才允许入选。
- 数据配置：任务数据仍为每任务 8/4/4 training-split 互斥划分；FineWeb-Edu cache 预注册 rows
  train=`4400--4403`、validation=`4410--4411`、audit=`4420--4421`，长度 256；这些行未用于原
  group160 的 0--63 calibration、4096--4103 validation 或 4224 起 GPTQ 区间。
- 模型/训练：Meta-Llama-3-8B；layer 28--31；2 epochs；LR=0.002；choice KL weight=0.25；
  text guard weight=1.0；`|log_delta|<=0.08`；assignment/codebook/bpp 固定。
- 正式评测：WikiText2 test seqlength=2048；六任务 0-shot lm_eval；正式测试集不参与调优。
- 执行位置：仅本地物理 GPU0；启动前 GPU0 完全空闲，81151 MiB 可用；每小时最多轮询一次。
- 结果：epoch1/2 text validation CE 从 base 2.133570 改善至 2.104348/2.099130，但每任务仅 4 个
  validation 样本，ARC-C 从 2/4 变成 1/4，macro 从 0.75 降到 0.70；两轮均被拒绝。
- 结论：`best_epoch=0`，最终 checkpoint 是 group160 exact no-op；PPL、六任务逐项和 bpp 均完全一致。
  下一轮扩大任务 split 至 32/32/32，并把 text weight 从 1.0 降到 0.25。
- 状态：已完成；记录见
  `experiments/results/20260821_123100_llama3_8b_task_group_scale_textguard_local_gpu0_launch.json`，
  完成汇总见 `experiments/results/20260821_133500_llama3_8b_task_group_scale_textguard_local_gpu0_complete.json`，
  报告见 `report/20260821_123100_llama3_8b_task_group_scale_textguard_local_gpu0_report.md`。

## 2026-08-21 13:35：Balanced 大样本 task + text guard（本地 GPU0，已完成/接受）

- 实验目的：降低小 validation split 的单题翻转方差，在保留 text guard 的同时恢复任务 ACC 优化方向。
- 变更：每任务从 8/4/4 扩展至 32 train/32 validation/32 audit；text guard weight 从 1.0 降至
  0.25；text rows 扩为 8/4/4，其他模型、层、LR、epoch、码率与正式评测协议不变。
- 数据：五个任务均只用 training split；FineWeb-Edu rows train 4400--4407、validation 4410--4413、
  audit 4420--4423；正式 benchmark validation/test 不参与调优。
- 执行：仅本地物理 GPU0；启动前约 80036 MiB 空余；每小时最多轮询一次。
- 结果：internal validation macro `0.6625 -> 0.66875`、balanced loss `0.889948 -> 0.851476`、
  text CE `2.112687 -> 2.076474`，选择 epoch1；正式 PPL=10.681540，QA5=0.646092，
  macro6=0.645144。ARC-C/E/PIQA 相对 group160 +0.011945/+0.018519/+0.008705。
- Gate：2.1207557091 bpp 不变；PPL 优于旧 Vector-GSQ 10.740633；macro6 高于 group160
  0.642973；PIQA 不低于 group160；全部通过。接受为 ACC-optimized 主候选。
- 限制：相对 group160 PPL 回退 0.183674，LAMBADA -0.017271；公开 VPTQ 2.08-bit PPL=9.29，
  故尚不能声称 PPL/SOTA 全面领先。
- 状态：已完成；记录见
  `experiments/results/20260821_133500_llama3_8b_task_group_scale_textguard_balanced_local_gpu0_launch.json`，
  完成汇总见 `experiments/results/20260821_143800_llama3_8b_task_group_scale_textguard_balanced_local_gpu0_complete.json`，
  报告见 `report/20260821_133500_llama3_8b_task_group_scale_textguard_balanced_local_gpu0_report.md`。

## 2026-08-21 14:43：Group-scale 插值内部选择矩阵（本地 GPU3，已完成）

- 目的：在保留 ACC 主候选收益的同时，选择尽可能小的 scale delta 以收回 PPL。
- 候选：group160 base 与 accepted balanced checkpoint 的 log-scale alpha=0/0.25/0.5/0.75/1；
  assignment/codebook/row_norm/col_norm 必须逐张量完全一致，bpp 固定。
- 内部协议：五任务 training split 新 seed991、64 samples/task；WikiText validation seqlength=2048；
  不运行正式六任务 lm_eval 或 WikiText test。
- 选择：task macro 不低于 alpha0 且 balanced loss 严格更低的候选中，选择最小 alpha；之后只正式
  评测一个选中 checkpoint。
- 执行：GPU0/1 已被占用，选择完全空闲的本地物理 GPU3（81151 MiB 可用）；每小时最多轮询一次。
- 结果：alpha0 task macro/loss/val-PPL=`0.6625/0.895839/10.751867`；alpha0.25=
  `0.665625/0.886442/10.671192`；alpha0.5=`0.671875/0.876544/10.667872`；alpha0.75=
  `0.684375/0.869097/10.764278`；alpha1=`0.6875/0.861492/10.981079`。
- 选择：alpha0.25 是最小的 macro 不回退且 balanced loss 改善候选，按预注册规则选中；内部阶段
  未访问正式测试集，五个 checkpoint 均 2.1207557091 bpp、fresh exact。
- 状态：已完成；记录见
  `experiments/results/20260821_144300_llama3_8b_group_scale_interpolation_selection_local_gpu3_launch.json`，
  完成汇总见 `experiments/results/20260821_154700_llama3_8b_group_scale_interpolation_selection_local_gpu3_complete.json`，
  报告见 `report/20260821_144300_llama3_8b_group_scale_interpolation_selection_local_gpu3_report.md`。

## 2026-08-21 15:48：选中 alpha0.25 的单次正式评测（本地 GPU3，已完成/接受）

- 候选：内部选择得到的 group-scale log interpolation alpha=0.25；2.1207557091 bpp。
- 协议：WikiText2 test seqlength=2048、batch1；ARC-C/E、HellaSwag、LAMBADA、PIQA、WinoGrande
  六任务 0-shot lm_eval。没有继续评测其他 alpha。
- 执行：本地物理 GPU3，上一内部矩阵结束后显存完全释放；每小时最多轮询一次。
- 结果：2.1207557091 bpp，PPL=10.414440，QA5=0.642940，macro6=0.644425；相对 group160
  PPL -0.083426、QA5 +0.002907、macro6 +0.001452。ARC-E/PIQA 分别 +0.007997/+0.006529。
- 结论：同时严格改善 group160 与旧 Vector-GSQ 的 PPL/macro6，接受为当前综合 Pareto 主 checkpoint；
  full tuned 仍作为最高 ACC 候选。公开 VPTQ PPL 9.29 仍更低，尚非全面 SOTA。
- 状态：已完成；记录见
  `experiments/results/20260821_154800_llama3_8b_alpha025_formal_local_gpu3_launch.json`，报告见
  `report/20260821_154800_llama3_8b_alpha025_formal_local_gpu3_report.md`，完成汇总见
  `experiments/results/20260821_165000_llama3_8b_alpha025_formal_local_gpu3_complete.json`。

## 2026-08-21 16:50：Budget256 Group160 单层 Gate（本地 GPU7，已完成/通过）

- 目的：在投入约 4 倍完整量化时间前，先验证提高校准预算能否改善 layer0 的量化后 PPL。
- 方法：保持 staged dense teacher、joint group160、steps=1280、seed0 等全部方法参数不变，只把
  calibration/train/validation sequences 从 64/8/8 提高到 256/32/32；仅量化 layer0 并评测
  prefix depth1 PPL，与现有相同 group160 layer0 PPL 6.216318 比较。
- 数据：FineWeb-Edu token cache；calibration rows 0--255；validation rows 4096--4127；GPTQ offset
  4224 保持不变，validation 与 GPTQ 区间不重叠。
- Gate：layer0 PPL 必须严格低于 6.216318，且 logical bpp 仍为 group160 目标，才考虑完整 32 层长跑。
- 执行：本地物理 GPU7，启动前完全空闲、81151 MiB 可用；每小时最多轮询一次。
- 结果：2.1207557091 bpp；layer0 PPL `6.216318 -> 6.210145`，严格改善 0.006173；耗时
  577.62 秒、layer 510.46 秒、峰值显存约 28.41 GB，Gate 通过。
- 决策：预计 32 层约 4.5 小时，启动完整 budget256 量化与正式评测。
- 状态：已完成；记录见
  `experiments/results/20260821_165000_llama3_8b_group160_budget256_gate_local_gpu7_launch.json`，报告见
  `report/20260821_165000_llama3_8b_group160_budget256_gate_local_gpu7_report.md`，完成汇总见
  `experiments/results/20260821_175500_llama3_8b_group160_budget256_gate_local_gpu7_complete.json`。

## 2026-08-21 17:55：Budget256 Group160 完整 32 层（已完成/接受为新主模型）

- 目的：验证单层高预算改善能否累积到完整模型，并缩小与公开强 PPL 基线的差距。
- 方法：与当前 group160 完全相同的 staged dense teacher、joint group scale、group160、1280 steps、
  seed0；只把 calib/train/validation 固定为 256/32/32。完成量化后自动执行 WikiText2 test
  seqlength=2048 与六任务 0-shot lm_eval。
- Gate：首先要求 2.1207557091 bpp、32/224 fresh exact；然后比较 group160 PPL 10.497866、当前
  alpha0.25 PPL/macro `10.414440/0.644425` 与 ACC full tuned `10.681540/0.645144`。
- 执行：本地物理 GPU7；单层结束后约 75911 MiB 空余，要求至少 45000 MiB；每小时轮询一次。
- 量化结果：32/32层，2.1207557091 bpp，耗时20284.22秒（5.6345小时），峰值约30.067 GiB，
  checkpoint 4,760,031,429 bytes。流水线随后完成 PPL；GPU7 上首次六任务评测约 18% 时因同卡外部
  资源竞争中断且无 traceback/summary，因此不重跑量化或 PPL，只在本地 GPU1 离线补跑 ACC，
  tmux=`vg_budget256_acc_retry_20260821_235850`，未连接 10.30.0.14。
- 正式结果：WikiText2 test PPL=`9.892660`；ARC-C/E=`0.430034/0.689394`、HellaSwag=
  `0.679148`、LAMBADA=`0.672036`、PIQA=`0.759521`、WinoGrande=`0.680347`，macro6=`0.651747`，
  不含 LAMBADA 的五任务 QA 均值=`0.647689`。
- 比较：相对64/8/8 group160，PPL -0.605206、macro +0.008773；相对alpha0.25旧主checkpoint，
  PPL -0.521780、macro +0.007321。在相同2.1207557091 bpp下严格支配全部既有综合候选，接受为
  新的当前主checkpoint。结论是低校准预算确实显著限制质量，但该配置仍低于官方4096/128/512。
- 状态：已完成；记录见
  `experiments/results/20260821_175500_llama3_8b_group160_budget256_full_local_gpu7_launch.json`，报告见
  `report/20260821_175500_llama3_8b_group160_budget256_full_local_gpu7_report.md`，完成汇总见
  `experiments/results/20260822_005000_llama3_8b_group160_budget256_full_complete.json`。

## 2026-08-21 18:59：官方 GSQ 数据协议 Vector-GSQ 单层 Gate（本地 GPU6，已完成/通过）

- 目的：修正低校准预算不能代表官方协议的问题，以论文级数据规模评估当前方法。
- 方法：dense-teacher staged joint group160，d6/W2、seed0；4096 train、128 validation、512独立
  GPTQ/Hessian，全部4096-token且不切段；batch64、microbatch2、10 epochs=640 steps/phase。
- 数据：cache identity=`sample-10BT|...|len=4096|n=4736|seed=0|shuffle=1234|buffer=100000`；
  train `[0,4096)`、validation `[4096,4224)`、GPTQ `[4224,4736)`，完整覆盖且互不重叠。
- 资源：本机约834 GiB可用内存；物理GPU6启动前81151 MiB空闲；GPU7上的budget256实验不受影响。
- Gate：layer0 prefix PPL=`6.2016038895`，优于64/8/8的`6.2163181305`与256/32/32的
  `6.210145`；serialized block MSE下降39.188%，logical gate及七Linear重建通过。
- 成本：总耗时7243.82秒（2.012小时），峰值显存27.917 GiB；外推32层约63小时量化。
- 代码验证：新增测试先因入口缺失红灯，完成实现后 `23 passed, 2 warnings`；三个shell入口通过
  `bash -n`，dry-run参数展开完全匹配上述协议。
- 启动记录：`experiments/results/20260821_190000_llama3_8b_official_gsq_protocol_gate_local_gpu6_launch.json`；
  完成记录：`experiments/results/20260821_214500_llama3_8b_official_gsq_protocol_gate_local_gpu6_complete.json`；
  报告：`report/20260821_190000_llama3_8b_official_gsq_protocol_gate_local_gpu6_report.md`。

## 2026-08-21 21:50--2026-08-24 15:13：官方 GSQ 数据协议 Vector-GSQ 完整32层（本地单卡，已恢复完成）

- 目的：在单层Gate确认大数据协议改善后，获得可用于GSQ/QTIP比较的完整模型PPL与六任务结果。
- 配置：与通过的Gate完全一致：FineWeb-Edu 4096/128/512、4096-token无切段、batch64、micro2、
  10 epochs/640 steps、d6/W2/group160、seed0；仅将max_layers从1改为32。
- 设备：本机物理GPU1；启动前约59203 MiB空闲，Gate峰值仅约28600 MiB，设置50000 MiB门禁；
  允许同卡已有空闲驻留进程，但总剩余显存满足安全余量。
- 预期：量化约63--70小时；完成后自动执行WikiText2 test seqlength2048及六任务0-shot lm_eval。
- 首次运行进度：layer0--17已完整原子提交；2026-08-23 10:34在layer18 `v_o`阶段被SIGKILL，
  退出137。checkpoint为2,677,516,933 bytes，quantization JSON记录18层；重算logical bpp与JSON
  均为`2.1207557091346154`，故中断没有破坏已完成层。
- 中断分析：运行期间同机/同卡新增高RSS和GPU任务，原非流式teacher的宿主峰值约500 GiB级，
  swap耗尽后进程被系统终止；无Python/CUDA traceback。该事故不构成算法效果结果。
- 恢复方法：新增`--resume`从logical checkpoint恢复18层并重放hidden cache；新增
  `--stream-dense-targets`按microbatch现算完全相同的dense teacher，把预计宿主峰值降至约200 GiB级。
  真实checkpoint完整性、七Linear覆盖和bpp已通过审计；39项相关回归测试通过。
- 续跑：2026-08-23 13:12 在本地物理GPU0满足70 GiB显存与300 GiB宿主内存门禁后，从layer18
  恢复；先重放0--17层hidden cache，再继续18--31层。全程只占用一张GPU，每小时一次轮询。
- 完整性：32/32层、128/128结构阶段、224/224 Linear均完成；32层dense teacher、global gate和
  logical gate全部通过；224个fresh reconstruction与metadata rounding均为exact；终端退出码0。
- 正式结果：logical bpp=`2.1207557091346154`；WikiText2 test、seqlength2048 PPL=
  **9.0402584076**；ARC-C/E=`0.446246/0.726852`、HellaSwag=`0.697371`、LAMBADA=
  `0.681933`、PIQA=`0.771491`、WinoGrande=`0.681926`；六任务macro=**0.6676363403**，
  不含LAMBADA的五任务macro=`0.6647770374`。
- 比较：相对32/32/256（train/validation/GPTQ）主checkpoint，PPL相对下降8.62%，六任务macro
  提高1.5890个百分点；相对
  8/8/64 dense-teacher checkpoint，PPL相对下降13.88%，macro提高2.4663个百分点。它是目前
  最强的结构感知Vector-GSQ checkpoint，并超过同模型低预算scalar GSQ复现。
- 结论边界：GSQ README公开68.55%使用Llama-3.1-8B-Instruct与五任务；本轮Meta-Llama-3-8B
  base五任务为66.48%，模型不匹配，既不能据此声称超过公开GSQ，也不能作严格失败结论。下一步
  优先做anchor-local assignment的task-functional+dense-text-guard方法优化，不扫描group或seed。
- 启动记录：`experiments/results/20260821_215000_llama3_8b_official_gsq_protocol_full_local_gpu1_launch.json`；
  报告：`report/20260821_215000_llama3_8b_official_gsq_protocol_full_local_gpu1_report.md`；恢复记录：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/local_staged_tuning/20260821_215000_llama3_8b_full_staged_jointgroup160_officialgsq4096_128_512_seed0_gpu1/resume_recovery_20260823_110000.json`；
  恢复报告：`report/20260823_110000_llama3_8b_official_gsq_resume_recovery_report.md`；完成摘要：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260824_153000_llama3_8b_official_protocol_vector_gsq_full_complete.json`；
  完整报告：`report/20260824_153000_llama3_8b_official_protocol_vector_gsq_full_result_report.md`。

## 2026-08-24 16:00--20:46：任务功能梯度训练局部assignment（本地GPU0，已完成/no-op）

- 目的：固定官方规模2.1207557-bpp checkpoint的codebook/normalizer/group scale，直接训练当前
  codeword局部邻域内的assignment，检验论文第三创新点能否提高下游能力。
- 方法：layer28--31的每个hard ID先建8-way几何邻域，再用五任务training split与FineWeb text
  teacher的权重梯度选一个一阶最优alternative；训练anchor/alternative binary Concrete logit。
- 数据：每任务64/64/64 train/validation/audit；FineWeb rows 8/4/4、length256、top-k32；正式
  benchmark validation/test不参与训练或选择。2 epochs、LR0.005、text weight0.25。
- 执行：队列在物理GPU0达到65 GiB空余后自动启动；全程本地单卡，未访问10.30.0.14；校准
  2325.64秒，峰值CUDA allocated约25.60 GB；终端退出码0。
- 结果：98.22%向量存在负一阶delta；epoch2切换320,990/145,465,344 assignments（0.2207%），
  validation balanced loss `0.802655 -> 0.781163`且五任务loss全部改善；但macro从0.709375降到
  0.700000，text CE相对回退0.257%，未通过macro优先+text 0.1% Gate。
- 最终：`best_epoch=0`，exact回滚；PPL=`9.0402584076`、六任务macro=`0.6676363403`，逐项与源
  checkpoint一致，码率不变。该结果证明训练方向存在，但当前离散selector对64样本边界翻转敏感。
- 后续：预注册loss-dominance+独立audit Gate；不改变LR、epoch、层或邻域，避免把selector修正
  变成超参数扫描。
- 产物：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_task_local_assignment_textguard/20260824_160000_llama3_8b_task_local_assignment_textguard_l28_31_gpu0/`；
  报告：`report/20260824_221500_llama3_8b_task_local_assignment_textguard_noop_report.md`。

## 2026-08-24 22:20--23:26：Loss-dominance 局部assignment（本地GPU2，已完成/接受）

- 目的：保持上一轮assignment训练配方不变，只用连续loss主导+独立audit修正64样本accuracy selector，
  验证局部assignment训练是否真正改善正式下游能力。
- 方法与配置：Meta-Llama-3-8B、源checkpoint 2.1207557091 bpp；layers28--31、8-way梯度proposal、
  binary Concrete、2 epochs、LR0.005；每任务64/64/64 train/validation/audit，FineWeb 8/4/4行、
  length256。validation和audit均要求balanced loss至少改善0.5%，macro最多回退1pp、单任务loss和
  text CE最多回退0.5%。
- 执行：本机物理GPU2，只暴露一张卡，未访问10.30.0.14；校准2326.71秒，完整流水线终端退出0。
- 校准：epoch2被选中；validation loss改善2.678%，audit loss改善3.051%、macro提高1.5625pp、
  text CE改善0.882%，audit Gate通过。切换320,990/145,465,344 assignments（0.220664%）；码率、
  固定metadata和fresh reconstruction均exact。
- 正式结果：WikiText2 test seqlen2048 PPL=`9.171975`（相对源9.040258退化1.457%）；ARC-C/E=
  `0.453072/0.750000`、Hella=`0.701255`、LAMBADA=`0.685426`、PIQA=`0.770947`、Wino=`0.694554`；
  macro6=`0.6758755190`，相对源提高0.8239pp；五任务macro=`0.6739654297`，提高0.9188pp。
- 结论：局部assignment训练首次在独立audit后转化为正式ACC改善，但当前少量text guard未保护住
  WikiText2 PPL；五任务数值比不同模型GSQ headline 68.55%低1.1535pp，仅可作描述而不能判胜负。下一轮采用
  confidence-projected sparse hard path和更大互斥FineWeb guard，不扫描group/seed/LR。
- 产物：完成JSON=`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260825_002236_llama3_8b_task_local_assignment_lossgate_complete.json`；
  报告=`report/20260825_002236_llama3_8b_task_local_assignment_lossgate_result_report.md`。

## 2026-08-25 00:30--01:39：大文本 confidence projection（本地GPU2，已完成/no-op）

- 目的：用固定1/8、1/4、1/2、full confidence hard path减少上一轮320,990 switches造成的PPL退化；
  FineWeb guard扩大为互斥80/64/64行、length1024，其他训练配方不变。
- 执行：本机物理GPU2，单卡可见，未访问10.30.0.14；终端退出0，校准2564.78秒。
- 结果：epoch2 balanced loss改善2.116%，277,652个full switches；但64/task macro回退1.5625pp，
  full-state macro Gate在projection前将其拒绝，导致`projection_history=[]`，最终exact回滚。
- 正式复核：PPL=`9.0402584076`、macro6=`0.6676363403`、switch=0、2.1207557091 bpp，全部与源
  checkpoint一致。该实验没有检验到confidence projection效果。
- 失败原因与修复：macro/text是projected部署态Gate，不应阻止具有连续loss收益的full logits成为
  projection source。下一轮source prefilter只保留balanced/per-task loss条件，macro/text仍用于每个
  projected candidate和独立audit；不改变训练超参数。
- 产物：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260825_023201_llama3_8b_confidence_projection_prefilter_noop.json`；
  报告=`report/20260825_023201_llama3_8b_confidence_projection_prefilter_noop_report.md`。

## 2026-08-25 02:35--04:00：Confidence projection source Gate修复（本地GPU2，已完成/接受）

- 目的：修正上一轮错误的full-state macro prefilter，让连续任务loss已改善的完整assignment logits
  真正进入confidence hard projection；不改变LR、epoch、group、seed、训练层或邻域大小。
- 方法与配置：Meta-Llama-3-8B官方规模Vector-GSQ源checkpoint，2.1207557091 bpp；layers28--31、
  8-way局部proposal、binary Concrete、2 epochs、LR0.005；每任务64/64/64 train/validation/audit；
  FineWeb互斥80/64/64行、length1024；固定1/8、1/4、1/2、full嵌套confidence路径。
- 选择结果：epoch2完整状态有277,412 switches；1/4路径的69,353 switches通过validation Gate，
  仅占145,465,344个assignment的0.0476766%。独立audit balanced loss改善0.8238%、macro提高
  1.25pp、FineWeb文本CE改善0.6274%，且五项逐任务loss全部改善，audit Gate通过。
- 正式结果：WikiText2 test seqlen2048 PPL=`9.0377330780`，相对源`9.0402584076`改善0.0279%；
  ARC-C/E=`0.452218/0.734848`、Hella=`0.698865`、LAMBADA=`0.689889`、PIQA=`0.769859`、
  Wino=`0.685083`；macro6=`0.6717937471`，提高0.4157pp；五任务macro=`0.6681746195`，提高
  0.3398pp。码率及固定metadata exact不变，终端退出0。
- 结论：该checkpoint首次同时严格改善源模型PPL与六任务macro，证明稀疏hard projection解决了
  上轮task gain/PPL regression冲突。五任务与不同模型GSQ README 68.55%存在表面1.7325pp差值，
  但跨模型无法判断哪种方法更优；下一步以该稀疏checkpoint为新anchor做重新计算邻域梯度的迭代refinement，
  不扫描group/seed/LR。
- 产物：完成JSON=`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260825_043724_llama3_8b_confidence_projection_gatefix_complete.json`；
  报告=`report/20260825_043724_llama3_8b_confidence_projection_gatefix_result_report.md`。

## 2026-08-25 04:45--06:07：Iterative neighborhood-refresh stage 2（本地GPU2，已完成/ACC接受）

- 目的：以第一阶段PPL/ACC Pareto改善的69,353-switch checkpoint为新anchor，重新计算当前hard
  状态附近的任务功能梯度和局部alternative，再执行第二个confidence-projected trust-region步。
- 方法边界：group160、d6/K4096/W2、layers28--31、8-way邻域、2 epochs、LR0.005、seed0与所有
  Gate保持不变；不是group/seed/LR调参，也不放宽已预注册的loss/text/macro约束。
- 新数据协议：任务在同一seed0确定性排列上使用offset192的下一组互斥64/64/64样本；FineWeb
  使用rows 80--159 train、4224--4287 validation、4288--4351 audit，均与第一assignment阶段互斥。
- 设备：仅本机物理GPU2可见，不使用10.30.0.14；启动前GPU2有81154 MiB空余、宿主可用内存
  878.6 GiB。旧远端失败重试中的一个21,474,836,480-byte可再生成activation cache已可恢复地迁移
  到`/tmp/stom_cache_evacuated_20260825/`，未删除checkpoint、JSON、日志或报告，为本轮释放写盘空间。
- 启动：04:46:40正式启动，模型与五项任务training split已正常加载，终端进入dense-teacher
  multiple-choice score采集；统一exec session=`8224`，无启动异常。
- 校准结果：从459,846个full switches中选择1/8路径的57,481个（全部assignment的0.0395153%）；
  validation balanced loss改善0.8401%、macro提高0.625pp、FineWeb CE改善0.2341%；独立audit loss
  改善0.7456%、macro提高0.3125pp、FineWeb CE改善0.2656%，Gate通过。
- 正式结果：PPL=`9.0496139526`，相对stage1退化0.1315%；ARC-C/E=`0.460751/0.737795`、
  Hella=`0.699960`、LAMBADA=`0.694935`、PIQA=`0.769859`、Wino=`0.689029`；macro6=
  `0.6753880612`（stage1基础上+0.3594pp），五任务macro=`0.6714786756`（+0.3304pp）。
- 结论：第二个互斥refresh阶段继续带来正式ACC收益，但PPL轻微回退，因此它是当前ACC最优分支，
  不是新的PPL/ACC Pareto点。与不同模型GSQ 68.55%的1.4021pp表面差值不具判胜负效力；下一步预注册剩余
  三个互斥阶段并只在最终端点正式评测，避免中间test用于checkpoint选择。
- 完成摘要：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260825_064948_llama3_8b_iterative_assignment_refinement_stage2_complete.json`；
  报告：`report/20260825_064948_llama3_8b_iterative_assignment_refinement_stage2_report.md`。

## 2026-08-25 06:54--09:37：Iterative assignment stage3--5预注册链（本地GPU2，已完成/Stage 3接受）

- 目的：在stage2 ACC分支上固定完成剩余三轮neighborhood refresh，检验互斥校准窗口下任务收益能否
  继续累积至GSQ公开68.55%的非匹配表面目标；不依据stage3/4正式test结果选择是否继续。
- 固定方法：layers28--31、8-way邻域、2 epochs/stage、LR0.005、seed0、1/8--full confidence路径与
  validation/audit Gate均不变。stage3/4采用calibration-only模式，stage5端点才运行WikiText2 test
  seqlength2048和六任务lm_eval。
- 数据：任务offset=`384/576/768`；FineWeb train分别`160--239/240--319/320--399`，对应validation/
  audit为`4352--4415/4416--4479`、`4480--4543/4544--4607`、`4608--4671/4672--4735`；所有窗口
  彼此及stage1/2互斥，seed始终为0。
- 执行：只允许本机物理GPU2可见，三个阶段严格串行，不访问10.30.0.14；按1小时静默轮询，
  09:37:03终端正常退出0。
- 启动记录：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260825_070000_llama3_8b_iterative_assignment_refinement_stage3_5_chain_launch.json`。
- Stage 3：1/8路径接受46,861个switch（全部assignment的0.0322145%）；validation loss和FineWeb
  CE均下降，独立audit balanced loss从0.812187降至0.808076、macro从69.375%升至70.3125%，
  audit Gate通过。Stage 4/5没有任何projection满足预注册validation Gate，均以best epoch0和0 switch
  精确回滚，所以最终正式端点等价于Stage 3 checkpoint。
- 正式结果：PPL=`9.0557212830`；ARC-C/E=`0.459898/0.742424`、Hella=`0.703346`、
  LAMBADA=`0.700951`、PIQA=`0.768770`、Wino=`0.685872`；macro6=`0.6768768740`，五任务macro=
  `0.6720620684`。相对原始Vector-GSQ，macro6累计+0.9241pp、五任务+0.7285pp，PPL退化0.1710%。
- 结论：固定末四层的同层refresh在第三轮之后饱和，第四/五轮连续safe no-op；继续重复相同层没有
  方法依据。五任务数值比不同模型GSQ公开68.55%低1.3438pp，但该跨模型表面差不能判断是否超过
  GSQ，也不是有效成功门槛；需要同模型、同协议对照才能得出结论。下一方向应固定已接受末层状态并
  向前一Transformer frontier扩展结构容量，不做group/seed/LR扫描。
- 完成摘要：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260825_095841_llama3_8b_iterative_assignment_stage3_5_chain_complete.json`；
  报告：`report/20260825_095841_llama3_8b_iterative_assignment_stage3_5_chain_report.md`。

## 2026-08-25 11:08：Llama-3.1-8B-Instruct同模型配对链（本地GPU2，启动）

- 目的：消除此前Meta-Llama-3-8B base与GSQ公开Llama-3.1-8B-Instruct之间的模型混杂，在同一模型和
  五任务指标上直接检验Vector-GSQ及structure-aware assignment方法能否超过GSQ 68.55%。
- 协议：先运行FP16零样本ARC-C/E、HellaSwag、PIQA、WinoGrande，并要求五任务macro落在GSQ公开
  73.71%±0.5pp内；通过后运行32层d6/K4096/W2、group160 Vector-GSQ，FineWeb为4096 train、128
  validation、512 GPTQ、seqlength4096；再在layers28--31训练assignment，每任务512/256/256，
  FineWeb train4096，独立C4 selection128/audit512，最后测WikiText2 test PPL（seqlength2048）与六任务。
- 模型与数据准备：四个safetensors shard精确大小/header及本地tokenizer加载通过；5376×4096缓存
  前4736行与既有FineWeb token bit-exact，后640行为source未见过的本地C4 validation token。
- 设备与执行边界：只使用本机物理GPU2且单卡可见；启动前GPU2空闲81154 MiB，不在10.30.0.14实验。
- 验证：cache builder红绿灯9项通过，matched chain/assignment launcher合同测试19项通过，合计
  `28 passed, 2 warnings`；shell语法、Python编译和`git diff --check`通过。
- 启动记录：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260825_110807_llama3_1_8b_matched_vector_assignment_gpu2_launch.json`。
- FP16锚点结果：ARC-C/E=`0.550341/0.796717`、HellaSwag=`0.791675`、PIQA=`0.809576`、
  WinoGrande=`0.734017`，五任务macro=`0.736465`（73.6465%）；与GSQ公开FP16 73.71%仅差
  -0.0635pp，预注册±0.5pp协议Gate通过，因此后续68.55%是有效同模型比较门槛。
- 首次链退出与恢复：FP16评测本身正常完成，但lm_eval把`results.json`解释为目录并在其下写入嵌套
  timestamp JSON，旧脚本随后读取不存在的literal路径而退出2。已增加“递归发现且只接受唯一
  `results_*.json`”及已完成锚点复用，28项相关测试通过；恢复不会重跑22分钟FP16评测，继续使用
  同一物理GPU2进入Vector量化。报告：`report/20260825_121350_llama3_1_8b_fp16_anchor_report.md`。

## 2026-08-25 11:08--2026-08-28 02:20：Llama-3.1-8B-Instruct同模型结构感知Vector-GSQ（本地GPU2，已完成/超过GSQ）

- 目的：在GSQ公开结果的同一Llama-3.1-8B-Instruct模型、同一五任务指标上，直接验证结构感知
  Vector-GSQ是否超过GSQ 68.55%，并用assignment训练前后的配对结果隔离方法增益。
- 原理：以全32层d6/K4096/W2、group160 Vector-GSQ为source；冻结码本、normalizer和group scale，
  只在layers28--31当前码字的8-way局部邻域训练assignment logits。候选由几何近邻和任务功能梯度
  构造，binary Concrete训练后用confidence hard projection及独立task/text audit选择稀疏离散步。
- 配置：FineWeb 4096 train/128 validation/512 GPTQ，sequence length4096；每任务512/256/256
  train/validation/audit；C4 guard为128 selection/512 audit；PPL WikiText2 test seqlength2048；
  六任务使用lm_eval。固定seed0，不扫描seed/group/LR。仅本机物理GPU2可见，不使用10.30.0.14。
- 选择结果：epoch1的1/8投影改变549,997 / 145,465,344个assignment（0.378095%）；validation
  macro从71.9531%升至74.1406%，独立audit从69.7656%升至71.5625%，balanced loss和文本CE均
  在validation/audit下降，Gate通过；码本、scale、normalizer及2.1207557091 bpp逻辑码率不变。
- 正式结果：source五任务macro=`0.6810459321`、macro6=`0.6799970386`、PPL=`10.4959764481`；
  最终五任务macro=`0.6907438125`、macro6=`0.6947737347`、PPL=`10.7346715927`。assignment使
  五任务提高0.9698pp、六任务提高1.4777pp，但PPL退化2.2742%。
- GSQ比较：本地FP16 73.6465%已通过公开73.71%±0.5pp协议Gate；最终69.0744%在同模型、同五任务
  口径下超过GSQ公开68.55%共**0.5244pp**，且逻辑码率2.1208低于公开2.13 bpp。该结论是固定seed
  单次的数值超过，不声称跨seed统计显著性，也不声称PPL/所有单任务全面Pareto支配。
- 执行：源量化约54.58小时，assignment校准约6.45小时，最终六任务评测约30.64分钟；链终端退出0，
  `chain.status`与assignment `pipeline.status`均为`completed`，最终checkpoint约4.76 GB。
- 完成JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260828_031157_llama3_1_8b_matched_structure_aware_vector_gsq_complete.json`；
  报告：`report/20260828_031157_llama3_1_8b_matched_structure_aware_vector_gsq_result_report.md`。
- 启动记录：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260825_045000_llama3_8b_iterative_assignment_refinement_stage2_launch.json`。

## 2026-08-28 09:21--12:29：Llama-3.1-8B-Instruct QTIP 2-bit同协议全量复现（本地GPU2，已完成）

- 目的：在同一Meta-Llama-3.1-8B-Instruct、同一tokenizer、WikiText2 test seqlength2048和相同六项
  `lm_eval`口径下复现开源QTIP 2-bit checkpoint，形成可直接比较的正式基线。
- 配置：`relaxml/Llama-3.1-8b-Instruct-QTIP-2Bit`，标称2.0 bpp；141个完整PPL序列；ARC-C/E、
  HellaSwag、LAMBADA、PIQA、WinoGrande全量0-shot，无`limit`，bootstrap1000；仅本机物理GPU2可见。
- 实现审计：官方checkpoint使用CUDA-kernel-packed trellis。普通Python unpack回退得到layer0 q_proj
  余弦0.00014及PPL 2,209,793，已标记`completed=false`；编译官方QTIP decoder后同层余弦0.9314、
  相对MSE 0.1515，通过门禁。PyTorch `inference_mode`/`torch.compile` dtype-view冲突以数值等价的
  `no_grad`首次manifest修复；相关测试22项通过。
- 正式结果：PPL=`8.7971146626`；ARC-C/E=`0.507679/0.753367`、Hella=`0.750249`、
  LAMBADA=`0.697070`、PIQA=`0.782372`、Wino=`0.700079`；macro6=`0.6984693128`，公共五任务
  macro=`0.6987492418`；总耗时2996.35秒，峰值显存18,780,890,112 bytes，终端退出0。
- 对比结论：SAGE-VQ最终2.1208 bpp的PPL/macro6/公共五任务分别为10.7347/69.4774%/69.0744%；
  QTIP以更低码率将PPL降低1.9376，并把macro6/公共五任务提高0.3696/0.8005pp。因此当前方法超过
  GSQ同模型headline但尚未超过QTIP，不能声称总体2-bit SOTA。
- 正式JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_qtip_eval/20260828_1145_llama3_1_8b_qtip_2bit_full_gpu2_native/summary.json`；
  报告：`report/20260828_124119_llama3_1_8b_qtip_2bit_matched_full_report.md`。

## 2026-08-28 13:00：Llama-3.1-8B-Instruct teacher/text-only assignment公平性实验（本地GPU2，启动）

- 目的：消除task-adapted SAGE-VQ相对通用PTQ基线的额外标签监督混杂，检验固定码本与码率后，
  anchor-local assignment仅依赖通用dense-teacher文本信号能否形成有效硬量化改进。
- 原理：复用已完成的2.1207557091-bpp Vector-GSQ硬锚点；冻结codebook、normalizer、group scale与
  非目标层，只在layers28--31的8-way几何邻域用FineWeb teacher-text梯度选择一个alternative，再以
  binary Concrete训练switch。confidence projection和独立audit只看互斥C4 teacher-text CE，所有
  ARC/Hella/PIQA/Wino标签均不参与梯度、选择或audit；六任务只在checkpoint固定后事后全量评测。
- 配置：FineWeb train rows0--4095，C4 selection rows4736--4863、audit rows4864--5375，文本长度
  4096；两epoch，保持与task-adapted路径相同的每epoch 640个switch优化更新；最终WikiText2 test
  seqlength2048及六项lm_eval，无`limit`。固定seed0，不扫描group/LR/候选数。
- 设备与边界：只暴露本机物理GPU2；启动前显存81151 MiB、主机可用内存732.7 GiB、磁盘可用
  661 GiB，不使用10.30.0.14，也不占用第二张GPU。
- 验证：新增text-only selector红灯测试后实现转绿；Python编译、两个launcher `bash -n`、
  `git diff --check`和相关43项pytest全部通过。
- 选择结果：epoch1的1/8投影改变671,679 / 145,465,344个assignment（0.4617%）；C4 validation
  teacher CE从2.66053降至2.62024（-1.5143%），独立audit从2.71407降至2.66819（-1.6906%），
  text-only Gate通过；codebook、scale、normalizer、bpp和非训练状态不变，硬重构误差0。
- 正式结果：PPL=`12.2603511810`，相对source `10.4959764481`退化16.8100%；macro6=
  `0.6592170201`，下降2.0780pp；五任务=`0.6720617825`，下降0.8984pp。六项任务均未改善，
  LAMBADA从67.4753%降至59.4993%。
- 结论：该完整消融否决了“局部top-k teacher-text CE可直接支持task-agnostic assignment”的假设。
  validation/audit代理改善却跨语料PPL与零样本任务同时恶化，说明当前SAGE-VQ正结果必须定位为
  task-adapted quantization；GSQ/QTIP只能作质量参考，不能称同监督设定下被超过。
- 执行：校准12044.98秒，PPL 55.47秒，lm_eval 1557.33秒；终端退出0，`pipeline.status=completed`。
- 完成JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260828_162226_llama3_1_8b_text_teacher_only_assignment_complete.json`；
  报告：`report/20260828_162226_llama3_1_8b_text_teacher_only_assignment_result_report.md`；启动记录：
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260828_130046_llama3_1_8b_text_teacher_only_assignment_gpu2_launch.json`。

## 2026-08-28 17:23--19:20：Llama-3.1-8B-Instruct同预算group-scale公平对照（本地GPU2，已完成）

- 目的：补齐V7审稿指出的同监督、同部署预算任务适配基线，检验assignment-only收益是否超过只训练
  checkpoint已有FP16 group scale的连续适配。
- 原理与协议：同一2.1207557091-bpp Vector-GSQ source、layers28--31、每任务512/256/256、文本
  4096 train/128 validation/512 audit、sequence length4096、2 epochs；选择使用与assignment相同的
  task/text loss-dominance阈值，并新增独立audit失败精确回滚。只改group scale，不改assignment/码本。
- 内部结果：epoch2入选，task validation macro 71.9531%->76.3281%，独立audit 69.7656%->76.0156%；
  C4 validation CE 2.66053->2.44109，audit CE 2.71407->2.48685，Gate通过。
- 正式结果：PPL=`10.9447565079`；Macro-6=`0.7172225110`，公共五任务=`0.7254836249`。相对source
  分别提高3.7225pp/4.4438pp，PPL退化约4.28%；相对assignment-only提高2.2449pp/3.4740pp，
  但PPL再退化约1.96%。逻辑bpp不变，fresh reconstruction精确。
- 结论：同预算下scale-only任务收益显著高于assignment-only，否定assignment全面更强的叙述；后者
  PPL更优，二者形成真实accuracy/PPL折中。下一方法方向是单次独立audit约束下的连续-离散联合适配，
  不是group/seed/LR扫描。
- 执行：校准5353.99秒、PPL 55.51秒、lm_eval 1597.20秒；单卡GPU2，终端exit0。
- 完成JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260828_192042_llama3_1_8b_matched_task_group_scale_complete.json`；
  报告：`report/20260828_192042_llama3_1_8b_matched_task_group_scale_result_report.md`。

## 2026-08-28 19:43：Llama-3.1-8B-Instruct连续尺度—局部Assignment联合实验（本地GPU2，启动）

- 目的：回答V8审稿的首要问题，检验同一优化阶段联合训练已有FP16 group scale与当前码字附近领域
  assignment，能否结合scale-only任务增益和assignment-only较低PPL扰动；不做seed/group/LR扫描。
- 方法：同一参数化中分别以0.002/0.005学习率训练log-scale delta与binary switch；每个assignment
  alternative仍由原锚点8-way几何邻域和任务/text功能梯度选出。Validation同时检查scale-only零-switch
  端点和1/8--full嵌套投影，在全部loss-dominance约束内按balanced task loss选择、稀疏度只作平局规则。
- 单次新audit：训练/validation仍为每任务512/256和文本4096/128；final audit改为任务随机排列
  offset1024处64条，以及新缓存C4 rows5376--5439共64条。新5440-row缓存前5376行与旧缓存bit-exact，
  新64行互异且此前任何实验未读取。最终组合端点只在该audit上验收一次，失败整体回滚。
- 配置：Llama-3.1-8B-Instruct、source 2.1207557091 bpp、layers28--31、2 epochs、文本长度4096；
  最终WikiText2 test PPL seqlength2048与六项全量lm_eval。仅本机物理GPU2可见。
- 验证：联合scale/switch梯度和FP16落盘精确测试、独立task audit offset、loss-first joint projection、
  新缓存与单卡launcher合同均已先红后绿；相关71项pytest、Python编译、bash语法与diff检查通过。
- 启动JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260828_194321_llama3_1_8b_joint_scale_assignment_gpu2_launch.json`。
- 首次GPU2启动在训练前显存握手时仅剩22,487 MiB，低于70 GiB门禁，安全退出3且未产生部分checkpoint；
  随后依据既有matched assignment峰值34.15 GB，把入口改为默认GPU2但允许显式覆盖，并选择仍有
  55,031 MiB可用的GPU7，以48 GiB门禁重启。进程仍只暴露一张物理GPU，不并行启动第二项实验。

## 2026-08-28 19:45--2026-08-29 03:45：Llama-3.1-8B-Instruct连续尺度—局部Assignment同步联合（本地GPU7，已完成）

- 目的：在同一软参数化中联合训练FP16 group-scale log delta与当前码字附近领域assignment switch，
  检验是否能同时保留scale-only的任务增益和assignment-only的较小PPL漂移；不做seed/group/LR扫描。
- 全量配置：同一Llama-3.1-8B-Instruct Vector-GSQ source、layers28--31、每任务512 train/256 validation/64全新
  final audit，task audit offset1024；文本4096/128/64，新C4 audit rows5376--5439，length4096，2 epochs。完整运行
  WikiText2 test seqlength2048与六项0-shot `lm_eval`，无`limit`。
- 选择：epoch1的1/2硬投影，切换1,252,415 / 145,465,344个assignment（0.860971%）；5,521,408个scale delta
  全部非零，mean-abs 0.033627。Validation macro 71.9531%->72.8125%；全新audit macro保持76.8750%，balanced loss下降
  8.5607%、C4 CE下降1.9967%，Gate通过。
- 正式结果：PPL=`11.4097919464`，Macro-6=`0.6974338550`，公共五任务=`0.6895113498`。相对source提高
  1.7437/0.8465pp，但PPL退化8.7063%。相对assignment-only，Macro-6仅高0.2660pp、五任务低0.1232pp，PPL再差
  6.2892%。相对group-scale-only，Macro-6/五任务低1.9789/3.5972pp，PPL还差4.2489%，被其严格支配。
- 方法诊断：joint epoch1中只保留学到的scale、零switch时validation macro仅70.9375%，明显低于独立scale的
  76.3281%；选中硬投影也低于独立assignment的74.1406%。这表明scale在软assignment mixture上学到了补偿，
  hard projection后两个坐标同时失配；失败不能通过seed/LR/投影比例扫描合理解决。
- 部署合同：assignment与scale改变；codebook、normalizer、固定metadata和非目标状态精确；fresh reconstruction误差0；
  逻辑bpp仍为2.1207557091。校准27226.14秒、PPL 55.69秒、lm_eval 1501.42秒，终端status0。
- 结论：完整否决“同一软松弛内同步联合即可互补”。下一方法方向是先固化真实可部署scale端点，再以它为锚点学习
  稀疏assignment repair，最终组合仅使用一次全新audit；不进行无意义调参。
- 紧凑JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260829_035900_llama3_1_8b_joint_scale_assignment_complete.json`；
  报告：`report/20260829_035900_llama3_1_8b_joint_scale_assignment_result_report.md`。
## 2026-08-29 18:45：Llama-3.1-8B scale-hard assignment repair（正式完整负结果）

- **实验目的：** 检验 V9 的部署态修复原则。先固化已审计的独立 FP16 group-scale checkpoint，冻结 scale，重新计算当前码字 8-way 功能邻居，只训练 assignment；成功标准直接相对 scale-only，不做 seed/LR/group/projection 扫描。
- **实验原理：** 每个 epoch 将正 switch logit 按置信度构成 1/8、1/4、1/2、full 四个真实 int32 hard projection，并让每个 deployed state 独立通过 task/text loss-dominance Gate。任务使用每项 512/256/31 train/validation/audit，文本使用 4096/128/64 条 4096-token 序列；PPL seqlength=2048，准确率为六任务完整 lm_eval。
- **关键修复：** 首轮正式 run 暴露 selector 只在 full endpoint 先通过 Gate 时才评估稀疏投影，违背非单调 trust-region 假设。修复为任何非零路径都枚举和独立 Gate 四个投影；cache builder 同时新增 bit-exact prefix extension 合同。首轮 4.93h 诊断失败与最终 run 均保留。
- **实验结果：** 最终 run 用时 6.65h，峰值 31.80GiB。一阶 proposal 在 145,465,344 个向量上的负方向率为 98.1965%，但两 epoch 共八个 hard projection 全部失败。其 validation Macro 为 67.1094%--71.6406%，均低于 scale baseline 76.3281%；最佳 changed loss 0.736233，仍比 baseline 0.679691 高 8.32%。5% rate 内最佳点低 5.4688pp、loss 高 16.24%。
- **最终端点：** epoch0/no-op，assignment、scale、codebook、normalizer、逻辑码率和非目标状态均精确不变，reconstruction error=0；WikiText2 PPL 10.9447565，Macro-6 71.7222511%，公共五任务 72.5483625%，2.1207557 bpp，均与 scale-only 完全一致。`audit_gate_passed=false` 表示没有 changed candidate 进入 audit，不表示非零候选 audit 失败。
- **结论：** hard handoff 避免了同步 soft joint 对 scale 的破坏，但当前一阶 8-way assignment repair 无法叠加到 scale endpoint。Assignment 只能保留为独立 Pareto 分支。下一方法应检验 scale-conditioned curvature 或跨 batch/任务梯度一致性，不继续做超参数或 seed 消融。
- **产物：** `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260829_184500_llama3_1_8b_scale_hard_assignment_repair_complete.json`；完整报告 `report/20260829_184500_llama3_1_8b_scale_hard_assignment_repair_result_report.md`。
## 2026-08-30 05:45：Llama-3.1-8B scale-conditioned consensus assignment（正式完整负结果）

- **目的：** 直接修复V10中“98.20%逐向量负一阶方向但0/8 hard set改善”的proposal失准，不做seed、LR、group或projection ratio扫描。
- **方法：** 将完整512条/任务与4096条文本训练数据划为4个task-stratified互斥gradient views；8-way附近邻居必须在四个view中都预测下降，并最小化最差view一阶分数，否则向量精确冻结。Scale硬checkpoint、码本与normalizer固定。
- **配置：** Meta-Llama-3.1-8B-Instruct layers28--31，任务512/256/31 train/validation/audit，文本4096/128/64×4096 token；新文本audit rows5504--5567；单张本地GPU5。任务audit已被V10读取baseline但从未暴露给changed candidate，本轮不称其为fresh。
- **测试门禁：** 先完整校准并评估所有hard projections；只有非零候选通过validation、candidate-unexposed audit、5% rate与checkpoint合同才运行WikiText2 seqlength2048和六任务全量lm_eval。38项聚焦测试、Python和shell静态检查通过。
- **Proposal统计：** 145,465,344个六维向量中，聚合梯度的负邻居率为98.1973%，四视图严格共识率降至48.7101%；70,856,267个向量保留alternative，74,609,077个向量因无共同下降邻居精确冻结。28个Linear的共识率为37.4745%--74.9129%。
- **硬投影结果：** 两个epoch的1/8、1/4、1/2、full共八个真实int32投影全部低于scale source。全范围最佳changed endpoint为epoch2/full，切换率8.1007%、Macro 73.9063%、balanced loss 0.727951；相对source 76.3281%/0.679691仍低2.4219pp且loss高7.10%。5%切换率内最佳点低5.00pp、loss高14.06%。
- **相对V10：** 最佳changed endpoint提高2.2656pp，relative loss改善1.12%，说明共识过滤有信息；但仍0/8通过，证明跨视图冲突只解释约一半虚假许可，符号一致并非有限码字跳转的离散可信域。
- **最终端点：** `best_epoch=0`、零switch、`audit_gate_passed=false`。Assignment、scale、codebook、normalizer、逻辑bpp、固定metadata和非目标状态精确不变，fresh reconstruction误差0。由于Gate在validation阶段拒绝全部changed candidate，没有重复运行必然相同的正式benchmark；最终沿用同一scale部署状态的PPL 10.9447565、Macro-6 71.7223%、公共五任务72.5484%、2.1207557 bpp。
- **资源与状态：** 本地物理GPU5单卡完成，耗时24,078.20秒（6.688小时），峰值31.80GiB，程序正常退出，`pipeline.status=calibration_noop`。下一步不再增加view、epoch或扫描超参数；只有候选级scale-conditioned曲率分数先证明能预测hard loss排序，才重启assignment-after-scale路线。
- **产物：** 紧凑JSON `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260830_054500_llama3_1_8b_scale_consensus_assignment_complete.json`；完整报告 `report/20260830_054500_llama3_1_8b_scale_consensus_assignment_result_report.md`；原始summary SHA256 `15762e01f18d459b65681dc8c618a448eff04543ee7ec681ca69f1830bacc201`。

## 2026-08-30 07:30：Llama-3.1-8B scale-conditioned curvature predictor probe（正式完整负结果）

- **实验目的：** 按V11独立审稿要求，先验证候选级局部二阶代价能否预测真实hard validation loss，再决定是否允许完整assignment训练；不是预算或超参数消融。
- **方法：** 四个互斥任务分层view给出mean/worst一阶分数；同一次反向捕获Linear输入二阶矩，对真实scale-conditioned码字跳转计算对角局部activation-Hessian代价，并用worst-view一阶收益/$\sqrt q$排序。该代价只声称局部Linear输出曲率，最终用真实任务loss检验其外推能力。
- **Matched controls：** aggregate first-order、strict consensus、curvature-normalized三种ranking，均在每个Linear应用128/512/2048/8192个nested switch，共12个真实硬集合。门禁预注册为：曲率相对每个control至少3/4预算loss更低且四预算平均loss更低。
- **完整配置：** Meta-Llama-3.1-8B-Instruct scale source，layers28--31；任务512/256/31 train/validation/audit，文本4096/128/64条、长度4096；不训练参数，不访问formal test。只有一个validation胜出端点可进入一次candidate-unexposed audit；只有audit通过才运行WikiText2-2048与六任务全量lm_eval。
- **资源与验证：** 仅本地物理GPU5，70GiB空闲显存和350GiB宿主内存门禁；43项聚焦pytest、Python compile、bash syntax、ruff、JSON/状态合同和Git whitespace通过。程序与launcher分别为`probe_scale_conditioned_assignment_curvature.py`和`run_llama3_1_8b_scale_curvature_probe_local.sh`。
- **候选统计：** 145,465,344个六维向量中，aggregate negative候选为142,842,971（98.1973%），
  strict-consensus合格候选为70,856,047（48.7099%）。Curvature与consensus共享资格集合，只改变排序。
- **Matched hard结果：** 曲率相对strict consensus在4/4预算上balanced loss更低，四预算均值
  1.202667 vs 1.255607；相对aggregate仅2/4胜，虽均值1.202667低于1.216330，仍未达到预注册3/4门槛。
  Predictor Gate失败。
- **最佳候选：** curvature 128/Linear，共3584个switch（0.002464%）；Macro 70.8594%、balanced loss
  0.804163，相对source 76.3281%/0.679691低5.4688pp且loss高18.313%。所有12个hard set均低于source。
- **状态：** 本地物理GPU5单卡完成，耗时5325.16秒（1.479小时），峰值25.285GiB，程序正常退出。
  Validation Gate失败后未访问候选audit、未写checkpoint、未运行正式PPL/lm_eval、未授权完整assignment训练。
  Assignment-after-scale路线停止；无seed、LR、group、视图数、曲率权重或预算扫描。
- **机制结论：** scale-conditioned对角局部激活曲率能修复strict-consensus候选排序，但不足以预测深网
  端到端hard loss；剩余误差来自非线性传播、跨层敏感度和集合交叉项，不能靠逐候选独立分数解决。
- **产物：** 紧凑JSON `code/GSQ_nowag_d1_20260716_015355/experiments/results/20260830_073000_llama3_1_8b_scale_curvature_probe_complete.json`；
  报告 `report/20260830_073000_llama3_1_8b_scale_curvature_probe_result_report.md`；原始summary SHA256
  `436765bcf8590403c2ac64ca78e42884e5a1d1b86a58c53b5cdabe372a6276bc`。
