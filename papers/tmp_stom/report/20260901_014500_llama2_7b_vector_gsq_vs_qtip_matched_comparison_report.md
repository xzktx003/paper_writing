# LLaMA Vector-GSQ 与 QTIP 同协议对比报告

生成时间：2026-09-01 02:00:00 +0800

## 实验目的

在同一 LLaMA 基座、WikiText2 测试集和六项零样本任务上，比较 Vector-GSQ 与 QTIP 的码率和质量。

## 实验原理

Vector-GSQ 重建项目逻辑 checkpoint 中每层七个 Linear；QTIP 使用其官方 Hugging Face 加载器。先校验基座模型、PPL 序列长度、数据划分和任务集合，再报告有符号差值（Vector-GSQ 减 QTIP）。PPL 越低越好，准确率越高越好。

## 实验步骤

1. 审计 Vector-GSQ 与官方 QTIP checkpoint 的模型身份、量化层覆盖和码率比较门槛。
2. 分别 fresh load 两个 checkpoint，并在 WikiText2 test 上按 2048 序列长度计算 PPL。
3. 使用相同的 `lm_eval` 0-shot 六任务协议执行完整评测，不设置样本上限。
4. 逐任务计算 Vector-GSQ 减 QTIP 的有符号差值，并生成预注册质量判定。

## 实验配置

- 基座模型：`llama2_7b_hf`
- PPL：WikiText2 `test`，sequence length = 2048
- lm-eval：0-shot，任务为 arc_challenge, arc_easy, hellaswag, lambada_openai, piqa, winogrande
- 最大可比码率差：0.100000 bit/weight

## 实验结果

| 指标 | Vector-GSQ | QTIP | Vector-GSQ - QTIP |
|---|---:|---:|---:|
| Effective bit/weight | 2.020614 | 2.000000 | +0.020614 |
| WikiText2 PPL | 7.643916 | 6.286650 | +1.357266 |
| 六任务宏平均准确率 | 0.626426 | 0.662989 | -0.036563 |

码率可比：**True**。质量判定：`qtip_better_on_both_quality_metrics`。

> 码率说明：Vector-GSQ 的 2.020614 为 logical checkpoint 实测值；QTIP 的 2.0 为官方
> checkpoint 的标称 2-bit 配置值。本表的码率差仅 0.020614，满足预注册 0.10 bpp 门槛，
> 但在完成 QTIP 全文件/元数据逻辑码率审计前，不把 2.0 描述成实测 effective bpp。

## 分任务结果

| 任务 | Vector-GSQ | QTIP | Vector-GSQ - QTIP |
|---|---:|---:|---:|
| arc_challenge | 0.374573 | 0.416382 | -0.041809 |
| arc_easy | 0.638889 | 0.696128 | -0.057239 |
| hellaswag | 0.649871 | 0.717586 | -0.067716 |
| lambada_openai | 0.679216 | 0.709878 | -0.030662 |
| piqa | 0.745919 | 0.765506 | -0.019587 |
| winogrande | 0.670087 | 0.672455 | -0.002368 |

## 结论

在当前同模型、近码率和同评测协议下，QTIP 的 PPL、Macro-6 以及六个单项均优于
Vector-GSQ，因此该端点明确判为 `qtip_better_on_both_quality_metrics`。结论仅适用于
LLaMA-2-7B 的这组约 2-bit checkpoint，不跨模型外推。

## 结果来源

- Vector-GSQ PPL：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting/papers/tmp_stom/code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260820_llama_vector_gsq_formal/20260820_015319_llama2_7b_d6_gptqtop128_gsqk8_s400_full32_gpu1_c7/ppl.json`
- Vector-GSQ lm-eval：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting/papers/tmp_stom/code/GSQ_nowag_d1_20260716_015355/experiments/results/remote_10_30_0_14/20260820_llama_vector_gsq_formal/20260820_015319_llama2_7b_d6_gptqtop128_gsqk8_s400_full32_gpu1_c7/lm_eval/summary.json`
- QTIP 汇总：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting/papers/tmp_stom/code/GSQ_nowag_d1_20260716_015355/experiments/results/local_target_qtip/20260901_010000_qtip_2bit_formal_matrix/llama2_7b/eval/summary.json`
