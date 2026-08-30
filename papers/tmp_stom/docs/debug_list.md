# Debug List

## 2026-07-11 — `main.py` import failed before reading `wandb: false`

- 现象：`xh2` 环境中 `import wandb` 抛出
  `ImportError: cannot import name 'Imports' from wandb.proto.wandb_telemetry_pb2`，
  导致 `python -c "import main"` 和后续 STOM smoke 命令在读取配置前失败。
- 根因：`main.py` 与 `src/trainer.py` 在模块顶层强制导入 `wandb`；即使配置中
  `wandb: false`，损坏或版本不匹配的 wandb 安装也会阻断训练入口。
- 修复：为两个入口增加 guarded import。`wandb: false` 时使用 no-op fallback；
  若用户显式启用 wandb 且包不可导入，则在 `wandb.init` 时给出明确错误。
- 回归：新增 `tests/stom/test_main_import.py`，验证 `import main` 在当前 `xh2`
  环境中可用。

## 2026-07-11 — STOM validation gate CPU/CUDA mismatch in real smoke

- 现象：Qwen3-0.6B source-only smoke 在 validation selection 阶段失败：
  `RuntimeError: Expected all tensors to be on the same device, but got mat2 is on cuda:0, different from other tensors on cpu`。
- 根因：capture tensors 保存在 CPU；`HardQuantizedState` 从 CUDA weight 构造后
  reconstruct 仍在 CUDA。`per_unit_reconstruction_losses` 未把 reconstructed
  weight 移到 activation device。
- 修复：在 `src/stom/selection.py` 中将 `state.reconstruct(...)` 移动到
  `propagated_inputs.device` 后再做 matmul。
- 回归：新增 CUDA 测试
  `tests/stom/test_selection.py::test_per_unit_losses_move_cuda_state_to_cpu_activations`；
  重新运行 source-only smoke 后退出码为 0。

## 2026-07-12 — Formal matrix runs never became scheduler-complete

- 现象：formal matrix runner 的 `is_complete()` 以 `progress.json` 中
  `status == "complete"` 判断完成，但 `main.py` 只在逐层训练后写入
  `last_completed_layer`，完整跑完后不会写最终状态；因此 formal run 即使跑完也会在
  collector/scheduler 中继续显示 missing。
- 根因：早期 smoke resume 状态与 formal run terminal 状态复用了同一个
  `progress.json`，但没有终态写入函数。
- 修复：新增 `mark_progress_complete()`，完整 run 成功返回后写
  `status: complete`；`--max-layers` smoke run 写 `status: partial`，避免把
  smoke 子集误报为完整 formal row。
- 回归：新增
  `tests/stom/test_main_stom_path.py::test_mark_progress_complete_preserves_layer_progress`，
  并验证 runner/collector 的 smoke 与 formal 完成判断仍保持分离。

## 2026-07-14 — Stage-I KMeans 在 block-scale 归一化之前构造码本

- 现象：旧 `construct_source_solution()` 的 `codebook_init=kmeans` 直接对原始权重
  做全局 RMS 标准化和 KMeans，随后才初始化 per-block scale；因此其 codebook
  并不是在 `W / block_scale` 上学习，不能作为论文阶段一验证。
- 根因：旧 source construction 把码本初始化与 block-scale 优化按相反顺序串联，
  而且后续 alternation 只更新 assignment/scale，不会基于新归一化权重重新学习
  KMeans codepoints。
- 修复：新增独立的 `src/stom/stage1_codebook.py`，先计算 row/block RMS scale，
  再在归一化权重上做每 Linear 独立的 1D KMeans，并以原权重 MSE 单调门控交替
  更新 scale/codebook；阶段一明确隔离 activation、GPTQ、Gumbel 和 task loss。
- 验证：Qwen3-0.6B 的 197 个 Linear（含 attention、MLP、tied `lm_head`）全部
  逐层优于同位宽 uniform control；最差改善 `1.513%`，全模型按权重数加权改善
  `1.859%`，197 个输出码本全部独立。

## 2026-07-14 — Stage-II 普通 L2 dynamic scale 导致 GPTQ residual 爆炸

- 现象：zero-anchor 非均匀码本的普通 weight MSE 优于 direct W2，但正式 PPL
  达到 `1040+`；局部 `model.layers.2.mlp.down_proj` Hessian objective 为
  `6.2969`，允许 signed scale 后仍为 `4.5876`，远高于 direct `0.46647`。
- 根因：普通 L2 scale 拟合会放弃极少数 working-weight outlier；这些 residual
  经 GPTQ Hessian inverse 传播后被放大。row 35 的 column 2328 在 group 11 后
  一次增加 `57.54`，使后续 scale 达到 `58.54`。direct Quantizer 实际使用范围
  初始化、80 档 shrink、p=2.4 error 和正负 scale 搜索，二者此前并非同口径。
- 修复：为固定非均匀码本增加 repository-compatible p=2.4 signed scale grid
  search；同时 clone Stage-I scale 防止 dynamic 分支原地污染调用方状态，并把
  NaN/Inf PPL 纳入 runner 的失败条件。
- 验证：三层关键 objective 降至 `0.51433`；正式 196-Linear PPL 为
  `186.22855`，优于同代码重跑 direct GPTQ-W2 的 `347.29895`，两者均评估
  `298862` tokens。仍需关注 `layer 2 down_proj` 的剩余 `4.87×` objective gap。

## 2026-07-14 — Stage-III 局部 MSE gate 接受了破坏 token CE 的晚层索引

- 现象：固定 codebook/scale 的 Gumbel index 训练可持续降低每层 hard validation
  MSE 和 dense-trajectory activation drift，但全 197-Linear WikiText2 PPL 仍在
  `364–657`；local-teacher 版本甚至达到 `660–2182`，远差于 Stage-II all-197
  基线 `206.8982`。
- 根因：每层只按少量 C4 activation 的局部输出 MSE 选择 hard assignments；晚层
  每层可改变约 100–150 万个 index，局部 MSE 改善不保证最终 token CE 改善。
  `lm_head` 回退到 Stage-II 量化状态只能把 75-step PPL 从 `364.1463` 改善到
  `318.3907`，证明损害主要还在 Transformer late layers。
- 修复：新增独立本地 token tensor evaluator，并在完整 `32×2048` held-out C4
  validation 上扫描全部 29 个 Stage-III prefix hard states；以 token mean NLL
  选择全局 hard-state cutoff，不使用 WikiText2 test 做选择。选择器将最终状态
  物化为 197 个 hardlink/copy，并验证 all-Linear coverage 与统一 validation
  token 口径。
- 验证：C4 validation 在 cutoff 7 达到全局最优 PPL `97.5377`，优于 Stage-II
  `120.9528`；该候选完整 WikiText2 PPL 为 `164.8653`，相对 Stage-II 改善
  `20.3158%`。最终 49 个 Linear 使用 Stage-III assignments，148 个 Linear
  使用 Stage-II quantized assignments，197/197 全部量化且无 FP16 layer escape。

## 2026-07-14 — Stage-IV 局部 codepoint/scale MSE 与最终 token NLL 不一致

