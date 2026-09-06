# 目标模型 Vector-GSQ 正式评测矩阵首轮报告

时间：2026-08-31 15:05--16:05 CST
状态：Qwen3-8B完成；Qwen3-14B在checkpoint完整性门禁退出；其余模型待同目录恢复

## 实验目的

利用已经完成的Vector-GSQ logical checkpoint，在本地单张GPU上补齐Qwen3-4B/8B/14B/32B缺失的正式
PPL和六项零样本准确率。已有PPL不重复运行；LLaMA-2-7B复用已经完成的同协议PPL和六任务结果。

## 实验原理

评测进程加载对应原始HF模型，并从codebook、assignment、row/column norm与可选group scale fresh
reconstruct每层q/k/v/o/gate/up/down七个Linear。只有checkpoint覆盖全部Transformer层、assignment合法、
metadata有限且写回权重逐元素一致，才运行正式任务。该门禁同时防止把阶段checkpoint误当完整模型。

## 实验步骤

1. 固定本地物理GPU1，仅暴露为进程内`cuda:0`；启动前要求至少78,000MiB空闲。
2. 先评测Qwen3-8B top-128完整36层checkpoint的六项全量0-shot任务。
3. 进入Qwen3-14B时重新验证模型身份和logical checkpoint层覆盖。
4. 发现默认同名checkpoint只有5层后立即退出，不继续产生无效准确率。
5. 全盘只读定位真正full-pull副本，并审计其40层/280 Linear覆盖后修复恢复入口。

## 实验配置

| 项目 | 配置 |
|---|---|
| 模型 | Qwen3-8B base，36层 |
| Checkpoint | NoWag-d6 → Vector-GPTQ top-128 → Vector-GSQ |
| Logical bpp | 2.0212720788 |
| GPU | 本地NVIDIA A100-SXM4-80GB，物理GPU1，单卡 |
| PPL协议 | WikiText2 test，seqlength=2048；既有结果13.8444805 |
| 准确率工具 | lm_eval，0-shot，batch1，bootstrap 1000，无limit |
| 任务 | ARC-C、ARC-E、HellaSwag、LAMBADA-OpenAI、PIQA、WinoGrande |

## 实验结果

| 任务/指标 | Qwen3-8B Vector-GSQ |
|---|---:|
| WikiText2 PPL | 13.8444805 |
| ARC-Challenge acc_norm | 51.7918% |
| ARC-Easy acc_norm | 78.1987% |
| HellaSwag acc_norm | 63.4137% |
| LAMBADA acc | 59.3829% |
| PIQA acc_norm | 73.7214% |
| WinoGrande acc | 67.8769% |
| Macro-6 | **65.7309%** |
| 六任务评测时间 | 2302.879秒 |
| 峰值显存 | 17.254GB |

Qwen3-14B首次入口文件为1,104,504,732 bytes，仅覆盖layers 0--4；真正完整文件为
8,836,100,454 bytes，离线审计为layers 0--39、280个Linear。因此首轮退出属于路径/镜像完整性问题，不是
Vector-GSQ质量结论，也没有产生可进入论文表格的14B结果。

## 结论

Qwen3-8B现已同时具备完整量化、WikiText2-2048 PPL和规定六任务全量结果。Qwen3-14B门禁证明评测链路
不会信任历史标签或同名文件；修正为full-pull副本后，从同一结果目录继续14B、32B和4B，不重跑8B。

## 产物

- 完整JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_target_matrix/`
  `20260831_150500_vector_gsq_missing_formal_eval/qwen3_8b/lm_eval/summary.json`
- 原始lm_eval：同目录`lm_eval_results.json`
- 恢复脚本：`code/GSQ_nowag_d1_20260716_015355/experiments/performance/`
  `run_target_vector_gsq_eval_matrix_local.sh`
