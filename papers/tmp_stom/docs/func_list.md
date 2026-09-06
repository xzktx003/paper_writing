# 功能清单

## 2026-08-23 — Vector-GSQ 原子断点续跑与流式 Dense Teacher

- `run_prefix_vector_gsq.py` 新增 `--resume`：严格校验 quantization JSON 与 logical checkpoint 的
  连续层前缀、模型族、方法参数和七 Linear 覆盖；从部署态 checkpoint 精确恢复已完成层，并把
  train/validation/GPTQ hidden caches 逐层重放到第一个未完成层，避免长实验从头重算。
- 新增 `--stream-dense-targets`：staged Vector-GSQ 不再为 4096 条完整上下文长期缓存整份阶段
  teacher，而是在每个 microbatch 上用原 dense current block 现算同一目标；降低宿主内存峰值，
  不改变 assignment、teacher 语义、validation gate 或 logical checkpoint 格式。
- 本地 launcher 新增 GPU 空闲显存和宿主可用内存双门禁；resume 日志使用 `tee -a` 保留中断前
  证据。专用入口从 2026-08-21 的官方协议 checkpoint 第 18 层继续，并仍只使用一张本地 GPU。
- 红绿灯测试 `tests/test_prefix_vector_gsq_resume.py` 覆盖连续层/参数不匹配拒绝、logical bpp
  精确重算、部署态权重恢复、cached/streamed teacher 两条路径及恢复 launcher 合同。
- 真实恢复已在本地物理 GPU0 从 layer18 完成至 layer31；最终相关 staged/resume/device/Vector-GPTQ
  联合回归为 `49 passed, 2 warnings`，tmux 正常退出码0。

## 2026-08-21 — Vector-GSQ 逐层 checkpoint 混合搜索

- 新增 `experiments.nowag_d6.compose_logical_checkpoints`：从两个同结构 logical
  checkpoint 中按显式层集合替换完整层状态；组合前校验层覆盖、Linear 覆盖及
  assignment/codebook shape，禁止覆盖任一输入文件，并记录 base/donor 标签和层级来源。
- 新增 Remote-14 GPU1 搜索入口
  `experiments/llama_qtip/run_llama3_8b_layer_hybrid_search_remote14.sh`，预注册 early
  rollback（0--3）、late rollback（28--31）和 edge rollback（0--3、28--31）三个候选；
  每个候选均独立 fresh reconstruct，并串行执行 WikiText2 test PPL（seqlength=2048）与
  ARC-C/E、HellaSwag、LAMBADA、PIQA、WinoGrande 六任务 lm-eval。
- 红绿灯测试 `tests/test_compose_logical_checkpoints.py` 覆盖层范围解析、选择性替换、
  provenance、结构不兼容拒绝和 Remote-14 launcher 的三候选/完整评测合同。

## 2026-08-20 — Dense LLaMA Vector-GSQ 与 QTIP 同协议对比

- Vector-GSQ prefix runner 现在显式接受 dense `LlamaForCausalLM` 与 Qwen3，拒绝
  Qwen3-MoE、Llama 4 等七 Linear 假设不成立的结构，并把 `model_family` 写入结果和
  logical checkpoint metadata。
- 新增 LLaMA 专用 FineWeb-Edu token cache builder；量化入口会核对 cache identity 与
  当前模型，防止把 Qwen tokenizer 产生的 token IDs 用于 LLaMA 校准。
- 新增 QTIP checkpoint 评测器，使用 QTIP 官方加载入口，统一执行 WikiText2 test
  PPL（sequence length 2048）和 lm-eval 六项 0-shot：ARC-C、ARC-E、HellaSwag、
  LAMBADA、PIQA、WinoGrande。
- 新增严格比较器：只有基座模型、PPL split/seqlen、任务集合一致且 effective-bpp 差值
  不超过阈值时才给出质量胜负；同时输出 JSON、分任务差值和时间戳 Markdown 报告。
- 新增 Remote-14 一键脚本
  `experiments/llama_qtip/run_llama3_1_8b_comparison_remote14.sh`，覆盖 LLaMA-3.1-8B
  token cache、Vector-GSQ 完整 checkpoint、独立 PPL/lm-eval、QTIP 评测和最终汇总；
  不内置 Token 或凭证，也不会在本地 GPU 启动正式实验。
- 新增现有 Remote-14 模型资产可直接执行的
  `experiments/llama_qtip/run_llama3_8b_vector_gsq_remote14.sh`：固定 LLaMA-3-8B
  32 层、GPTQ top-128/concurrency=7、GSQ K8/400 steps，并在量化完成后自动串行执行
  WikiText2-2048 PPL 和六项 lm-eval，避免在 QTIP 资产未部署时阻塞本方法实验。

## 2026-08-12 — 单 GPU Vector-GPTQ 多 Linear 并行

- `run_prefix_vector_gsq.py` 新增 `--gptq-concurrency 1..7`：同一 Transformer
  block 的 NoWag 初始化全部完成后，使用有界线程池和独立 CUDA stream 并发执行七个
  Linear 中彼此独立的 Vector-GPTQ refinement；完成顺序不影响结果字典、checkpoint
  和 diagnostics 的固定 Linear 顺序。
- 远端 formal 与 memory-gate launcher 默认启用两路并发，可通过环境变量
  `GPTQ_CONCURRENCY=1..7` 覆盖；`1` 保留原始串行行为，适合显存不足或对照运行。
- 每层结果新增 `initialization_policy.nowag_concurrency` 和
  `initialization_policy.gptq_concurrency/gptq_wall_seconds`，便于审计实际初始化
  策略和并发区间墙钟时间。
- 新增本地手动 Gate：
  `experiments/performance/run_vector_gptq_local_concurrency_gate.sh`。脚本固定 seed，
  默认依次执行 1/2/4/7 路、保留每次 JSON/checkpoint/log，并自动在 `report/` 生成
  包含实验目的、原理、步骤、配置、结果和结论的时间戳报告；脚本只生成，未自动启动。
- NoWag 暂时保持串行：上游 K-means++ 依赖进程级 Torch/CUDA RNG，直接线程并发会让
  per-Linear seed 互相覆盖。当前并行化优先覆盖 8B/14B 初始化阶段的主要耗时
  Vector-GPTQ，不宣称尚未执行的远端墙钟加速结果。
- 红绿灯测试：`tests/test_vector_gptq_concurrency.py` 覆盖并发上限、真正任务重叠、
  串行兼容、非法并发度、远端 launcher 默认开启两路并发，以及本地 Gate 的
  串并行对照与报告契约。
- Vector-GPTQ 默认使用 `--gptq-candidates 128`：每个 NoWag 码字建立 128-way 局部邻域，
  每个权重向量只在其初始 assignment 的邻域内进行精确 Hessian-aware 评分；anchor 强制保留，
  完整 Hessian 目标变差仍回退 NoWag。将该参数设为不小于码本大小可恢复全码本搜索。
- Remote-14 Qwen3 launcher 现支持通过 `MODEL_LABEL`、`EXPECTED_HIDDEN_SIZE` 和
  `EXPECTED_LAYERS` 做模型形状门禁复用；新增
  `experiments/performance/run_qwen3_8b_top128_vector_gsq_remote14.sh`，固定 8B matched
  top-128 配置并在量化完成后独立测 WikiText2 test PPL。对应契约测试同时保护 4B 默认值与
  8B wrapper 的模型、候选数、并发、数据和 GSQ 参数。
- 新增本地完整实验入口
  `experiments/performance/run_vector_gsq_local_full_eval.sh`：自动从模型 config 获取完整
  层数，执行 NoWag-d6 → 默认七路 Vector-GPTQ → block 联合 Vector-GSQ，保存 logical
  checkpoint 后以独立进程 fresh reconstruction 运行 WikiText2 test PPL（seqlen=2048）、
  EvalScope 1.4.1 Native 和 lm_eval 六任务，并生成时间戳 Markdown 报告。