- 现象：固定 assignments 后，局部 hard validation MSE 随训练步数下降，但
  Transformer 前三层的 10/20-step 状态把 C4 PPL 从 `97.5377` 轻微推高到
  `97.5611/97.5558`；完整 80-step Transformer 的 cutoff 28 也比 cutoff 27
  更差（`85.5703` 对 `85.0217`）。`lm_head` 输出 MSE 改善本身同样不能证明
  语言模型 token NLL 改善。
- 根因：逐层输出 MSE 与最终 vocabulary cross-entropy 的敏感方向不同，晚层的
  小幅 codepoint/scale 漂移会沿残差流累积；`lm_head` 的均方误差又会平均掉对
  少数高概率 token logit 更关键的方向。
- 修复：Transformer 对每个正式候选在完整 held-out C4 上扫描全部 29 个 prefix，
  `lm_head` 每个候选都在相同 65,504-token C4 tensor 上重新计算 mean NLL；只按
  token NLL 物化最终状态。新增独立状态审计器，逐文件检查固定 assignments、
  scale signs、零锚点、码本顺序/有限性、scale 非零有限性和重建有限性。
- 验证：80-step Transformer 选择 cutoff 27，配合 40-step scale-LR×2 head 后
  C4 PPL 为 `84.2321`；最终 197-Linear 状态完整 WikiText2 PPL 为 `142.4698`，
  相对 Stage III `164.8653` 改善 `13.5841%`。独立审计 197/197 通过且无 FP16
  Linear escape。

## 2026-07-14 — 旧 STOM/GSQ 比较混用了量化口径

- 现象：早期结果把 `group_size=128`、强制零锚码本、量化 `lm_head`、attention+MLP
  全量化以及自定义 Stage-III/IV gate，与不同范围的 uniform GPTQ/GSQ 直接比较，
  产生了“码本 GPTQ 更好”以及数千到十万 PPL 的不可信结论。
- 根因：baseline 与候选没有统一 group size、target scope、head 策略、训练流程和
  checkpoint 语义；此外 GPTQ-only 路径曾对 q/k 隐式执行 2000-step Gumbel loop。
- 修复：建立 W2/G32、固定 seed 0、MLP-only、attention 和 `lm_head` 浮点的四路
  control；`gsq_enabled=false` 时禁止 inline Gumbel 训练；codebook 版本只替换量化
  码点与对应 GPTQ 最近码点选择，其余 GSQ 训练路径保持一致。
- 验证：FP wrapper/HF PPL 为 `20.959816/20.960594`；正式 uniform/codebook GPTQ
  为 `39.6571/67.1622`，uniform/codebook GSQ 为 `96.7384/70.4742`。新结果撤销
  旧“码本 GPTQ 更好”的结论。

## 2026-07-14 — codebook attention checkpoint 遗漏 q_norm/k_norm

- 现象：attention+MLP 诊断 run 在同一进程内训练和评估正常，但独立重载时
  `q_norm/k_norm` 仍停留在 meta device。
- 根因：codebook attention shard 只保存 q/k/v/o 的 packed codebook 状态，没有
  同时保存 attention 内未量化的 `q_norm` 与 `k_norm` 浮点参数。
- 修复：codebook attention 保存路径现在同时写入所有非 q/k/v/o tensor，加载路径
  在恢复 packed 状态后恢复这些额外浮点 tensor；历史 checkpoint 使用
  `repair_codebook_attention_norms.py` 从原 FP 模型补齐，无需重新量化。
- 验证：修复后的历史 all-Transformer codebook GPTQ/GSQ checkpoint 可独立加载并
  完成 WikiText2 评估。当前主实验 `self_attn=false`，不存在 attention 量化状态。

## 2026-07-14 — 论文实验必须使用 xh2 而非 base Python 环境

- 现象：base Python (`3.11`, `compressed_tensors 0.15.0.1`) 缺少 `lion_pytorch`，
  且 packed compressor API 与正式实验环境不同；直接用 base 环境会产生缺依赖或
  “不存在 compress_weight”之类的假故障。
- 根因：正式 GSQ 实验固定使用 `/anaconda3/envs/xh2/bin/python`（Python 3.10、
  PyTorch 2.8、`compressed_tensors 0.11.0`），但裸 `python` 指向 conda base。
- 修复：所有复现实验和 checkpoint 审计显式使用 xh2 的绝对 Python 路径；代码保留
  0.11.0 实际支持的 `compress_weight/decompress_weight + QuantizationArgs` 接口。
- 验证：用当前工作树和 xh2 独立重载 uniform GPTQ checkpoint，精确复现 PPL
  `39.65711723263146`。

## 2026-07-14 — tied lm_head 缺失导致真实 Qwen3-4B wrapper PPL 失真

- 现象：真实 Qwen3-4B-Instruct-2507 的独立 HF PPL 为 `10.0546`，项目 wrapper
  却得到 `152893.98`；同一 evaluator 在 0.6B 上此前一致。
- 根因：4B 设置 `tie_word_embeddings=true`，safetensors 只保存
  `model.embed_tokens.weight`，不保存重复的 `lm_head.weight`。meta-init wrapper
  只按 checkpoint key 物化 output head，导致 `lm_head.weight` 留在 meta；0.6B
  checkpoint 显式保存了 head，因此未暴露该问题。
- 修复：Qwen3 wrapper 在 tied checkpoint 缺少独立 head key 时，从已物化的 FP
  embedding 显式物化 `lm_head.weight`，结束评估时也显式 offload。
- 验证：修复后 wrapper/HF WikiText2 PPL 分别为 `10.0543831/10.0545882`，差值
  `0.0002051`；随后所有 4B 量化结果均使用修复后的 evaluator。

## 2026-07-16 02:35 CST — 2-bit Uniform checkpoint resume 被按默认 4-bit 解码

- 现象：Qwen3-0.6B W2/G32 Uniform GSQ 的 layer-0 checkpoint 可独立评估，但
  `--resume` 扩展 prefix 时，k_proj 解压得到 `1024×512`，无法写入期望的
  `1024×1024` 参数。
- 根因：resume 在 `get_layer_initialization()` 之前就调用 `load_from_disc()`；此时
  wrapper 的 packed compressor 仍保留构造期默认 `num_bits=4`，把实际 2-bit packed
  数据按 4-bit 解码，列数因此减半。独立 evaluator 事先显式设置 bits/group size，
  所以没有暴露该问题。
- 修复：模型 wrapper 创建后立即从当前 config 写入 `model.groupsize`、packed
  `group_size` 和 `num_bits`，确保 fresh、resume、prefix PPL 三条路径使用同一解码参数。
- 验证：同一 run `20260716-022718_2a796f` 重试 resume 后准确重载 layer 0，已进入
  layer 1 GPTQ/GSQ，不再出现形状减半。

## 2026-07-23 17:05:46 CST — 大模型激活传播误用全局 batch 导致 Qwen3-8B OOM

