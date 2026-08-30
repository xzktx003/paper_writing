# Llama-3.1-8B Hard-first 局部 Scale 补偿正式实验报告

时间：2026-08-31 00:39（Asia/Shanghai）

## 1. 实验目的

V14 在同一 2-bit block-scaled shared-codebook VQ 硬锚点上发现：28 个固定 assignment bundle 中有
27 个改善 task-train objective，但这些动作在完整 text-train exact CE 上全部退化，零退化可行集为空。
本实验检验一个方法级解释：失败是否主要来自 assignment 改变局部码字方向后缺少幅值补偿自由度。

V15 不更换 scorer、候选、bundle 大小、seed、group size 或接受阈值，而把一次动作定义成：

1. 先提交真实 top-128 hard assignment bundle；
2. 只对这些切换触及的 row/input group 重算既有 FP16 group scale；
3. 在最终硬状态上重新测量 task loss 与完整 text-train CE；
4. 只有 text CE 不增且 task loss 下降，动作才进入状态。

核心可证伪问题是：这个扩展后的局部动作空间能否把 V14 的 `0 feasible` 变为非空。

## 2. 实验原理

对一个受影响 group，记 incumbent assignment 重建的归一化向量为 $q^0$，hard switch 后为 $q^1$，
原始 group scale 为 $s^0$，column normalizer 的平方为 $w_j$。V15 在最终离散状态上求一维加权
最小二乘投影：

\[
s^\star=s^0\frac{\sum_j w_jq_j^1q_j^0}{\sum_j w_j(q_j^1)^2}.
\]

投影结果立即舍入到部署 checkpoint 使用的 FP16。该闭式动作没有 optimizer、learning rate、epoch、
regularization coefficient 或 validation-selected knob。没有 assignment switch 时，闭式解退化为
$s^\star=s^0$，因此 scale-only control 在该局部保持目标下严格是 source identity。

这个方法与 V9 naive joint 的差别是：V9 的 scale 在 soft codeword mixture 上学习，hard projection 后可能
失配；V15 先硬化 assignment，scale 只补偿最终真实离散误差。

## 3. 实验配置

| 项目 | 配置 |
|---|---|
| 模型 | Meta-Llama-3.1-8B-Instruct |
| Source | 已通过独立 audit 的 matched task group-scale hard checkpoint |
| 量化表示 | 约 2.1207557 bpp block-scaled shared-codebook VQ |
| 搜索层 | 28、29、30、31 |
| Linear | 每层 q/k/v/o/gate/up/down，共 28 个坐标 |
| Assignment 动作 | V14 固定 curvature-ranked top-128/Linear |
| Scale 动作 | 仅 touched row/input group 的闭式 FP16 投影 |
| Task train | ARC-C、ARC-E、HellaSwag、PIQA、WinoGrande，各 512，共 2,560 examples |
| Task validation/audit | 各任务 256/31；仅通过前置 Gate 才允许访问 |
| Text train | 4,096 sequences × 4,096 tokens = 16,777,216 tokens |
| Text teacher | Dense teacher top-32；候选 CE 使用 full-vocabulary exact log-sum-exp |
| Text validation/audit | rows 4736--4863 / 5568--5631；仅通过前置 Gate 才允许访问 |
| PPL | WikiText2 test，sequence length 2048；仅 audit 通过后运行 |
| Accuracy | lm_eval：ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande |
| 资源 | 当前本机物理 GPU4，A100-SXM4-80GB，严格单卡 |
| 远端 | 未连接、未使用服务器 `10.30.0.14` |

正式 run：

`experiments/results/local_hard_scale_compensated_gain/20260830_203543_llama3_1_8b_hard_scale_compensated_gain_l28_31_gpu4`

## 4. 实验步骤

1. 加载 dense Llama-3.1-8B teacher 和 source logical checkpoint。
2. 构造五任务 train split 的 batch-matched teacher scores。
3. 构造 4,096 条 text-train dense-teacher top-32 分布。
4. 构造 layer-28 task prefix cache，并用 32 个分层样本对同 batch 完整 HF forward 做 parity。
5. 用四个互斥 view 收集 proposal gradient 与 activation second moment，复现固定 top-128 bundle。
6. 构造 128 GiB layer-28 text prefix cache，并用覆盖首尾的 8 条序列验证 exact CE parity。
7. 对每个 Linear：hard apply assignment，闭式补偿 touched group scale，测量 task-train objective。
8. 对 task-improving paired action 计算完整 4,096×4,096 text-train exact CE。
9. 每层只允许 text CE 不增的候选参与 task-loss 排序；不存在可行候选则保持 incumbent。
10. 搜索全部结束后才允许 validation；本实验因零可行而在该 Gate 前正常终止。

## 5. 基础设施与合同验证

- Task cache：2,560 examples、8,193 choices、353,058 tokens；32/32 argmax 一致，最大 choice-score
  误差 `1.1444092e-5`，低于 `0.02` tolerance。