- 新增 `evaluate_logical_checkpoint_evalscope.py`：将 logical Vector-GSQ checkpoint
  直接重建到 EvalScope `ModelScopeAPI` 持有的本地模型对象中，避免另存一份约 16GB 的
  dense HF export；EvalScope Native 覆盖 ARC-E/ARC-C、HellaSwag、PIQA、WinoGrande，
  并为 Qwen3 选择题评测显式关闭 thinking。
  当前 EvalScope 1.4.1 没有 Native LAMBADA adapter，因此 LAMBADA 与统一六任务 macro
  由同一脚本中的 lm_eval 阶段提供，两个评测体系分别报告。

## Source-to-Task Adaptive Scalar Quantization

- 官方上游：`IST-DASLab/GSQ`，锁定基线提交 `03fc164`。
- 目标功能：layer-wise GGD/Lloyd-Max source codebook、block scale 与最近邻
  assignment 交替优化、受 source prior 约束的 task adaptation、可部署 hard
  坐标细化、独立 validation gate、逐层顺序传播与回退。
- 已实现的代码边界：单个 Linear 的 source-to-task 多候选训练/validation 选择
  入口，逐 Linear forward hook 捕获 propagated input 与 teacher output 的
  测试保护接口，以及按 layer/MLP 组织多 Linear 适配、保存 selected hard
  state、输出 JSON diagnostics 的 runner 边界；`quantization.method: stom`
  已接入 dense MLP layer 训练流程，并输出 `stom_layer_metrics.jsonl` 供实验
  manifest 审计。
- 烟测配置：新增 Qwen3-0.6B W2 source-only/full 两层 smoke YAML，正式运行需配合
  `--max-layers 2`，结果目录位于 `experiments/results/smoke-*`。
- 实验功能：论文 `markdown/05_experiments.md` 中主实验、消融、机制分析、
  时间/显存/存储审计的矩阵化调度、结果 JSON 校验和报告汇总。
- 当前状态：实施中；完成情况以 `code/GSQ/docs/stom_implementation_plan.md`
  的任务勾选和 `experiments/results/` 原始证据为准。
## 2026-07-12

- STOM experiment config generator: `python -m experiments.stom.configs`
  materializes strict YAML configs for currently executable formal matrix rows
  (`rtn`, `gptq`, `gsq`, `stom_source_only`, `stom_full`) and records
  unsupported rows in `configs/stom/generated/unsupported.json`.
- STOM scheduler safety guard: formal `--execute` runs now fail fast when a
  selected row lacks a generated config, preventing accidental GPU launches
  with missing or fabricated experiment settings.
- STOM scheduler parallel launch: `python -m experiments.stom.run --execute
  --jobs 8 ...` launches selected rows in fixed-size batches while preserving
  per-run `runner_started.json` and `runner_failed.json` markers.
- STOM formal manifest validation: formal run directories now have an explicit
  `run_metadata.json` + `formal_metrics.json` contract, validated by
  `experiments.stom.validate_manifest --require-formal` against the matrix row
  before metrics can be considered paper-table-ready.
- STOM run metadata writer: `main.py` now writes `run_metadata.json` for each
  run using matrix identity from the scheduler environment plus model/config
  and package/GPU metadata. Full runs finish with `progress.status=complete`;
  `--max-layers` smoke runs finish with `progress.status=partial`.
- STOM PPL formal metrics: successful full `w2-wikitext2-ppl` and `w2-c4-ppl`
  runs now write `formal_metrics.json` with final quantized PPL and checkpoint
  byte-size evidence for formal manifest validation.
- STOM coverage collector now validates completed formal rows via
  `run_metadata.json` + `formal_metrics.json` and reports `formal_validated`;
  paper table readiness no longer depends on `progress.status=complete` alone.
- STOM zero-shot metric converter: `python -m experiments.stom.zero_shot`
  converts full `lm_eval` JSON for ARC-Challenge, ARC-Easy, HellaSwag,
  LAMBADA, PIQA, and WinoGrande into validator-compatible
  `formal_metrics.json`.
- STOM reconstructed HF export: `python -m experiments.stom.export_hf` overlays
  reconstructed `stom-v1` shard weights onto a base HF safetensors directory and
  copies tokenizer/config metadata, enabling downstream evaluation tools to load
  a dense/fake-quantized exported model.
- STOM zero-shot orchestration: `python -m experiments.stom.run_zero_shot
  --run-id RUN_ID` resolves a completed `zero-shot-six-task` matrix row,
  exports STOM shards to `hf_export/`, assembles `rtn`/`gptq`/`gsq`
  compressed-tensors rows via `save_model.py`, materializes explicit `fp16`
  baseline metadata without invoking quantization, runs `lm_eval` on the six
  required zero-shot tasks, converts results to `formal_metrics.json`, validates
  the formal manifest, and writes started/failed/complete audit markers.
- 远端实验队列支持显存与 GPU 利用率双阈值空闲判定，避免层切换期间误派发任务。
- 远端实验 manifest 支持 `requires_success` 成功依赖，可用于 gate → 全层正式实验；前置失败时后续任务自动跳过。
- Llama2-7B、Llama3-8B、Llama3-70B 已配置 gate 后全层正式实验队列和 1800 秒本地结果回拉。

## 2026-07-24 — 大模型训练吞吐与 OOM 自适应

- GSQ 训练支持从配置上限开始尝试 device microbatch，并在 CUDA OOM 时按
  `16 → 8 → 4 → 2` 自动降档；失败的未提交逻辑 batch 会清理梯度和 CUDA cache
  后原地重试，优化器与 scheduler 只在成功 step 后推进。
- 激活捕获/回放支持独立 microbatch 和同样的 OOM 持久降档，后续切片复用已验证
  可运行的较小档位，避免每个切片重复触发 OOM。
- 激活缓存支持按容量阈值选择 RAM 或 mmap，并可通过
  `GSQ_ACT_CACHE_MMAP_THRESHOLD_GB`、`GSQ_ACT_CACHE_DIR` 做远端机器级覆盖。
- Qwen3-8B/14B 正式配置保持 4096 样本、4096 序列长度、完整层数和 20 epochs，
  将训练 microbatch 上限设为 16；8B 使用 RAM 激活缓存，14B 在双任务并行期间使用
  mmap，避免两路全内存缓存导致主机内存耗尽。
- 性能门槛入口：
  `bash experiments/performance/run_training_speed_gate.sh`；结果契约位于
  `code/GSQ_nowag_d1_20260716_015355/experiments/results/training_speed_gate_latest.json`。

## 2026-07-25 — GPU 饱和与密集 MLP 直训路径

- 正式 Qwen3-8B/14B 配置的训练 microbatch 上限分别提高到 64/32，激活回放
  microbatch 分别为 64/32；训练与回放仍分别保留 OOM 自动减半回退。
- 密集 Qwen 在 Attention 训练完成后预计算固定 Attention 输出，MLP 的 20 epochs
  直接拟合 MLP 输出，不再在每个 FP/量化 step 中重复执行两次自注意力。
- 支持识别同一层已完成的 `non_mlp`/Attention artifacts，在 MLP 文件缺失时直接从
  MLP 阶段恢复，避免中断后重跑完整 Attention 训练。
- 最佳 hard-state snapshot 可转存 CPU，减少训练期间数 GB 常驻显存；训练 loss 支持
  延迟到逻辑 batch 结束时再 `.item()`，避免每个 device microbatch 强制 CUDA 同步。