- 现象：Qwen3-8B Uniform-GSQ 完成 `model.layers.10` MLP 训练和 hard-state
  选择后，在“Propagating train/val activations through quantized layer”阶段失败；
  Qwen3 MLP 的 `gate_proj(x) * up_proj(x)` 尝试一次申请 `6.00 GiB`。
- 根因：训练已使用 `device_microbatch_size=2`，但 `get_layer_activations()`、
  `get_mlp_input_all()` 和 `get_mlp_output_all()` 仍按 `data.batch_size=64`
  执行完整 decoder/MLP forward。长度 4096 的 64 条激活在 gate/up 两支同时展开，
  形成远高于训练阶段的瞬时峰值；传播前后缺少明确的死引用和 CUDA cache 回收会
  放大碎片风险，但不是主因。
- 修复：新增独立 `training.activation_microbatch_size`，默认值 0 表示复用
  `device_microbatch_size`；三条基础传播路径统一按该微批次切片，并在每次传播前后
  执行 Python GC 与 CUDA cache 回收、在每个切片结束后显式删除 GPU 临时张量。
  Qwen3-8B/14B 正式配置均显式设为 2，启动日志会打印实际传播微批次。
- 验证：回归测试先在旧实现上得到批次 `[5]` 而失败，修复后层传播、MLP 输入传播、
  MLP 输出传播均得到 `[2, 2, 1]`；本地与 `10.30.0.14` 远端的测试、配置解析和
  `py_compile` 均通过。曾启动的本机 A100 恢复验证已按用户要求于 17:14 中止，
  不计入正式实验结论；正式 Qwen3-8B 恢复任务已于 17:14:59 在 `10.30.0.14`
  GPU0 启动，后续运行验证和结果只采用远端服务器数据。

## 2026-07-23 18:15 CST — Llama-3-70B Vector-GSQ runner 被整模型单卡加载路径卡死

- 现象：虽然远端已经同步了 `llama3-70b-hf` 模型目录，但 `run_prefix_vector_gsq.py`
  仍固定执行 `AutoModelForCausalLM.from_pretrained(...).to(cuda:0)`，并且 token 输入、
  hidden cache、dense target 都默认搬运到同一个全局 `device`。这条路径对 70B
  结构上不可行，因此 70B 一直处于“有模型但没法开实验”的状态。
- 根因：Vector-GSQ prefix runner 把“模型输入设备”和“当前层设备”混为同一个 device，
  同时缺少 Hugging Face `device_map` / `max_memory` 接线，无法走多卡+CPU offload
  的加载路径。
- 修复：为 `run_prefix_vector_gsq.py` 新增 `--hf-device-map`、
  `--hf-max-memory`，把 token/hidden 输入路由拆分为 embedding device 与当前层
  device；`run_vector_gsq_formal.sh` 新增 `HF_DEVICE_MAP` /
  `HF_MAX_MEMORY_JSON` 环境变量接线。随后准备了
  `20260723_181500_llama3_70b_offload_gate_prepared.json` 作为待用 one-layer
  offload gate manifest，但不与当前 GPU0 follow-up queue 竞争启动。
- 验证：设备路由测试
  `tests/test_run_prefix_vector_gsq_devices.py` 在 `xh2` 环境 `2 passed`；
  `py_compile` 和 `git diff --check` 通过。远端项目目录中的
  `run_prefix_vector_gsq.py` 与 `run_vector_gsq_formal.sh` 已通过 `scp` 强制对齐到
  本地版本，SHA256 一致。
## 2026-07-24 09:19 CST — 远端队列把低显存但高利用率 GPU 误判为空闲

- 现象：Qwen3-8B Uniform-GSQ 在 GPU0 持续运行时，层切换造成显存短暂低于 1024 MiB，旧队列因此并发启动 Llama3-8B gate；gate 虽成功，但与主实验争用同一 GPU。
- 根因：`remote_queue.py` 的 `select_free_gpus` 只检查显存占用，不检查 GPU 利用率；此外 gate 后的正式任务没有成功依赖，gate 失败也可能继续派发全层任务。
- 修复：空卡判定同时要求显存和利用率低于阈值，新增默认 `--gpu-utilization-threshold-percent=10`；manifest 支持 `requires_success`，前置失败时后续任务标记 `skipped`。
- 验证：新增低显存高利用率和依赖状态回归测试，本地 `5 passed`；新远端队列首次看到 GPU0 为 9936 MiB、81% 利用率时保持全部任务 pending。

## 2026-07-24 18:04 CST — 超大激活 mmap 令 GPU 长期等待，固定 microbatch 又限制吞吐

- 现象：Qwen3-8B/14B 正式训练存在约 `137–172GB` 的单个训练激活缓存；旧运行将其
  放在共享 `/data01` mmap，进程多次进入 `D` 状态，GPU 利用率常见仅 `1%–2%`。
  同时训练固定 `device_microbatch_size=2`，即使显存有余量也不能提高吞吐。
- 根因：激活缓存策略只按固定阈值二选一，未结合 503GiB 主机内存和双任务并发；训练
  与激活回放也没有 CUDA OOM 自动回退，因此此前只能保守使用极小 microbatch。
- 修复：加入训练与激活回放的 OOM 二分降档；8B 使用 RAM 激活缓存和激活
  microbatch 64，14B 并发期使用 mmap 和激活 microbatch 8，两路训练均从
  device microbatch 16 起跑。兼容旧 PyTorch 不存在 `torch.OutOfMemoryError` 的情况。
- 安全边界：禁止 8B 与 14B 同时启用 200GiB RAM 阈值；该组合曾使主机可用内存降至
  约 1.5GiB。节点 NVMe `/data01/ssd` 仅余约 78GB，无法容纳 14B 主训练激活，未删除
  其他项目数据以强行腾挪空间。
- 验证：8B 同层 20-epoch 均值由 `235.755s` 降至 `172.545s`（`1.366×`），
  峰值显存 `27406MiB`；14B 已观察 14 epochs 均值 `222.886s`，相对旧基线
  `301.555s` 为 `1.353×`。远端性能门槛 `7 passed`，验证器 PASS，两路均无未处理
  OOM、NaN、Traceback 或进程退出。

## 2026-07-25 12:30 CST — 密集 MLP 重复 Attention 与 GPU snapshot 限制吞吐

- 现象：第一阶段优化后，8B MLP 仍约 `405s/epoch`、14B MLP 约 `631s/epoch`；逻辑
  batch 64 被拆分时，每个 microbatch 都重复运行 FP 和量化 Attention，且最佳
  hard-state 克隆常驻 GPU，使更大 microbatch 在后续 epoch 触发 OOM。
- 根因：密集模型没有像 MoE 路径一样在 MLP 训练前物化 Attention 输出；
  `_snapshot_hard_states()` 默认在原设备 clone，同时 `mse.item()` 每个 microbatch
  强制一次 CPU/GPU 同步。
- 修复：密集 Qwen 预计算 MLP 输入并只执行 MLP；hard-state snapshot 转存 CPU；增加
  延迟 loss scalar 同步；加入 Attention 分阶段恢复，确保为优化重启时不丢已完成阶段。