- Text cache：4,096 examples、16,777,216 tokens、137,438,953,472 bytes；8 个均匀位置的 full-forward
  CE parity 最大/平均误差均为 `0`。
- 程序正常退出，`pipeline.status=hard_scale_compensated_gain_rejected`。
- Raw summary SHA256：`45e05f24b98bb677b10d25af2e06585195e026012aac3e91908b1f08342bd2d2`。
- 耗时 `13,510.7063 s`（`3.7530 h`），GPU peak `27,149,745,152 bytes`（`25.2852 GiB`）。
- Accepted switch 为 0；validation/audit/formal test 未访问；checkpoint 文件不存在。

因此这是方法 Gate 的正式负结果，不是 cache、显存、进程退出或数据加载失败。

## 6. 实验结果

### 6.1 总体结果

| 指标 | 结果 |
|---|---:|
| Paired candidates | 28 |
| Task-improving | 28 / 28 |
| Exact text-feasible | 0 / 28 |
| Accepted bundles / switches | 0 / 0 |
| Touched groups | 2,133 |
| FP16 后真实变化 groups | 2,048 |
| 局部 weighted anchor error | 1.503737 → 1.474448 |
| 局部 weighted error 降幅 | 1.9477% |
| 最大单 group 相对 scale 变化 | 31.4247% |

这里的“局部”指修改支持集只覆盖 touched group，不表示幅度一定小。按 28 个 action 各自的组内最大
相对变化统计，中位数为 5.0238%，nearest-rank p90/p95 为 16.5939%/18.2663%，最大值为 31.4247%。
Raw summary 只持久化每个 action 的最大值，没有保存 2,133 个 group 的逐组变化，因此不能把这些数字
误写为 group-level 分位数；逐组分布是该正式 artifact 的一个复现限制。

每个 paired action 都降低 task-train combined loss；因此 hard-first scale compensation 没有简单抹掉
assignment 的全部任务信号。但 28 个动作的完整 text CE 仍全部高于 source `2.1035536536`，故词典序
可行集仍为空。

### 6.2 每层离零退化最近的动作

| Layer | 坐标 | Task gain | Text CE 相对退化 | 可行 |
|---:|---|---:|---:|---|
| 28 | mlp.down_proj | 0.0009583 | +0.0296650% | 否 |
| 29 | self_attn.o_proj | 0.0014160 | +0.0289287% | 否 |
| 30 | mlp.down_proj | 0.0020233 | +0.0259710% | 否 |
| 31 | mlp.down_proj | 0.0007411 | **+0.0074999%** | 否 |

最大 task gain 来自 layer-30 `mlp.up_proj`：combined loss 下降 `0.0053658`，但 text CE 增加
`0.1593725%`。最小文本代价仍是 layer-31 `mlp.down_proj`，但其 `+0.0074999%` 严格大于预注册的
零退化上界。

### 6.3 与 V14 assignment-only 的同坐标比较

V14 有 27 个 task-improving action 被计算 text CE；同坐标配对比较得到：

| 指标 | 结果 |
|---|---:|
| 可比动作 | 27 |
| 补偿降低 text regression | 26 / 27 |
| 补偿增大 text regression | 1 / 27 |
| 平均变化 | -0.0072663 percentage points |
| 最佳降幅 | layer-28 k_proj：0.252884% → 0.215326% |
| 最接近可行点 | layer-31 down_proj：0.0078526% → 0.0074999% |

这组结果区分了两个结论：

1. 闭式局部 scale 补偿不是完全无效；它几乎一致地缩小 assignment-only 的文本代价，并降低真实局部
   hard-weight 扰动。
2. 它仍不能改变可行性结论；26/27 的连续改善没有使任何一个动作跨过零退化边界。

## 7. 结论

Hard-first 局部幅值补偿能修复一部分离散 assignment 引起的局部重建误差，却不能恢复完整语言分布。
这说明 V14 的冲突不只是“assignment 改了方向但 scale 没跟上”：一个 row/input-group 的单个乘性自由度
只能收缩或放大该组，无法旋转多个码字跳转的残差方向，也无法建模跨 Linear、残差流与深层非线性传播。

因此 V15 没有产生新的 deployable endpoint，也不能声称超过 QTIP、GSQ 或 source。可写的机制结论是：

> 在当前 Llama-3.1-8B 最后四层、固定 top-128 action set 和完整文本零退化合同下，局部乘性 scale repair
> 对 assignment 的语言代价有一致缓解作用，但不足以使任务收益方向进入语言保持可行域。

下一步不应扫描 scale clipping、group size、bundle size、seed 或 text budget。若继续改变动作空间，只剩两条
有方法依据的路线：使用显式 text-restoring 的跨 Linear/低秩方向补偿，或把 assignment 方法诚实定位为
task-adapted VQ，而非通用 PTQ 改善。