- 新门槛入口：`bash experiments/performance/run_training_saturation_gate.sh`；中期结果
  最终为 8B MLP `1.566×`、14B MLP `1.375×`；远端 `12 passed` 且性能验证器 PASS。

## 2026-07-28 — FSR-VQ 精确 Linear hard-transition Gate

- 新增 `src/fsr_vq/residual.py`：对固定输入 Linear 的 hard vector codeword transition
  计算精确 summed-SSE delta，并在接受时原子更新 assignment、重建权重切片和 residual；
  正 delta 或 stale proposal 不提交。
- 新增 `src/fsr_vq/formats.py`：按真实 tensor shape/dtype 统计 deployable payload bytes，
  不把 train-time candidates、scores 或 optimizer state 计入部署码率。
- 新增真实模型 Gate：`experiments/fsr_vq/run_qwen_linear_candidate_gate.py` 捕获 Qwen
  Linear 的真实 calibration inputs，比较 geometry-only、geometric shortlist + exact
  function rerank 和 full-codebook function oracle，并对不同输出行 transitions 做实际权重
  重建以核验 predicted delta 的精确可加性。
- 新增红绿灯测试 `tests/test_fsr_vq_residual.py`，覆盖 exact delta、commit residual、reject
  rollback 和 rate-neutral fixed-format payload；与相关 Vector 设备测试合计 `6 passed`。
- 当前功能范围仅为 Linear Gate，不声称 nonlinear block、PPL 或 full-model 改善。
- 新增 `src/fsr_vq/candidate_graph.py`：把 exact Linear transition quadratic 转换为
  residual-shifted continuous target，并支持 full Mahalanobis 与 diagonal-metric codeword
  distance；后者以 `O(Kd)` 生成 function-directed candidates。
- Qwen gate 现同时评测 residual-target shortlist，并对全部已接受 transitions 做真实权重
  application 与 exact SSE 审计。
- 新增多 Linear/多层矩阵聚合器
  `experiments/fsr_vq/summarize_linear_candidate_matrix.py`：校验预期层、模块和重复数，按 cell
  汇总 function-best recall、oracle gain coverage、exact SSE、时间和显存，并使用预注册
  median/lower-quartile 阈值产生 Gate verdict；只读取 `layer*.json`，支持中断后补跑且不会
  把旧 summary 递归当作原始 run。
- 单 Linear 结果新增 `activation_source` provenance，区分 `fp_prefix`、
  `source_quantized_prefix` 与 `fsr_quantized_prefix`，防止把浮点前缀机制结果误报为量化轨迹证据。
- 新增 FP32 独立 audit 的有界 contraction/GEMM tolerance，以及对应红绿灯测试；该容差只
  用于比较两种数值累加路径，不改变 exact hard-transition acceptance。
- `HardLinearVectorState` 新增 residual-bound state version；proposal 除 current code ID 外
  还绑定评分时的 version，任意成功 commit 后旧 proposals 全部失效，防止同输出行其它
  coordinate 改变 residual 后继续使用过期 predicted delta。
- 新增 `src/fsr_vq/block.py` 的 `HardBlockTransaction`：对多个 Linear 的 assignments、
  codebook、reconstructed weight、residual 和 version 做原位事务 snapshot；默认回滚、异常
  强制回滚，只有正常退出且显式 commit 才保留，为完整 nonlinear block proposal--verify
  提供原子状态边界。
- 新增 `experiments/fsr_vq/run_qwen_block_candidate_gate.py`：捕获完整 Qwen decoder block
  的 FP-prefix input、attention kwargs 和 FP teacher output，将七个 Linear 替换为 source
  Vector checkpoint，生成 residual-target hard proposals，并对 top-N proposals 运行真实
  nonlinear block train rerank；block-best proposal 再进入独立多 sequence validation gate。
- Validation gate 支持多 token rows，要求 mean block improvement 和 improved-sequence
  fraction 同时达标；validation 不参与 candidate generation 或 train rerank。
- Block Gate 同时支持多 train token rows：将每条 source block 中捕获的目标 Linear inputs
  沿 token 维拼接，联合计算 residual target；每个 hard proposal 在全部 train sequences 上
  运行完整 block forward，并以 mean loss + improved-sequence fraction 选择，防止单 train
  sequence 支配候选方向。
- 新增 `src/fsr_vq/trajectory.py`：强制 accepted trajectory 的 train/validation loss 严格
  单调下降并记录每步 source/new loss、improvement 和 proposal metadata。
- 新增 `experiments/fsr_vq/run_qwen_block_accumulation_gate.py`：在每次 accepted hard
  transition 后刷新当前 weight、assignments、Linear residual 和 candidates；首次 validation
  rejection 即回滚并停止；支持完全独立 final audit token rows。
- 新增 `experiments/fsr_vq/summarize_accumulation_gate.py`：汇总 accepted count、停止原因、
  train/validation/audit improvements 和 audit sequence consistency。
- 新增 `experiments/fsr_vq/summarize_block_candidate_gate.py`，按 layer/proposal Linear 汇总
  train pass、validation pass、accepted runs、相对 improvement、improved fraction 和最终
  proposal 是否偏离 Linear rank-0。
- 新增 `experiments/fsr_vq/materialize_accumulation_state.py`：从 source logical Vector
  checkpoint 顺序应用 accepted trajectory，逐条校验 `current_code_id` 防止 stale/mismatched
  record，并输出 codebook/norm/format 不变的完整可评测 checkpoint。
- FSR-VQ 物化 checkpoint 可直接复用
  `experiments/nowag_d6/evaluate_vector_checkpoint.py` 做全 28 层、196 Linear fresh
  reconstruction 审计和 WikiText2 PPL；PPL 正式配置使用 sequence length 2048。
- 新增完整方法与复现手册
  `docs/20260728_101500_fsr_vq_complete_method_experiment_and_paper_manual.md`，集中记录公式、
  两级 hard search、事务语义、数据隔离、checkpoint 物化、实验矩阵和论文主张边界。
- FSR-VQ accumulation runner 新增 `--objective logits`：仅在最后一个 decoder layer 合法，
  对 block output 执行 final norm 与 lm head 后，用 logit reconstruction 做 proposal rerank、
  validation stopping 和 final audit；默认 `block` 保持原行为。
- 新增 `tests/test_fsr_vq_objective.py`，锁定 logits objective 的末层范围约束、block identity
  projection 和 `final norm -> lm_head` 投影顺序。
- Accumulation runner 新增 `block_with_logit_guard`：candidate 必须同时通过 block 与 logit
  train/validation evidence；结果同时记录独立 block audit 和 logit-guard audit。
- 双目标 feasible pool 支持 `--dual-selection block|maximin`；maximin 使用两项目标相对收益
  的较小值作为 proposal score，并通过单元测试锁定。
- Accumulation runner 新增 `block_with_nll_guard` 与 `block_with_kl_guard`；NLL 使用标准 causal
  shift，KL 支持 temperature；guard-specific improved-fraction 可与 block fraction 分离。
- Vector checkpoint evaluator 新增 `--ppl-split train|validation|test`，默认仍为 test；用于在
  不访问 test 的情况下执行 trajectory-level validation PPL selection。
- Materializer 新增 `--max-transitions N`，可从完整 accepted trajectory 物化任意前缀 snapshot，
  同时记录完整 trajectory 与 snapshot 的 accepted counts。
- Logical-checkpoint lm_eval runner 新增 `--log-samples`：除完整 raw results 外，输出紧凑
  `paired_samples.json`，仅保留 `doc_id/doc_hash/prompt_hash/target_hash`、任务主指标和二元
  score，用于不同 checkpoint 的严格逐样本配对，避免重复保存题目正文到分析汇总。