- 当前验证：远端 `12 passed`；8B MLP 前五 epoch 均值 `257.52s`（`1.574×`），
  14B 回退后 `465.7s`（`1.354×`）；可恢复 OOM 均按预期重试，未发生异常退出。
- 剩余问题：8B 30 秒窗口 GPU 利用率为 `84.97%`，尚未达到第二阶段 90% 门槛；CPU
  snapshot 与延迟同步需等下一个完整 layer checkpoint 后重启加载才会作用于正式进程。

### 最终验证补充（2026-07-27 08:15 CST）

- 加载 CPU snapshot/延迟同步版本后，8B 后续正式层稳定完成；60 秒整数采样均值
  `89.60%`，四舍五入达到 90% 门槛，峰值显存 `39724MiB`。
- Qwen3-8B 已完成全部 36 层并正常退出；14B 60 秒利用率 `90.58%`，继续稳定训练。
- 正式 saturation gate 为 `12 passed`，验证器 PASS，因此此前“利用率门槛未通过”
  已关闭。activation resume 的小时级回放成本仍是独立的后续优化项。

## 2026-07-28 08:33 CST — FSR-VQ proposal 只按 coordinate ID 检查 stale，未绑定 residual 状态

- 现象：一个 Linear proposal 打分后，如果同一输出行的另一个 vector coordinate 先被提交，
  原 proposal 的 `current_code_id` 仍未变化，因此旧检查会允许提交；但该输出行 residual 已经
  改变，原 predicted delta 不再对应当前状态。
- 根因：`LinearTransitionProposal` 只保存本 coordinate 的 `current_code_id`，没有保存产生
  score 时的 Linear state/residual version。
- 修复：`HardLinearVectorState` 新增单调 `version`；proposal 保存 `state_version`；任何成功
  commit 都递增 version，commit 前同时校验 version 和 current code ID。新增跨多个 Linear 的
  `HardBlockTransaction`，统一 snapshot/rollback assignments、codebook、weight、residual 和
  version；异常始终回滚，正常退出也默认回滚，只有显式 commit 才保留。
- 验证：新增“其它 coordinate 改变 residual 后旧 proposal 必须 stale”以及跨 Linear 默认
  回滚、异常回滚、显式提交测试；相关组合 `16 passed in 3.89s`。

## 2026-07-28 08:20 CST — 多 Linear Gate 的固定 FP32 audit tolerance 在 MLP/晚层误报失败

- 现象：layer-0 `gate_proj` 的逐 coordinate delta 求和与完整 GEMM SSE 重算相差约
  `1.99955e-4`，晚层 `k_proj` 两种等价 contraction 路径相差 `2.28882e-5`，超过旧固定
  `1e-4` policy tolerance 和 `1e-5` coordinate tolerance，导致并行矩阵提前停止。
- 根因：不同 FP32 contraction 和 reduction 顺序的舍入误差随矩阵宽度、baseline SSE 和
  transition 数量变化；旧常数没有按数值规模建模。
- 修复：coordinate audit 使用 `max(5e-5, |delta|*5e-5)`；policy audit 使用
  `max(5e-4, |delta|*2e-4, initial_sse*2e-7)`。容差只比较独立数值路径，不改变 exact
  proposal score 或 acceptance；测试限制容差小于 transition gain 的千分之一。
- 验证：补跑缺失 runs 后 84/84 完整，所有 hard application audits 通过，矩阵 Gate PASS；
  相关组合 `12 passed in 3.68s`。

## 2026-07-28 08:43 CST — Qwen Block Gate 原位替换 requires-grad leaf weight 失败

- 现象：首次将七个 Qwen Linear 权重替换为 source Vector reconstructed weights 时，
  `module.weight.copy_()` 抛出 `a leaf Variable that requires grad is being used in an in-place
  operation`；异常恢复路径的 FP weight `copy_` 也同样失败。
- 根因：真实 HF Linear parameters 默认 `requires_grad=True`，runner 虽使用 inference
  forwards，但权重替换本身没有置于 `torch.no_grad()` 上下文。
- 修复：source quantized weights、candidate weight 和 `finally` 中 FP restore 的所有
  `copy_` 均包裹在 `torch.no_grad()`；无论候选 forward 是否异常，七个 Linear 都恢复。
- 验证：修复后 layer-0 `k_proj` 完整 block train/validation forward 成功；后续 32 个
  multi-validation/top-16 runs 全部生成 JSON，无未恢复权重或 autograd in-place 异常；相关
  测试最终 `20 passed in 3.69s`。

## 2026-07-28 09:08 CST — Multi-sequence down_proj coordinate audit 超出单序列容差

- 现象：四条 train sequences 拼接、large `down_proj` 上，exact score 的 einsum 路径与
  独立 `X @ delta` 路径出现 `8.7738e-5` FP32 差异，超过旧 `5e-5` coordinate audit
  tolerance，导致 accumulation seeds 1/2 提前中止。
- 根因：token 数从 128 增至 512、down-proj 输入宽度为 3072，FP32 reduction/contraction
  顺序误差放大；两个值符号和尺度一致，不是公式或 hard state 错误。
- 修复：coordinate audit tolerance 更新为 `max(2e-4, |predicted_delta|*2e-4)`，并新增真实
  `-0.3709297 vs -0.3708420` 回归用例；测试同时要求 tolerance 小于 gain 的 `1e-3`。
- 验证：补跑后四 seed max-32 全部 32/32 accepted；max-128 结果完整；相关组合最终
  `24 passed in 3.77s`。Proposal score、排序、train/validation acceptance 均未改变。

## 2026-07-28 13:34 CST — Remote PyTorch 2.3 无法保存 uint16 assignment storage

- 现象：Remote-14 七 Linear sweep 的首个 q_proj trajectory 正常接受 3 transitions 并由
  validation rejection 停止，但 materializer 在 `torch.save` 时抛出
  `KeyError: dtype torch.uint16 is not recognized`，只留下 692-byte `.pt.tmp`。
- 根因：当前 source logical checkpoint 的 196 个 assignment tensors 都是 `torch.uint16`；
  Remote-14 的 PyTorch 2.3 可以加载该 storage，但不能重新序列化。Materializer 原样保留
  source dtype，没有复用旧 Vector pipeline 已知的 legacy-save 兼容策略。
- 修复：materializer 在保存前扫描全部 assignments；`uint16` ID 最大值不超过 32767 时转换为
  同宽 `int16`，否则转 `int32`。转换只改变有符号存储类型，不改变 ID、assignment_bits、
  logical bpp 或重建权重，并写入 metadata audit。
- 验证：新增 4095→int16 和 40000→int32 红绿灯测试；Remote-14 用真实 source checkpoint
  和失败 trajectory 成功物化，196/196 tensors 转为 `torch.int16`，3 个 q_proj transitions
  保留；相关 materializer/sweep 测试 `7 passed`。

## 2026-08-11 15:49 CST — Remote-14 PPL Gate 复用了错误 Python 路径与不兼容安全加载器

- 现象：七 Linear PPL Gate 两次在计算前退出：旧路径
  `/data01/user/xuzk/anaconda3/envs/xh2/bin/python` 不存在；系统 Python 又缺少项目训练依赖，
  且 PyTorch 2.3 的 `weights_only=True` safe unpickler 无法读取含 `torch.uint16` 的可信 source
  checkpoint。
