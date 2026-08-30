# V14：Exact Text-Constrained Conditional Assignment 计算与数据合同

## 1. 方法目标

V13 已证明固定局部 assignment bundle 在当前硬状态下可以产生真实 task-train 条件收益，但 task-only 接受
允许以文本分布退化换取任务损失下降。V14 不调整损失权重，而是改变优化问题：文本保持定义可行域，任务
收益只在可行域内部排序。

对已接受集合 $S$ 和当前层候选 bundle $B$，定义

$$
\Delta_{\rm task}(B\mid S)=
L_{\rm task}^{\rm train}(S)-L_{\rm task}^{\rm train}(S\cup B),
$$

并要求

$$
L_{\rm text}^{\rm train}(S\cup B)\leq L_{\rm text}^{\rm train}(S).
$$

每层只在满足严格正 task gain 与文本不退化的候选中选择 task loss 最低者；无可行候选时该层保持不变。
这是词典序/受约束离散搜索，不是调大 teacher loss 权重。

## 2. 数据隔离

| 数据 | 体量 | 用途 | 搜索期间是否可见 |
|---|---:|---|---:|
| 五任务 train | 每任务512 | 精确条件 task gain | 是 |
| Text train | 4096×4096 tokens | 定义不可交易文本可行域 | 是 |
| 五任务 validation | 每任务256 | 最终 endpoint 门禁 | 否 |
| Text validation | 128×4096 tokens | 最终文本门禁 | 否 |
| 五任务 audit | 每任务31 | validation 通过后的确认 | 否 |
| Text audit | 64×4096 tokens | validation 通过后的确认 | 否 |
| WikiText2/lm_eval test | 全量正式协议 | checkpoint 通过后的报告 | 否 |

Train、validation、audit 的任务文档索引和文本行号均强制互斥。V14 失败后不允许查看 validation 结果并修改
文本阈值重跑；本版文本 train 退化预算固定为零。

## 3. 全量文本计算

V14 不缩小文本校准集，也不使用随机 token sketch。Source 量化状态在 layer 28 输入处缓存完整 BF16 hidden：

$$
4096\times4096\times4096\times2
=137{,}438{,}953{,}472\ \text{bytes}=128\ \text{GiB}.
$$

候选只改变 layers 28--31。每层先从共享 cache 推进到当前层前的 incumbent hidden；每个 task-improving
Linear bundle 只覆盖当前层相应权重，后续层保持 incumbent。候选最终 hidden 沿 batch 维拼接，使一张 GPU
上的 LM-head GEMM 以候选批处理方式运行；这提高矩阵乘利用率并减少调度，但总 FLOPs 仍随候选数线性增长。

为避免物化 `candidate × 4096 tokens × vocabulary` 的完整 logits，LM head 按8192词表块计算。对每个块更新
全词表精确 log-sum-exp，并收集 teacher top-32 位置的期望 logit：

$$
H(p_T,p_B)=\operatorname{LSE}(z_B)-\sum_{j\in\operatorname{topk}(T)}p_T(j)z_B(j).
$$

该计算与一次性完整词表 softmax 的 top-k teacher cross entropy 数学等价，只改变内存布局，不引入近似。

## 4. Parity 与资源门禁

- Task cache：32个跨任务、长度和 continuation 位置的同 batch 完整 HF 前向 parity，沿用0.02 score门禁。
- Text cache：从4096行均匀选择8行并覆盖首尾；使用同 batch 完整 HF transformer 前向和相同分块 LM head，
  最大 CE 误差必须不超过0.001。
- 单卡：launcher只设置一个 `CUDA_VISIBLE_DEVICES`，默认本机物理GPU5。
- 显存：启动前至少50GiB空闲。
- 宿主内存：启动前至少500GiB可用；文本 hidden cache的硬上限为160GiB。
- 不使用服务器14，不执行SSH或远端同步。

搜索前只构造train teacher与cache。坐标搜索完全结束后才评分task validation；task Gate通过时先把量化模型
卸载到CPU，再在GPU上单独加载dense teacher并构造text validation，随后释放teacher、把量化模型载回。
Text audit teacher与task audit评分只在validation整体通过后发生，同样保证GPU任一时刻只驻留一个8B模型。

## 5. 预注册终态

1. 任一 task/text cache parity 失败：基础设施失败，方法搜索不开始。
2. 某层无 text-feasible task-improving bundle：该层保持 incumbent，不放宽约束。
3. 四层结束后零 switch：`text_constraint_infeasible`，不访问 validation/audit。
4. Validation 任一 task/text 门禁失败：`text_constrained_gain_rejected`，不访问 audit、不写 checkpoint。
5. Audit 失败：不写 checkpoint、不运行正式测试。
6. Audit 通过：写硬 assignment checkpoint，随后运行 WikiText2 raw test、sequence length 2048，以及
   ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande 全量0-shot lm_eval。

本版固定 V13 的模型、source、层、邻域、bundle、数据和候选顺序，不扫描 seed、bundle size、阈值、层序、
学习率、group size或训练步数。