- 新增 `experiments/fsr_vq/analyze_paired_accuracy.py`：强制 task set 和所有 pairing keys 完全
  相等，计算 disagreement table、two-sided exact McNemar、paired bootstrap 95% CI、六任务
  分层 macro CI 和预注册 margin non-inferiority verdict。
- 新增红绿灯测试 `tests/test_evaluate_logical_checkpoint_lm_eval.py` 与
  `tests/test_analyze_paired_accuracy.py`，覆盖紧凑样本提取、重复/缺失 key、二元 score、
  disagreement、McNemar 和 task/key mismatch 拒绝。
- Vector-GSQ prefix runner 新增 `--layerwise-cpu-offload`：基础模型 BF16 驻 CPU，只把当前
  Transformer block 与共享 RoPE 搬到量化 GPU；当前层完成 checkpoint 写入和 hidden-cache
  传播后立即移回 CPU，支持 Qwen3-32B 在单张 80GB GPU 上运行七路 Vector-GPTQ。
- 新增 `experiments/performance/run_qwen3_32b_vector_gsq_gpu3.sh`：固定默认物理 GPU 3、
  `CUDA_VISIBLE_DEVICES=3`、进程内 `cuda:0`、GPTQ concurrency=7，启动前要求至少
  70000 MiB 空闲显存，并为 64 层 Qwen3-32B 自动创建时间戳结果目录与启动报告。
- Prefix runner 新增结构化进度事件：model load、hidden-cache、layer、Hessian、NoWag、
  Vector-GPTQ、Vector-GSQ 和 checkpoint 完成节点均实时 flush 到日志。
- 新增 `experiments/fsr_vq/run_qwen_block_coordinate_sweep.py`：按固定七 Linear 顺序运行
  block-coordinate FSR-VQ sweep；每个阶段只优化一个 Linear，立即物化完整 logical checkpoint，
  下一阶段从该新 hard state 重建全部七个 Linear 并重新捕获 residual/candidates，禁止跨 Linear
  复用旧 proposal。支持多 sweeps、逐 Linear transition budget、原子 progress/summary、阶段日志
  和失败产物；已有输出默认拒绝覆盖。
- 新增 `tests/test_run_qwen_block_coordinate_sweep.py`，锁定七 Linear 必须完整且唯一、stage seed
  唯一，以及每个阶段 input checkpoint 必须严格指向上一阶段 materialized checkpoint。
- Vector-GSQ prefix runner 新增 `--gsq-objective staged`：按 `q_proj -> k_proj -> v/o -> mlp`
  顺序优化，目标分别为 Q Linear 输出、K Linear 输出、attention 输出和完整 block 输出；已接受
  的前序 hard assignment 会冻结并进入后续阶段的 teacher/student forward。
- Staged Vector-GSQ 为每个阶段保留 validation-selected assignment，并在四阶段结束后用原有
  dense block target 做全局 validation gate；整体不优于 Vector-GPTQ 初值时原子回退整个 block。
- 新增 `--scale-finetune-steps/--scale-finetune-lr`：固定 assignment 与 codebook，只学习七个
  Linear 的输出行尺度；改善后折入现有 `row_norm`，不增加 logical checkpoint 字段或 assignment
  码率。该功能范围是 block-local output refinement，不冒充全模型 global scale fine-tuning。
- 新增 Remote-14 LLaMA-3.1-8B 完整入口
  `experiments/llama_qtip/run_llama3_1_8b_staged_vector_gsq_remote14.sh`，量化后自动执行
  WikiText2 test PPL（seqlength=2048）与 ARC-C/E、HellaSwag、LAMBADA、PIQA、WinoGrande。
- 新增 `tests/test_staged_vector_gsq.py`，覆盖阶段合同、partial weight patch、四类 activation
  objective、fixed-assignment row-scale 梯度、scale fold 与上下文恢复；旧 `block-all` 默认不变。
- Staged Vector-GSQ 新增 `--staged-joint-group-scales` 与 `--staged-joint-scale-lr`：每个阶段将
  active assignment logits 与 row/input-group scale 联合优化，inactive 阶段使用已选择的 hard
  assignment + FP16-rounded scale；checkpoint 和回退均成对处理 assignment/scale。
- logical checkpoint 支持可选 `group_scale/group_size`，按 FP16 metadata 计入真实 logical bpp；
  最终 global gate 对 baseline/candidate 都执行完整 `logical_state -> reconstruct_logical_state`，
  不再只舍入 group scale 而漏掉 codebook、row norm、column norm 的部署误差。
- 本地 LLaMA 单卡入口 `experiments/llama_qtip/run_llama3_8b_staged_tuning_local.sh` 支持 joint
  group scale；joint 模式自动要求 group scale、fixed refine=0、block polish=0，启动前检查单卡
  可用显存，并只暴露所选物理 GPU。
- 官方 GSQ 对照 checkout 新增固定 token-cache dataset 和 train/validation/GPTQ 显式 offset，
  可与 Vector-GSQ 复用完全相同的 FineWeb-Edu token 行；`eval.ppl_seqlen` 将训练长度与 PPL 长度
  解耦；加载时校验 cache identity 中的 tokenizer/model path，拒绝跨模型误用。入口为
  `code/GSQ_official_20260715_000253/scripts/run_llama3_8b_2bit_gsq_token_cache_gate_local.sh`。
- 新增官方 GSQ partial-prefix 精确评测器 `eval_prefix_ppl.py`：直接加载已保存的层级 packed shards，
  运行 WikiText2 test 并写出完整精度 PPL、seqlength、耗时与峰值显存 JSON，避免为补测 PPL
  重复执行 GPTQ/Gumbel 量化。
- 官方 GSQ 导出 schema 显式区分 effective bits 与 storage bits：2-bit GSQ 的 logical rate 仍按
  2 bits/weight 计算，但因 compressed-tensors 没有 uint2 pack format，运行时 schema 保持 4-bit
  storage container；`groupsize/self_attn` 来自训练配置，全线性模式不忽略 attention。
- 新增 `experiments/llama_qtip/summarize_structure_aware_vs_original_gsq.py`：在生成“超过原始 GSQ”
  verdict 前强制校验相同模型、WikiText2 test、seqlength=2048、相同一层 prefix，并同时要求
  Vector logical bpp 不高于 scalar GSQ、Vector PPL 严格更低；输出完整差值和布尔 Gate JSON。
- 原始 GSQ `main.py` 新增全局 RNG 复现入口：在任何模型加载、GPTQ 或 Gumbel sampling 前统一设置
  Python、NumPy、PyTorch CPU/CUDA seed；distributed rank 使用 `data.seed + rank` 独立随机流。
- 新增完整 32 层本地单卡入口
  `code/GSQ_official_20260715_000253/scripts/run_llama3_8b_2bit_gsq_token_cache_full_local.sh`：
  允许选择一张有足够剩余显存但非完全空闲的物理 GPU，量化过程不做逐层 PPL，完成后自动从唯一
  checkpoint run 执行 WikiText2 test、seqlength=2048 的完整精度 PPL 并输出 JSON。
- 原始 scalar GSQ 新增 `eval_checkpoint_lm_eval.py`：直接从 32 层 per-layer packed shards
  解压并物化完整 HF 模型，先审计 32×7 Linear coverage、shape、scale finite 与 2-bit+FP16-scale
  logical bpp，再用同一套 lm_eval 0-shot 六任务评测，避免依赖 vLLM 服务或 4-bit storage
  container 的运行时解释。
- 新增 rate-fair 正式方法入口
  `experiments/llama_qtip/run_llama3_8b_staged_jointgroup160_full_local.sh`：固定 staged joint
  assignment/group-scale、group160、32 层、seed0 和完整 logical gate；精确预注册码率
  2.1207557091 bpp 低于 scalar GSQ 2.125 bpp，量化后串行执行 2048 PPL 与六项 lm_eval。