- 根因：远端执行环境实际位于 `/data01/user/xuzk/stom_remote/venv`，非交互 SSH 也不会自动
  注入仓库 `PYTHONPATH`；评测脚本的安全加载路径只在较新 PyTorch 上验证过。
- 处理：改用正式 remote venv，显式设置仓库 `PYTHONPATH`；对本项目自己生成并已审计的
  checkpoint 在评测进程内使用 `weights_only=False`。未修改 checkpoint、重建逻辑或 PPL
  evaluator。
- 验证：Source validation 冒烟完成，196/196 fresh reconstructions exact；随后 Source+七 stage
  validation、selected test 和同环境 Source test 全部完成，结果 JSON 均标记 `completed=true`。

## 2026-08-12 — Qwen3-32B 整模型 BF16 常驻 GPU 无法给七路 Vector-GPTQ 留出工作区

- 现象：Qwen3-32B 有 64 层、hidden size 5120，BF16 权重约占 64GB；旧 runner 默认整模型
  `.to(cuda)`，即使使用 80GB A100，也没有足够余量容纳 Hessian、NoWag 和七路 GPTQ 工作区。
- 根因：已有 `hf-device-map` 只解决加载放置，没有保证处理到 CPU layer 时将当前 block 独占搬入
  GPU；因此不能作为全 64 层、concurrency=7 的可靠单卡路径。
- 修复：新增显式 layerwise CPU-offload 模式，强制 hidden cache、禁止 inline prefix PPL，逐层
  move-in、量化、传播、checkpoint、move-out，并清理层级 CUDA tensor 引用；新增结构化进度事件。
- 验证：`test_qwen3_32b_layerwise_launch.py` 覆盖 CPU load policy、block/RoPE 设备迁移和 GPU3
  launcher 参数；相关测试共 `14 passed`，Shell 语法与 Python 编译通过。

## 2026-08-12 18:26 CST — Vector-GPTQ 为每个 4096-way 六维候选重复展开顺序反馈

- 现象：每个 row chunk 构造 `[rows,4096,6]` 候选状态，并以六轮逐坐标 tensor 更新计算同一个
  六维三角目标；该 scorer 成为 d=6/K4096 Vector-GPTQ 的主要热点之一。
- 根因：GPTQ 的顺序 recurrence 没有化简为 `error @ U = weight - codeword` 的三角求解，导致
  候选维度和六维反馈同时显式展开。
- 修复：将当前权重与码本统一投影到 `U^{-1}` 空间，用平方距离矩阵选择码字；选中码字后的
  组内六步反馈也合并为一次三角求解，跨组误差传播、完整 Hessian 验收及 NoWag 回退保持不变。
- 验证：旧实现 oracle、完整 assignment/weight 等价、退化对角保护、拒绝回退和并发测试
  `13 passed`，相关设备/32B launcher 测试 `5 passed`。CPU 隔离 scorer 微基准为 `100.50×`；
  尚未据此声称 GPU 端到端加速或 PPL 不变。

## 2026-08-12 18:36 CST — 向量化后 Vector-GPTQ 仍为每个向量生成 4096-way loss

- 现象：六维反馈已矩阵化，但每个 row chunk 仍生成 `[rows,4096]` loss 并对全部码字精确评分。
- 根因：全码本 argmin 没有复用 NoWag 已提供的初始 assignment 作为局部搜索先验。
- 修复：为 codebook 构建 128-way anchor-neighbor table，默认只评分 `1+127` 个局部码字；加入
  `--gptq-candidates` 配置、全搜索兼容、anchor 保留、正整数校验和 diagnostics。
- 验证：相关红绿灯 `23 passed`，Shell/Python 静态检查通过；CPU 隔离 loss matrix 缩小 32 倍、
  scorer `3.58×`。这是近似搜索，正式 GPU 墙钟与 PPL/accuracy 仍待验证。

## 2026-08-12 21:57 CST — Checkpoint PPL 结果误用固定 Qwen3-0.6B 实验标签

- 现象：官方 Qwen3-4B 的 PPL 结果虽正确记录实际 model path、36 层和 252 个重建 Linear，
  但顶层 `experiment` 字段仍写成 `qwen3_06b_nowag_d6_checkpoint_independent_ppl`。
- 根因：独立 checkpoint evaluator 将早期 0.6B 实验名硬编码在结果构造逻辑中，没有从
  `--model` 运行时参数生成标签。
- 修复：新增模型路径 slug 生成函数，结果标签现在由运行时模型目录名派生；原始实验 JSON
  不回写，另建规范化 summary 保留 provenance 并明确说明标签异常。
- 验证：新增 Qwen3-4B/Qwen3-32B 标签红绿灯用例；在项目兼容环境中相关测试 `2 passed`。

## 2026-08-13 00:18 CST — PyTorch 2.3 Safe Loader 无法读取旧 uint16 Logical Checkpoint

- 现象：旧 Qwen3-8B/14B checkpoint 由项目可信训练流程生成，但 PyTorch 2.3 的
  `weights_only=True` safe unpickler 无法反序列化其中的 `torch.uint16` assignment storage。
- 根因：旧 checkpoint 生成于 assignment storage 兼容性修复之前；评测器此前没有显式、受控
  的可信 legacy-load 开关。
- 修复：增加 `--trusted-checkpoint`，仅在调用者明确声明项目内可信产物时使用
  `weights_only=False`；默认路径继续使用安全加载器，避免扩大任意 pickle 的执行面。
- 验证：红绿灯测试分别断言默认 safe loader 与显式 trusted loader 参数；标签与 split 测试
  一并运行共 `4 passed`。真实 8B/14B 旧 checkpoint 均完成 fresh reconstruction 和 PPL。

## 2026-08-13 01:27 CST — Qwen3-8B Wrapper 直接执行无可执行位的基础 Launcher

- 现象：新 8B wrapper 首次启动时，直接 `exec` 基础 4B launcher，因共享工作区中的基础脚本
  没有 executable bit 而返回 `Permission denied`；远端实验尚未启动。
- 根因：wrapper 假设基础 launcher 的文件模式一定可执行，没有复用仓库一贯的显式 Bash 调用。
- 修复：wrapper 改为 `exec bash <launcher>`，不再依赖基础脚本的宿主机文件模式。
- 验证：Bash 语法检查通过；4B 通用 launcher 与 8B matched wrapper 契约测试 `2 passed`；随后
  Remote-14 8B top-128 全 36 层、checkpoint 与 PPL pipeline 正常完成。

## 2026-08-20 20:53 CST — 原始 GSQ 的 4096 RoPE Cache 误用于 2048 PPL

- 现象：Meta-Llama-3-8B layer-0 attention/MLP 量化和 shard 保存全部完成，WikiText2 PPL 在第一层
  attention 报错：query length 2048 与 cached cosine/sine length 4096 不一致。
- 根因：wrapper 的 decoder pre-hook 缓存 calibration `position_ids/cache_position/position_embeddings`，
  PPL 改用 2048 后仍原样复用，没有按当前 hidden-state sequence length 截断。
