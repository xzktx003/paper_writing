# V15 Hard-first local scale compensation：预注册计算与数据合同

时间：2026-08-30

## 研究问题

V14 在同一 fixed assignment-only action set 中得到 27 个 task-train 改善动作，但完整
4096×4096 text-train exact CE 上 0 个动作满足零退化。V15 不放宽文本约束、不改变 bundle、seed、
group size 或层序，而是改变一次动作的定义：先提交真实 hard assignment bundle，再只重算这些切换
实际触及的已有 FP16 group scale。

## 方法合同

对每个受影响的 row/input-group，记 incumbent 归一化码字重建为 $q^0$，hard assignment 后为
$q^1$，原 group scale 为 $s^0$，column normalizer 产生权重 $w_j=c_j^2$。补偿 scale 是唯一的
一维加权最小二乘投影：

\[
s^\star=s^0\frac{\sum_j w_jq_j^1q_j^0}{\sum_jw_j(q_j^1)^2}.
\]

$s^\star$ 必须先舍入到最终 checkpoint 使用的 FP16，再进行全部 task/text 评分。只有受切换向量覆盖
的 group 允许改变；codebook、row/column normalizer、未触及 scale、未选 assignment 和逻辑 shape
全部冻结。该投影不含学习率、步数、正则强度或 validation 选择超参数。

## 固定实验配置

- 机器：当前本地服务器；禁止连接 `10.30.0.14`。
- GPU：单张物理 GPU 4；`CUDA_VISIBLE_DEVICES=4`，程序内部仅见 `cuda:0`。
- 模型：Meta-Llama-3.1-8B-Instruct。
- source：V8 已审计 matched task group-scale checkpoint。
- 层：28、29、30、31；每层七个 Linear。
- assignment action：复用 V14 curvature-ranked top-128/Linear，不更改候选域。
- task train/validation/audit：每任务 512/256/31；五个内部任务与既有 split offset 完全一致。
- text train：rows 0--4095，共 4096×4096=16,777,216 tokens。
- text validation：rows 4736--4863；text audit：rows 5568--5631。
- text metric：固定 dense teacher top-32 分布的 exact full-vocabulary CE；vocab chunk 8192 只改变内存，
  不改变数学量。
- formal PPL：WikiText2 test，sequence length 2048。
- formal accuracy：lm_eval 的 ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande。

## Gate 与隔离

1. Task/text prefix cache 必须先通过既有 parity 门禁。
2. 每层只给 task-train 严格改善的 paired action 计算完整 text-train CE。
3. 接受顺序保持词典序：`text-train CE <= incumbent`，随后选择 task-train loss 最低者。
4. 搜索结束前不得读取 task/text validation；validation 通过前不得构造 audit teacher。
5. Audit 通过前不得写 deployable checkpoint，也不得运行 PPL/lm_eval。
6. 任一 Gate 失败即写 `hard_scale_compensated_gain_rejected`，保持 checkpoint 不存在。

## 可证伪判据

- 机制成功：V14 的 `0/27 text-feasible` 变为至少一个 paired action 可行，并保留正 task-train gain。
- 部署成功：非零 paired endpoint 同时通过独立 task/text validation 与 audit，随后正式 PPL/lm_eval 不被
  source 严格支配。
- 方法否决：仍为零可行，或补偿恢复文本时任务收益消失。此时停止同一 source 邻域的通用 PTQ assignment
  主路线，不做 scale clipping、bundle、seed、LR 或 group-size 扫描。