- 新增 `experiments/llama_qtip/wait_for_scalar_then_run_vector.py` 单卡交接器：通过 Linux pidfd
  事件等待 scalar 进程退出，不轮询 GPU/日志/结果；只在退出事件后一次性验证 scalar 32层、
  WikiText2 test、seqlength2048 与有限 PPL，验证通过才在同一物理 GPU 上 `exec` group160
  Vector launcher，避免两个长跑重叠，也避免小时检查点之间闲置显卡。
- 新增 `experiments/llama_qtip/summarize_full_structure_aware_vs_original_gsq.py`：完整模型 verdict
  要求两侧同模型、32/32 层、WikiText2 test、seqlength2048、Vector 224/224 Linear fresh logical
  reconstruction exact，并同时满足不高码率和更低 PPL；任何协议缺失或不一致直接拒绝比较。
- Staged Vector-GSQ 新增 dense-interface teacher：通过 `collect_dense_stage_targets` 一次采集原始
  dense Q、K、attention 与block输出，后续阶段candidate可使用量化前缀补偿误差，但teacher不被
  量化前缀污染；量化JSON逐层记录 `teacher_reference=original_dense_network`。
- 新增scale-aware all-7 refinement primitives：`joint_block_refinement_loss` 同时连接七个quantizer
  logits与七组log-scale，`snapshot_joint_hard_state`/`select_better_joint_snapshot` 原子保存assignment
  与scale。matched消融未通过hard gate，因此最终推荐方法不启用该可选阶段。
- 新增 `validate_block_refinement_contract`，禁止 `staged_freeze_qk` 与会更新全部七个quantizer的
  block refinement组合，避免参数名声称冻结但checkpoint实际改变Q/K。
- Full comparator 进一步要求32/32层dense teacher，输出 `dense_teacher_layers`；旧hybrid-teacher
  结果即使命令行参数相同也不能生成“超过原始GSQ”结论。
- 新增 logical-checkpoint 层级组合器
  `experiments/nowag_d6/compose_logical_checkpoints.py`：以完整 base checkpoint 为主体，按预注册
  Transformer layer 集合原子替换 donor 的七个 Linear state；组合前校验 32 层/224 Linear 覆盖、
  assignment/codebook shape 与 layer spec，输出写入 composition provenance，拒绝覆盖输入文件。
- 新增层级 hybrid search 入口：核心脚本预注册 early 0--3、late 28--31、edge 0--3+28--31 三个
  rollback 候选，并为每个候选串行执行 WikiText2 test PPL（seqlength=2048）与六项 0-shot
  lm_eval；本轮使用 `experiments/llama_qtip/run_llama3_8b_layer_hybrid_search_local.sh` 在本机选择
  有足够剩余显存的物理 GPU，启动前一次性检查显存下限，不连接远端服务器。
- 新增 `experiments/nowag_d6/calibrate_task_group_scales.py`：从 ARC-C/E、HellaSwag、PIQA、
  WinoGrande 的 training split 构建确定性互斥 train/validation/audit，多项选择目标使用正确选项
  normalized log-likelihood 与 dense-teacher choice KL；固定 assignment/codebook，只学习指定末端层
  group-scale multiplicative delta，validation 按 balanced macro ACC 优先选择并折叠回原 FP16 字段，
  保持 logical bpp 不变且不保存题目正文。
- 新增本地完整入口 `experiments/llama_qtip/run_llama3_8b_task_group_scale_calibration_local.sh`：
  GPU 显存握手后串行执行 layer 28--31 task calibration、WikiText2 test PPL（seqlength=2048）与
  六任务 0-shot lm_eval；默认只在本机物理 GPU0 运行。
- 任务 group-scale 校准新增可选 FineWeb-Edu dense-teacher top-k token guard：从显式互斥的 cache
  rows 采集 teacher top-32 token 分布，训练时加入 cross-entropy，epoch selection 还强制 held-out
  text guard 相对 base 不超过预注册回退阈值；本地入口为
  `experiments/llama_qtip/run_llama3_8b_task_group_scale_textguard_local.sh`。
- 新增 `interpolate_group_scale_checkpoints.py`：逐张量验证 assignment/codebook/row_norm/col_norm 与
  metadata 完全一致后，只对正值 FP16 group_scale 做 log-domain interpolation，端点精确、码率不变。
- 新增 `evaluate_task_training_checkpoint.py` 与本地 interpolation selection pipeline：使用 seed991 的
  每任务 64 个新 training-split 样本及 WikiText validation 比较 alpha 0/0.25/0.5/0.75/1，内部阶段
  不调用正式 lm_eval/test；选择后才允许对单一候选做正式评测。
- 本地 staged tuning launcher 的 calibration/train/validation sequence budgets 改为可配置环境变量，
  默认仍保持 64/8/8；新增 budget256 group160 layer0 Gate 入口，固定 256/32/32，只在单层 PPL
  严格改善后才允许升级为完整 32 层实验。
- 新增 budget256 group160 完整入口：Gate 通过后固定 256/32/32、32 层，并复用现有流水线自动运行
  WikiText2 test 2048 PPL 与六任务 lm_eval；仍只暴露一张通过显存握手的本地物理 GPU。
- 本地 staged runner 新增可配置 `TRAIN_BATCH_SIZE`/`TRAIN_MICROBATCH_SIZE` 及整除合同；新增
  `run_llama3_8b_staged_jointgroup160_official_gsq_{gate,full}_local.sh`，严格固定 FineWeb-Edu
  4096 train、128 validation、512 GPTQ、4096-token无切段、batch64、microbatch2和10 epochs对应的
  640 steps。full入口仅在单层Gate证明时间与质量可行后使用。
# Task-functional anchor-local assignment calibration（2026-08-24）

- 新增 `experiments/nowag_d6/calibrate_task_local_assignments.py`：从完整 logical Vector-GSQ
  checkpoint 出发，固定 codebook、row/column normalizer 与 group scale，只训练局部 assignment。
- 候选不是盲目枚举：先为每套4096×d码本建立8-way几何近邻，再用任务training split与独立
  FineWeb dense-text guard产生的权重梯度，在每个anchor邻域内选择一项一阶最优alternative。
- 每个向量只保留“当前hard ID/梯度选中邻居”两个状态，以binary Concrete概率训练switch logit；
  初始hard状态严格等于源checkpoint，未通过Gate可exact回滚，避免为末端任务校准保存8-way全量
  logits造成不必要的显存开销。
- checkpoint选择只使用任务training split内互斥train/validation/audit和FineWeb互斥rows；正式
  benchmark validation/test不参与训练或选择。候选必须相对未修改anchor取得至少0.5%的balanced
  task-loss改善，同时限制macro accuracy最多下降1个百分点、任一任务loss和dense-text CE最多回退
  0.5%；独立audit集再次执行同一loss-dominance规则，未通过即exact回滚。最大switch rate与fresh
  logical reconstruction仍共同构成部署态Gate。
- 训练epoch只要balanced loss取得最小改善且各任务loss受界，就按全局正logit confidence构造固定的
  1/8、1/4、1/2、full嵌套hard path；full-state的离散macro不参与source预筛，macro/text约束只
  作用于真正的projected部署候选。validation优先选择通过全部约束的最稀疏状态，同switch数才比较
  task loss；audit仅验收最终单一候选。
  本地入口使用80×1024 text train tokens和互斥的64×1024 validation/audit rows，取代4×256的小样本
  text Gate，以更可靠地保护WikiText2 PPL。