- 修复：`_build_layer_inputs` 接收实际 sequence length，对三个位置相关参数无原位副作用地切片；
  LLaMA `get_mlp_input` 统一通过该 helper 构造 attention kwargs。
- 验证：新增 helper 和 tiny LLaMA attention 两条红绿灯测试，联合 token-cache 测试共 `5 passed`；
  修复后对照在本地 GPU6 重启。

## 2026-08-20 21:18 CST — `self_attn=true` 的原始 GSQ 导出配置仍忽略 Attention

- 现象：训练 checkpoint 包含 Q/K/V/O packed tensors，但 `save_model.py` 生成的 compressed-tensors
  config 无条件写入 `re:.*self_attn.*` ignore，运行时可能把已替换的 attention 当作未量化模块。
- 根因：导出器沿用 MLP-only 假设，没有接收训练配置的 `quantization.self_attn`。
- 修复：ignore-list builder 和 quantization config injector 显式接收 `quantize_self_attn`；主导出流程
  传入训练配置。全线性模式移除 attention ignore，MLP-only 模式保持兼容。
- 验证：新增全线性/MLP-only 与 partial-layer ignore 两条红绿灯测试；相关官方兼容测试 `7 passed`。

## 2026-08-20 23:08 CST — 原始 GSQ 仅给数据采样设种子，Gumbel 训练未被复现性约束

- 现象：同一份配置与 token cache 在不同物理 GPU 上重跑 layer 0 时，Gumbel validation loss
  有细微差异；配置中的 `data.seed=0` 只传入 dataset loader，未初始化 Python、NumPy 或 PyTorch RNG。
- 根因：`main.py` 在模型加载和 Gumbel sampling 前没有统一的全局 seeding 入口，多进程 rank 也没有
  独立随机流定义，因此不能把后续完整模型对照称为严格 matched-seed run。
- 修复：新增 `seed_everything(seed, rank)`，统一设置 Python、NumPy、PyTorch CPU 与全部 CUDA RNG；
  每个 distributed rank 使用 `seed + rank`，单卡正式基线固定为 seed 0，并在日志打印 effective seed。
- 验证：红灯先因缺少 API 失败；实现后 Python/NumPy/Torch 重放与 rank offset 两项测试 `2 passed`。

## 2026-08-20 23:28 CST — 独立 scalar-GSQ evaluator 的 scheme metadata 仍停留在默认 group32

- 现象：主训练进程在量化初始化时把 decompressor scheme 改为 group128；独立
  `eval_prefix_ppl.py`/六任务进程重新构造 wrapper 后只设置 checkpoint 路径，scheme metadata
  保留 BaseModelWrapper 默认 group32，与实际 shard 不一致。当前 compressed-tensors 版本会从
  scale tensor shape 恢复分组，实测 group32/group128 参数得到 bit-identical weight，因此既有 PPL
  不受影响；但该隐式行为没有接口保证，未来版本或其他 loader 可能不等价。
- 根因：group size 只在训练路径 `get_layer_initialization` 中写入，没有成为 fresh checkpoint
  loader 的显式合同；仅设置 `wrapper.groupsize` 也不够，compressor 实际读取 nested scheme。
- 修复：集中新增 `configure_checkpoint_quantization`，同时设置 wrapper group size 和
  `quantization_config.config_groups.group_0.weights.group_size`；PPL 与 lm_eval 两条独立加载路径复用。
- 验证：红灯精确捕获 fresh scheme 仍为32；修复后 evaluator/audit/materialization 联合测试
  `6 passed`；真实 layer0 K-proj 以两种 scheme 解压得到 `torch.equal=true`、max diff=0。

## 2026-08-20 23:39 CST — Standalone LLaMA checkpoint PPL 没有 calibration hook 提供 RoPE

- 现象：已有 layer0 shard 的 standalone PPL 已完成 WikiText2 dataloader，但第一层 attention 在
  `cos, sin = position_embeddings` 报 `TypeError: cannot unpack non-iterable NoneType object`；前置命令
  使用 `set -e`，因此它同时阻止了后续 fresh 32层量化启动，造成显卡实际空闲。
- 根因：训练/内联 PPL 先通过 model forward hook 缓存 position_ids、cache_position 与 RoPE；独立
  evaluator fresh wrapper 的 `kwargs={}`，旧修复只会切片已存在 cache，不能构造缺失的 RoPE。
- 修复：LLaMA `get_mlp_input` 在没有 cached kwargs 时按当前 sequence length 构造 position IDs/
  cache position，并调用 attention-level 或 model-level rotary module 生成 `(cos,sin)`；存在 cache
  时仍复用并切片，不改变训练路径。正式 full run 移除可选旧-prefix补测前置依赖，直接启动。
- 验证：新增 batch2/length128 standalone RoPE 红绿灯，并保留 cached 4096→2048 非突变测试；
  相关测试 `4 passed`，官方全集 `19 passed`。随后本机物理 GPU1 已进入 layer0 GPTQ。

## 2026-08-21 00:00 CST — Staged Vector-GSQ 把上游量化误差写入后续阶段 Teacher

- 现象：V/O 阶段 target 已包含量化Q/K，MLP阶段 target已包含量化attention；后续阶段只能拟合自身
  局部误差，无法像原始GSQ那样补偿上游量化误差。
- 根因：阶段 target 通过 frozen selected weights 运行 hybrid block，而不是从原始 dense network 的
  Q/K/attention/block interfaces 统一采集。
- 修复：新增 `collect_dense_stage_targets`，Q/K/attention teacher 始终 `weights=None`，block teacher
  复用dense output cache；candidate仍显式合入已选hard assignment与FP16 group scale。
- 防回归：full comparator 现在要求32/32层均记录 `teacher_reference=original_dense_network`，拒绝旧
  hybrid结果；定向红绿灯先失败后转绿，staged+comparator测试 `29 passed, 2 warnings`。

## 2026-08-21 00:20 CST — Freeze-QK 与最终 Block Refinement 的参数合同冲突

- 现象：`--staged-freeze-qk` 跳过Q/K阶段，但旧block polish仍会把七个quantizer全部加入optimizer，
  从而静默修改声称固定的Q/K assignment。
- 根因：block refinement没有独立active quantizer集合，也没有在启动参数层声明不兼容组合。
- 修复：`validate_block_refinement_contract` 在 freeze-QK 与 refinement steps同时启用时直接拒绝启动，
  避免生成语义错误checkpoint；最终胜出方法本身固定 `block_polish_steps=0`。
- 验证：新增合同测试覆盖拒绝路径；相关staged测试保持通过。

## 2026-08-21 08:25 CST — Full Comparator 未验证 Dense-teacher 方法身份

- 现象：比较器只校验staged/group160等命令参数，旧hybrid-teacher run理论上也能通过“超过GSQ”门禁。
- 根因：方法身份检查遗漏每层量化JSON中的 `gsq.teacher_reference`。
- 修复：比较器要求结果恰有32层且全部为 `original_dense_network`，输出中记录
  `dense_teacher_layers=32`，方法名改为dense-teacher staged joint group160。