- 新增本地单卡入口
  `experiments/llama_qtip/run_llama3_8b_task_local_assignment_textguard_local.sh`：固定使用官方规模
  2.1207557-bpp Meta-Llama-3-8B checkpoint，训练layer28--31，随后串行运行2048 PPL与规定六任务
  lm_eval；入口显式绑定一张物理GPU并设置显存/宿主内存门禁，不访问10.30.0.14。
- assignment入口支持显式`--task-split-offset`：在每个任务由seed0确定的同一随机排列上平移完整
  train/validation/audit窗口，保证多轮refinement不靠更换seed且不同轮使用互斥任务样本。launcher
  同时提供`TASK_SPLIT_OFFSET`及三个FineWeb row-start环境变量；数值输入受非负整数校验，仍只暴露
  一张本机GPU。由此可把已接受的稀疏checkpoint作为新anchor，重新计算附近码字功能梯度并执行
  下一轮trust-region projection，而不是简单增加上一轮switch密度。
- 单阶段入口支持`RUN_FORMAL_EVAL=0`校准-only模式：仍完整执行validation、独立audit、logical
  reconstruction与checkpoint落盘，但不读取WikiText2 test或正式lm_eval。新增
  `run_llama3_8b_iterative_assignment_refinement_chain_local.sh`串行执行stage3--5，三个阶段共享同一
  物理GPU且数据窗口互斥；stage3/4只产生内部checkpoint，只有预注册stage5端点执行一次正式评测，
  避免用中间test选择迭代深度并减少两次重复lm_eval开销。
- 红绿灯：`tests/test_task_local_assignment_calibration.py`覆盖anchor-first邻域、梯度定向proposal、
  hard anchor/switch exact、soft梯度、loss-dominance接受/拒绝边界、全局confidence projection的
  固定嵌套路径、只修改assignment的码率契约和单卡正式评测入口；
  `tests/test_calibrate_task_group_scales.py`覆盖分阶段offset窗口确定性、互斥性和越界拒绝。
  chain测试还锁定offset384/576/768、三组FineWeb窗口、两次calibration-only和一次端点评测合同。
- assignment本地入口进一步开放`CALIBRATION_LAYERS`、三项task split count、三项FineWeb row count
  与`TEXT_SEQUENCE_LENGTH`，并对层ID、正整数预算及互斥row执行启动/校准双层校验；默认值保持原
  28--31层与64/64/64、80/64/64×1024协议，已有实验可复现。
- 新增`run_llama3_1_8b_matched_vector_assignment_chain_local.sh`：在同一张本地物理GPU上先对
  Meta-Llama-3.1-8B-Instruct执行32层官方规模Vector-GSQ（FineWeb 4096 train / 128 validation /
  512 GPTQ、4096-token），验证32层原子checkpoint后再训练28--31层assignment。assignment采用
  每任务512/256/256 training-split样本及4096条4096-token FineWeb训练数据，selection/audit使用
  source quantizer从未见过的本地C4 rows4736--5375；最后串行执行WikiText2 test PPL和六任务lm_eval。
  chain通过同一`CUDA_PHYSICAL_DEVICE`传递和70 GiB显存门禁保证只占一张本地卡，不访问远端服务器。
- 新增`build_matched_llama_assignment_cache.py`：只有Llama-3与Llama-3.1的128k普通词表、BOS、除
  `added_tokens`外的raw tokenizer backend及多语言/代码probe编码全部逐项相等时，才允许复用既有
  4736×4096 FineWeb token前缀；缓存还必须只含普通token或两模型共享BOS，任何模型专属special ID
  都会拒绝。随后从本地C4 validation Arrow缓存构造640条独立4096-token guard，原子写入带来源
  范围和identity的5376-row缓存。该合同允许Llama-3.1仅重命名未使用的reserved special token，
  同时避免跨模型静默复用错误token ID。
- assignment训练器新增显式`--optimization-objective text_teacher_only`公平性路径：任务样本仍可在
  最终阶段作事后评测，但不参与proposal梯度、switch优化、confidence projection选择或独立audit。
  候选、训练、selection与audit只使用互斥FineWeb/C4 dense-teacher文本分布；checkpoint元数据记录
  labeled task examples是否进入优化合同。默认`task_adapted`行为保持不变。
- 新增单卡正式入口`run_llama3_1_8b_text_teacher_only_assignment_local.sh`：复用已完成的同模型
  Vector-GSQ硬锚点和4096/128/512文本协议，在layers28--31执行teacher/text-only assignment，最后
  串行运行WikiText2 2048 PPL与六项全量lm_eval。相关红绿灯与QTIP回归共43项通过。
- task group-scale校准器新增与assignment一致的loss-dominance选择合同：支持task split offset，候选
  必须满足task balanced-loss最小改善、macro/单任务loss/C4 CE回退上界，并在独立audit上再次通过；
  audit失败会恢复零delta并落盘原始scale。summary同时记录baseline/candidate/final audit与Gate状态。
- 新增`run_llama3_1_8b_matched_task_group_scale_local.sh`：复用同一Llama-3.1 Vector-GSQ source，固定
  layers28--31、每任务512/256/256、4096/128/512条4096-token文本预算，只在本机一张物理GPU上
  串行运行scale校准、WikiText2 2048 PPL与六任务全量lm_eval；`pipeline.status`覆盖calibration、PPL、
  lm_eval、completed/failed阶段。相关共享回归测试57项通过。
- assignment参数化新增可选joint group-scale delta：同一个deployable parametrization同时对binary
  switch与已有FP16 scale反向传播，使用独立Adam param group、既有学习率0.005/0.002和各自正则；
  hard部署时先折叠assignment与scale，再把模块同步到FP16落盘值，保证fresh reconstruction精确。
- Joint selector把每个epoch的scale快照与0、1/8、1/4、1/2、full assignment投影绑定；候选必须
  通过task/text loss-dominance，随后优先最低task loss、只在loss相同时偏好更少switch。最终audit失败
  同时恢复零scale delta和原assignment，避免只回滚一个坐标。
- task split支持与train/validation窗口分离的显式audit offset，并拒绝重叠/越界。新单卡入口
  `run_llama3_1_8b_joint_scale_assignment_local.sh`使用任务offset1024和全新C4 rows5376--5439作一次
  final audit，随后串行执行2048 PPL及六任务全量lm_eval；相关回归测试共71项通过。

## Joint group-scale + anchor-local assignment calibration（2026-08-29）

- `calibrate_task_local_assignments.py` 支持 `--train-group-scales`：在binary Concrete assignment参数化中同时学习已有
  group scale的有界log delta，使用独立optimizer parameter group、L2约束和FP16折叠。
- Joint projection包含零-switch scale端点与1/8--full assignment嵌套硬投影；全部候选都以真实可部署权重验证，
  在Gate内按balanced task loss而非稀疏度排序。
- `--task-audit-offset` 允许final task audit与train/validation区间分离；joint launcher使用offset1024以及新C4
  rows5376--5439，保证最终组合端点只做一次从未观察的audit。
- `fold_deployment_state` 同时折叠hard assignment与FP16 scale，并验证codebook/normalizer/非目标状态、逻辑bpp与
  fresh reconstruction合同。
- 完整Llama-3.1-8B实验已验证该路径工程上可执行，但方法效果被独立scale-only严格支配。该负结果已固化为
  方法边界：后续优先使用“固化部署态scale锚点后再做稀疏assignment repair”，不扫描naive joint超参数。

## Scale-hard assignment repair 与投影 Gate 修复（2026-08-29）

- 新增 `run_llama3_1_8b_scale_hard_assignment_repair_local.sh`：验证并加载已经独立训练、audit通过的
  FP16 group-scale checkpoint；固定scale/codebook/normalizer，从真实hard state重新计算8-way功能候选，
  只训练layers28--31 assignment，最后串行运行WikiText2 seqlength2048 PPL和六任务全量lm_eval。