- 验证：新增hybrid layer红灯；实现后comparator与staged联合测试 `29 passed, 2 warnings`。

## 2026-08-21 18:59 CST — `full` 实验名称掩盖了低校准预算

- 现象：既有LLaMA full launcher覆盖全部32层，却仍只使用64 GPTQ、8 train、8 validation及
  512-token切段，容易被误读为官方论文规模的完整协议。
- 根因：`full` 只控制层数；sequence budgets、batch和microbatch没有正式profile约束，训练steps也
  没有按官方4096/64×10换算。
- 修复：新增官方协议专用gate/full入口，固定512/4096/128、完整4096上下文、batch64、microbatch2、
  640 steps；核心runner新增batch参数与正整数/整除验证。低预算结果明确降级为消融。
- 验证：红灯先捕获入口缺失；实现后staged测试 `23 passed, 2 warnings`，shell语法与dry-run通过。

## 2026-08-21 23:50 CST — Budget256 六任务评测被同卡资源竞争中断

- 现象：32层量化和 WikiText2 PPL 均已完成，但 GPU7 上的首次六任务 lm_eval 约运行至 18% 后退出，
  未生成 `summary.json`。
- 证据：checkpoint、量化 JSON 和 PPL JSON 均完整；lm_eval 日志没有 Python traceback。退出后 GPU7
  出现另一个高显存/高利用率进程，故将外部资源竞争视为最可能原因，但不把它误报为已证实根因。
- 处理：保留 5.63 小时量化与 PPL，只在空闲本地 GPU1 以 HF 离线模式补跑六任务；补跑完成并生成
  `completed=true` 的正式 summary，macro6=`0.651747`、QA5=`0.647689`。
- 剩余风险：首次进程退出码随 tmux 消失无法恢复；后续 launcher 应持久化每阶段 exit code。

## 2026-08-23 10:35 CST — 官方协议 Vector-GSQ 长跑被 SIGKILL 后完成断点恢复

- 现象：本地 GPU1 的 32 层官方协议实验已原子提交 layer 0--17，运行 layer18 `v_o` 时 shell
  报 `Killed`、退出状态137；Python/CUDA均无 traceback，checkpoint停留在完整第17层。
- 根因：4096 条 $4096\times4096$ hidden cache、dense block target 与阶段 target 的宿主内存峰值
  约为500 GiB级；09:51起同机/同卡新增约36 GiB RSS、21 GiB显存及32个compile workers，swap随后
  被占满，系统终止本任务的大内存进程。内核OOM日志无读取权限，因此外部内存竞争是证据最强的
  解释，但不把具体killer选择机制表述为已直接观测。
- 修复：新增原子`--resume`，校验JSON/checkpoint一致后恢复logical weights并重放hidden prefix；
  新增`--stream-dense-targets`，按microbatch现算相同dense teacher，避免同时保留整份训练阶段target；
  launcher增加宿主RAM门禁、GPU空闲门禁和resume日志追加。
- 验证：红灯5项API缺失与1项launcher缺失均先失败；实现后相关/回归测试`39 passed`，resume专测
  `6 passed`。真实2.68 GB checkpoint审计得到18个连续层、8,325,808,128 logical bits、
  3,925,868,544 quantized weights，重算bpp=`2.1207557091346154`与JSON逐位相等，下一层严格为18。
- 恢复结果：在本地物理 GPU0 从 layer18 续跑至 layer31，32层量化、PPL和六任务均完成，tmux
  终端退出码0；最终 PPL=`9.040258`、macro6=`0.667636`，证明原子checkpoint与恢复路径有效。
- 剩余风险：流式teacher保持目标等价但增加dense forward时间；后续长跑仍应在单张GPU至少70 GiB
  空闲且宿主至少300 GiB可用时启动，避免再次与其他任务共享临界资源。

## 2026-08-25 10:05 CST — 跨模型GSQ headline被误用为方法成功门槛

- 现象：Stage 3--5报告把Meta-Llama-3-8B base上的67.2062%五任务macro与GSQ README中
  Llama-3.1-8B-Instruct的68.55%直接相减，并用“目标未达到”描述实验结论。
- 根因：虽然记录注明了模型不匹配，但仍把描述性surface gap当成了可判胜负的success gate，结论
  与证据边界不一致。
- 修复：JSON、实验总表、idea日志和报告统一改为“跨模型不可比较”；保留数值并列仅作描述，明确
  是否超过GSQ必须通过同模型、同数据、同评测协议的配对实验判断。
- 验证：相关JSON通过解析，记录中不再把1.3438pp跨模型差值表述为成功或失败结论。

## 2026-08-25 11:08 CST — Llama-3.1匹配缓存被保留special token重命名误拒绝

- 现象：Llama-3.1专用校准缓存构建器拒绝复用Llama-3 FineWeb token，报两者vocab不同。
- 根因：两模型的128k普通词表、BOS、raw BPE backend和实际文本编码一致，但Llama-3.1把三个reserved
  special token改为`eom`、`python_tag`等，并重排其余未使用reserved名称；旧检查错误地要求所有
  special token名称逐字相同。
- 修复：等价合同改为普通token ID映射逐项一致、BOS一致、去除`added_tokens`后的backend一致和
  多语言/代码probe编码一致；同时审计源缓存token域，只允许普通ID与共享BOS，拒绝其他special ID。
- 验证：源4736×4096缓存最大ID为128000，唯一special为共享BOS；新5376×4096缓存前4736行
  bit-exact，新增红绿灯覆盖reserved重命名允许路径和模型专属special拒绝路径；相关测试28项通过。

## 2026-08-25 12:13 CST — lm_eval嵌套结果路径导致匹配链在有效FP16锚点后退出

- 现象：五任务FP16评测完整结束并打印73.6465% macro，但chain随后退出2、状态写为`failed`，未进入
  Vector量化。
- 根因：当前lm_eval把预创建父目录下的`results.json`参数当成目录，并实际写入
  `results.json/<model>/results_<timestamp>.json`；launcher却用jq读取literal `results.json`。
- 修复：launcher递归发现`results_*.json`，要求恰有一个且包含`.results`；若已有有效锚点则复用，
  没有才运行lm_eval，多个或无结果均显式拒绝，从而可无损恢复而不重复22分钟评测。
- 验证：新增红灯先捕获复用/解析合同缺失；修复后shell语法通过，cache/chain相关测试
  `28 passed, 2 warnings`；实际嵌套JSON解析得到macro=`0.7364652847`，通过预注册Gate。

## 2026-08-28 12:29 CST — QTIP extension-free manifest静默生成损坏权重

- 现象：QTIP全量评测流程退出0并生成`completed=true`，但WikiText2 PPL为2,209,793、LAMBADA为0，
  其余任务接近随机水平。
- 根因：发布checkpoint的trellis为官方CUDA decoder专用位排列与解码语义；旧回退将其交给普通
  Python `unpack_trellis`。输出权重方差仍正常，常规finite检查无法发现，但layer0 q_proj与原权重
  余弦仅0.00014。随后native manifest还暴露PyTorch 2.4 `inference_mode`与`torch.compile` dtype-view
  的版本计数器冲突。