- `calibrate_task_local_assignments.py` 的task-adapted selector不再要求full endpoint先通过source Gate。
  只要训练路径产生非零switch，就始终枚举1/8、1/4、1/2、full嵌套hard projection，并让每个真实部署
  状态独立接受loss/macro/text/rate Gate，锁定非单调稀疏路径可被观察。
- `build_matched_llama_assignment_cache.py` 新增 `--expected-prefix-cache` 与bit-exact prefix验证：扩展缓存时
  旧行的shape、metadata和token必须逐项一致。本轮保留既有5440×4096前缀，只新增rows5440--5503。
- 新增红绿灯覆盖 hard-handoff单卡正式入口、source合同、最大不重叠audit窗口、prefix extension成功/拒绝、
  full endpoint失败时仍评估稀疏路径及每个投影独立Gate；35项聚焦测试通过。
- 正式方法结果为安全no-op：八个changed projection全失败，最终checkpoint与scale-only bit-exact。
  该行为是部署保护合同，不应被报告为非零assignment audit失败。

## Cross-view consensus assignment proposal（2026-08-29）

- `calibrate_task_local_assignments.py` 新增 `--proposal-gradient-shards`。当值大于1时，任务训练样本按task
  分层、文本样本按row轮转，形成确定性、互斥且每个task等量的gradient views；每个样本只前向/反向一次，
  不靠重复数据或更换seed制造一致性。
- 新增strict consensus alternative selector：仍从当前码字8-way几何领域出发，但一个邻居必须在所有
  gradient views中具有负一阶变化；选择时最小化最差view分数。不存在共同下降邻居的向量保持anchor ID，
  binary路径上的权重扰动为零，switch penalty只会进一步保持其关闭。
- Summary记录aggregate negative rate、strict-consensus eligible rate、冻结向量数、共同邻居数及selected
  mean/worst-view delta，直接检验V10的“98.20%负一阶但0/8 hard成功”是否来自min-of-neighbors选择偏差。
- 新增单卡Gate入口 `run_llama3_1_8b_scale_consensus_assignment_local.sh`：固定4个gradient views和独立scale
  source，内部校准始终先停止；只有best epoch、非零assignment、validation/audit/rate和序列化合同全部通过，
  才允许可选的WikiText2-2048与六任务全量评测。新C4 audit rows5504--5567通过bit-exact prefix扩展。
- 红绿灯覆盖task-stratified互斥分片、共同下降/冲突候选、无consensus精确冻结、单卡Gate launcher；相关
  38项测试通过。
- Llama-3.1-8B正式结果：aggregate负方向率98.1973%，四视图strict-consensus率48.7101%，冻结
  74,609,077 / 145,465,344个向量；两epoch八个hard projection仍全部失败，最终选择epoch0并精确回滚。
  该结果验证selector的诊断能力，但否定“符号一致即可形成可部署assignment trust region”。
- Gate在全部changed candidate未通过validation时保持`calibration_noop`，不运行冗余PPL/lm_eval；只有
  assignment非零、validation/audit/rate和状态合同同时通过才进入正式benchmark，避免把no-op指标复用误写为新测量。

## Scale-conditioned curvature predictor Gate（2026-08-30）

- `_proposal_gradients`可选在真实backward输入上累计每个Linear输入维度二阶矩；inference-only teacher
  forward不会进入统计，完整样本不增加第二遍校准前向。默认关闭时保持原assignment校准行为。
- `probe_scale_conditioned_assignment_curvature.py`对当前码字8-way邻居计算真实scale-conditioned weight
  jump、四视图mean/worst一阶项和对角局部activation-Hessian代价；曲率ranking使用无系数的
  worst-view/$\sqrt q$收益代价比，不把局部输出二次项写成完整task Hessian。
- 三种ranking在每个Linear使用相同的128/512/2048/8192 nested预算，通过稀疏原位weight更新逐个运行
  完整任务validation，并在每次切换ranking前精确恢复source权重。predictor必须相对两个control各赢至少
  3/4 matched budgets且平均loss更低，才允许后续完整训练。
- 只有一个validation胜出curvature候选可以读取一次audit；audit通过才物化int32 assignment checkpoint和
  运行正式PPL/lm_eval。predictor失败不写多GB checkpoint。单卡launcher固定完整数据协议并明确区分
  `curvature_predictor_rejected`、`curvature_predictor_passed_training_required`和直接端点成功状态。
- 红绿灯覆盖曲率改变matched ranking、predictor胜负合同、稀疏hard state精确恢复、backward输入二阶矩
  复用和本地单卡正式入口；当前相关43项测试通过。
- 正式终态合同已验证：曲率对strict consensus 4/4胜、对aggregate 2/4胜，触发
  `curvature_predictor_rejected`；候选audit、checkpoint物化和正式benchmark均保持关闭，证明Gate在失败路径
  不泄露测试数据、不写多GB状态，也不会误启动完整assignment训练。

## Causal set-conditional hard assignment search（2026-08-30）

- `probe_set_conditional_assignment_gain.py`把固定128个curvature-ranked邻域切换组成Linear-local bundle，
  按Transformer因果层序在当前已接受hard state下真实比较每层7个bundle；只接受完整任务train
  supervised+teacher-KL严格下降的最佳坐标，每层最多一个，不训练连续参数。
- 新增任务prefix cache：对全部512×5训练样本的所有choice构建layer28输入BF16 CPU cache，候选只重放
  layers28--31与lm head；cache在搜索前用32个跨任务、长度与continuation位置分层的example逐choice对比
  完整HF forward。完整参考严格复用cache的同一shape bucket和batch composition，以隔离真正的重放误差；
  dense teacher也使用同一batch协议，避免BF16 batch-shape差异污染teacher-KL。
- `run_hidden_block_output`现在显式调用Transformers `create_causal_mask`并复用HF position/rotary语义；此前
  `attention_mask=None`会让direct DecoderLayer重放在部分attention backend下看到未来token。逐层集成诊断
  已验证修复后的最后logits与完整HF forward逐位一致。
- 每层先物化incumbent即时block输出，再记录7个候选的真实block-output MSE与局部curvature cost，形成不参与
  选择阈值的正控制；candidate evaluation始终包含此前已接受bundle，因此测量的是条件集合增益而非独立和。
- Launcher固定本地GPU7、完整任务/文本协议和新C4 audit rows5568--5631；validation/audit只在搜索结束后
  使用，只有二者均通过才写checkpoint与触发正式PPL/lm_eval。50GiB空闲显存门禁依据同路径历史
  25.285GiB实测峰值留出近2倍余量，允许安全共享而不要求整卡空闲；失败状态为
  `set_conditional_gain_rejected`。
- 红绿灯覆盖causal block replay、batch-matched task score对齐、严格条件接受、task-balanced teacher-KL汇总、
  Spearman正控制、分层same-batch cache parity、全量数据/单卡launcher合同；当前相关56项测试通过。
- 正式终态合同已验证：四个条件bundle分别带来正训练增益并通过task validation，但text CE相对退化
  0.9186%超过0.5%上限；launcher写`set_conditional_gain_rejected`，不写checkpoint、不读取audit、不启动
  PPL/lm_eval。该路径明确区分“任务条件坐标有效”与“通用部署端点有效”。

## Exact text-constrained conditional assignment search（2026-08-30）

- `probe_text_constrained_assignment_gain.py`保留V13固定curvature bundle和因果task conditional replay，但将
  优化从加权和改为词典序约束：先要求候选在完整text-train teacher CE上相对当前incumbent不退化，再在
  可行集合中选择task-train combined loss最低的bundle；两类收益不能互相购买。
- 完整4096条×4096 token文本train在source量化状态构造layer28 BF16 prefix hidden cache，共16,777,216
  tokens与137,438,953,472 bytes（128GiB）。缓存开始层强制等于首个搜索层，并在搜索前用均匀覆盖首尾的
  8条序列对同batch完整HF transformer前向做CE parity。
- 每层只对task-train严格改善的bundle计算文本约束。所有候选复用incumbent到当前层之前的hidden；当前层
  仅覆盖候选Linear权重，后续层保持incumbent状态。候选最终hidden在batch维拼接，LM head通过候选批处理
  提高单卡GEMM利用率，并按8192词表块计算精确log-sum-exp与teacher top-k期望；计算量仍随候选数增长，
  但不需要随机token sketch，也不物化完整候选全词表logits。
- 数据隔离保持fail-closed：搜索前只构造task/text train teacher；坐标结束后才加载独立dense teacher并构造
  task/text validation，validation通过后才构造candidate-unexposed text audit和评分task audit；audit通过
  才写checkpoint并启动WikiText2 seqlength2048与六任务全量lm_eval。
- 本地launcher默认只暴露物理GPU5，要求50GiB空闲显存与500GiB可用宿主内存，禁止服务器14路径。红绿灯
  覆盖词典序可行集、分块CE与完整词表等价、候选批处理与独立suffix等价、128GiB缓存合同、全范围parity
  采样及完整数据/单卡/fail-closed launcher合同。
- 正式运行已覆盖完整失败终态：28个bundle中27个task-improving，但其完整text-train CE全部上升；零退化
  可行集为空，四层均不接受坐标。Launcher写`text_constrained_gain_rejected`，validation/audit/formal test
  保持未访问，不写checkpoint。该行为证明词典序门禁按预注册合同fail-closed，而不代表生成了新部署模型。

## Hard-first local group-scale compensation（2026-08-30）

- `hard_scale_compensation.py`为 hard assignment bundle 计算受影响 row/input-group 的闭式 FP16 scale
  投影；只触碰实际覆盖 group，并报告投影前后加权 anchor error、FP16 后真实变更组数和最大相对 scale
  变化。
- `HardScaleCompensatedApplicator`以 group 为事务边界稀疏写入 paired hard state，并能精确恢复 source；
  单元测试验证运行中权重与修改后 checkpoint 的 fresh logical reconstruction 逐元素一致。
- `probe_text_constrained_assignment_gain.py --hard-scale-compensation`复用 V14 全量 task/text cache、候选和
  fail-closed Gate，但候选权重由 assignment+scale 原子动作生成。通过 audit 时 checkpoint 同时落盘 int32
  assignment 与原位 FP16 group scale，不新增参数张量或逻辑比特。
- 本地单卡入口 `run_llama3_1_8b_hard_scale_compensated_gain_local.sh`默认物理 GPU4，禁止远端路径；基础
  launcher 的 V14 默认模式保持不变。
- 正式失败终态已验证：28个paired action全部task-improving但0个text-feasible，launcher写
  `hard_scale_compensated_gain_rejected`；validation/audit/formal test未访问，checkpoint不存在。运行中
  2133个touched group有2048个FP16 scale真实变化，证明失败不是补偿no-op。

## 目标模型正式评测矩阵与 Qwen3-QTIP 模型桥接（2026-08-31）

- `run_target_vector_gsq_eval_matrix_local.sh`在单张本地物理GPU上顺序补齐Qwen3-4B/8B/14B/32B
  已有完整logical checkpoint的缺失正式指标；固定WikiText2 test seqlength=2048、六项全量0-shot
  `lm_eval`，不重新量化、不使用`--limit`，并对模型层数、hidden size、checkpoint和空闲显存执行门禁。
- `experiments/qwen_qtip/qwen3_qtip_adapter.py`把标准dense Qwen3每层q/k/v/o/up/gate/down七个无bias
  Linear替换成官方QTIP `QuantizedLinear`；skip-list、形状、dtype和QTIP配置字段均fail-closed。
- `hfize_qwen3.py`审计每层八个QTIP产物（七Linear加layernorm）、装载官方trellis/SU/SV状态并保存可
  重载Qwen3 checkpoint；`evaluate_qtip_checkpoint.py`现按checkpoint family选择官方LLaMA loader或
  Qwen3桥接loader，PPL/六任务协议和native trellis manifestation gate保持一致。
- QTIP供应商快照的resume完整性检查已补上遗漏的`gate`产物；缺gate的中断层不会再被误判为完成。
- 新增红绿灯覆盖七Linear集合、config/shape/dtype/skip-list、bias拒绝、gate完整性和本地单卡评测合同；
  当前聚焦测试40项通过（QTIP比较29项、adapter 7项、评测矩阵与既有evaluator 11项中有交叠）。
- 五模型 Vector-GSQ 正式矩阵已完成：统一紧凑 JSON 同时记录每个模型的 logical bpp、WikiText2
  test/seqlength=2048 PPL、六项0-shot逐任务准确率与Macro-6；QTIP缺失项仍保持显式未完成状态。
- Qwen3-QTIP新增一次性RP1T校准cache：固定seed0、8192×4096 Hessian与384×4096 layerwise fine-tune，
  四个Qwen3规模复用；cache严格校验模型族、vocab、shape和token范围，避免上游32进程token张量回传停滞。
- 单卡Hessian仍计算相同四类输入的$X^TX$，但直接使用最终落盘的FP32/TF32精度；每个artifact记录
  `accumulation_dtype=float32_tf32`及已合并split，实现原子断点续跑且不把该执行优化写成官方FP64复现。
- LLaMA和Qwen3使用隔离QTIP环境；native kernel目录显式加入导入路径。LLaMA-2-7B官方QTIP正式评测与
  Vector-GSQ严格比较已完成，比较器允许仅分隔符不同的完整模型slug别名，同时继续拒绝真实模型不匹配。
- QTIP的incoherence transform现保留全部官方Hadamard小因子，并为Qwen3的17/19/25奇因子MLP宽度提供
  scaled DCT-II正交fallback；单测验证Gram与正反往返。HF化入口同时兼容Torch2.4 legacy DTensor命名空间。
- Qwen3-4B QTIP-Qwen3 layerwise checkpoint已完成36层/252 Linear的保存、fresh reload和正式PPL/六任务
  评测；结果显式标为无full-model e2e、FP32/TF32 Hessian和DCT维度适配，禁止冒充官方headline端点。
- Qwen3-8B QTIP-Qwen3 layerwise checkpoint已完成36层/252 Linear的Hessian、量化、保存、fresh reload和
  正式PPL/六任务评测；比较JSON明确记录双方各胜三项，但QTIP在PPL与Macro-6两个汇总指标上均更优。
- Qwen3-14B QTIP-Qwen3 layerwise checkpoint已完成40层/280 Linear的Hessian、量化、保存、fresh reload和
  正式PPL/六任务评测；QTIP在PPL、Macro-6和六任务中的五项领先，Vector-GSQ仅在ARC-E领先。
- Qwen3-32B QTIP-Qwen3 layerwise checkpoint已完成64层/448 Linear的16个Hessian split、量化、HF化、
  fresh reload和正式PPL/六任务评测；完整性审计覆盖513个量化文件及三个HF权重分片。QTIP的PPL更低，
  Vector-GSQ的Macro-6高0.2506个百分点并赢得4/6单项，比较器返回`mixed_quality_result`。
- 五目标模型Vector-GSQ/QTIP正式矩阵已闭环：`matrix_summary.json`与五个单模型summary均为
  `completed=true`，统一采用WikiText2 test/seqlength=2048与规定六任务完整0-shot、无`--limit`；紧凑
  总结JSON记录五组码率、PPL、Macro-6、单项胜数、变体边界和原始证据路径。