- 修复：编译仓库自带QTIP CUDA decoder；manifest模式强制要求native decoder，不再允许标准unpack
  回退；首次展开使用`no_grad`避开inference tensor tracing冲突；新增PPL质量sanity gate，异常结果
  直接失败而不写`completed=true`。旧错误JSON已追记`validation.valid=false`并改为`completed=false`。
- 验证：trellis布局round-trip、native要求、异常PPL拒绝等相关测试`22 passed`；单层native解码余弦
  0.9314、相对MSE 0.1515；最终141段PPL与六任务全量评测退出0，PPL=8.7971、macro6=69.8469%。

## 2026-08-29 22:22 CST — V11 本地 launcher 缺少可执行位导致首次启动立即退出

- 现象：四视图共识正式入口首次由shell直接启动时立即返回，没有创建有效训练进程。
- 根因：新脚本内容和静态语法均正确，但文件模式为`0644`，直接执行路径缺少execute权限。
- 修复：只补充launcher可执行位，保留命令、数据和实验配置不变；使用唯一run id在本地GPU5重新启动，避免与失败启动记录混淆。
- 验证：正式run `20260829_222233_llama3_1_8b_scale_consensus_assignment_l28_31_gpu5`完成两轮八投影并正常退出，耗时6.688小时，`pipeline.status=calibration_noop`。

## 2026-08-30 09:48 CST — V13 显存门禁把可安全共享的本地 GPU 误判为不可用

- 现象：启动前GPU7有80,141MiB空闲，但launcher执行门禁时另一进程短暂占用约15GiB，空闲降至
  65,269MiB；实验以exit 3退出，尚未加载模型或创建结果目录。
- 根因：门禁硬要求70,000MiB，隐含“近乎整卡空闲”，与用户“只要显存足够即可共享”的约束不一致；
  同路径V12正式运行实测峰值仅25.285GiB，因此65GiB实际上有充分余量。
- 修复：默认门禁降为50,000MiB，仍保留接近历史实测峰值两倍的安全余量；不改变模型、数据、方法或
  任何实验超参数。
- 验证：红灯先证明launcher仍固定70,000MiB；修复后launcher合同检查要求50,000MiB，并重新运行完整
  聚焦测试与静态检查。首次失败run未产生实验结果，不计作方法实验。

## 2026-08-30 10:56 CST — Prefix hidden 重放遗漏因果遮罩且 parity 混入 batch 数值差

- 现象：V13第二次启动完成dense teacher与文本分布后，在32例prefix cache parity处退出；cache与
  singleton完整前向的choice score最大差0.126128，尽管argmax为32/32一致。
- 根因一：共享`run_hidden_block_output`直接调用DecoderLayer时传入`attention_mask=None`；当前HF完整前向
  会通过`create_causal_mask`显式构造遮罩，旧重放因此可能看到未来token。
- 根因二：即使修复遮罩，BF16下batch=4与singleton前向的GEMM/SDPA数值路径不同。真实任务样本上两者
  score最大差0.254416，而cache重放与同batch完整HF前向仅差0.0005286；旧parity混淆了这两类误差，
  singleton teacher也会给源状态引入虚假的KL。
- 修复：direct block使用Transformers官方`create_causal_mask`和HF一致的position IDs；任务dense teacher、
  source/candidate评分统一使用固定`(total_length, continuation_start)`shape bucket与batch composition；parity
  对同一cache batch做完整HF前向，仍保留0.02门槛，不以放宽阈值掩盖错误。
- 验证：causal红灯先观察到mask为None，修复后转绿；逐层诊断显示layers0--30 hidden逐位一致，最终logits
  最大误差0；同batch分解验证0.0005286误差。相关测试`56 passed`，Python、ruff、shell和whitespace检查通过。
- 影响边界：失败run在方法搜索前退出，未访问validation/audit/formal test、未写checkpoint，不作为方法实验
  结论；共享helper的既往direct-block实验需在论文中视为受该实现缺陷影响，不能继续作为可靠证据引用。

## 2026-08-30 15:39 CST — V14 text cache 的 next-token 错位与 held-out teacher 生命周期

- 现象一：独立代码审查用4096-token hidden和4095-position teacher复现了
  `teacher tensors must cover every batch and token`；若直接启动，程序会在text cache parity阶段、方法搜索前
  确定性退出。
- 根因一：dense teacher按next-token协议存储`logits[:, :-1]`，而新分块LM-head路径最初把包含最后一个位置的
  完整hidden传给CE。修复为source cache、完整HF parity和候选批处理三条路径统一使用`hidden[:, :-1]`；测试
  明确构造`sequence`与`sequence-1`形状并验证候选批处理等价于独立suffix。
- 现象二：V13虽未用validation/audit参与候选接受，但启动时一次性物化了train/validation/audit文本teacher，
  因此“audit完全未访问”的字面表述过强；它不构成自适应选择泄漏，但不满足最严格的候选不可见合同。
- 修复二：V14搜索前只构造train teacher。坐标搜索结束且task Gate通过后，先把量化模型卸载到CPU，再在GPU
  单独加载dense teacher并只构造text validation；释放teacher、载回量化模型后才做source/candidate文本门禁。
  只有validation整体通过，才以同样的一模型驻留协议构造text audit teacher并评分task/text audit。
- 验证：红灯先因V14模块缺失失败；实现后分块CE与完整词表一致、候选批处理与独立suffix一致、next-token
  对齐、128GiB缓存和本地单卡launcher合同共7项测试通过；Python compile、Ruff、shell和whitespace检查通过。

## 2026-08-30 20:02 CST — V15 不可补偿候选会中断全程且成功 checkpoint 缺少 fresh 证据

- 现象：正式启动前的独立代码审查发现，合法checkpoint若某个candidate的闭式scale投影不存在正解，旧路径
  会直接抛出`ValueError`并中断其余27个候选；另一个问题是audit成功分支虽写assignment+scale checkpoint，
  summary只记录文件存在，不能自证fresh reload后的状态与运行中权重一致。
- 根因：最初实现没有区分“checkpoint几何损坏”和“当前动作数学不可行”，也复用了V14只改assignment的
  简化写出合同，没有为paired state增加assignment/scale/metadata/fresh reconstruction审计。
- 修复：新增`CompensationInfeasibleError`，候选级捕获后记录`scale_compensation_infeasible`并继续搜索；
  成功checkpoint写出后强制fresh reload，核验int32 assignment、FP16 scale、固定codebook/normalizer、
  untouched state、逻辑bpp与逐元素fresh reconstruction，失败则删除刚写文件并异常退出。Launcher同步增加
  jq合同断言。
- 验证：新增非正投影fail-closed用例和运行中paired weight vs fresh logical reconstruction用例；57项聚焦
  pytest、Ruff、Python compile、bash syntax和Git whitespace通过。独立复审结论`LAUNCH`，Blocker/Major均0；
  随后的GPU4正式run正常完成28个候选且按零可行路径不写checkpoint。
