# Qwen3-4B QTIP 单卡官方 FP64 Hessian 启动失败报告

生成时间：2026-09-01 00:47:13 CST

## 实验目的

在本机单张 A100 80GB 上，以官方 QTIP 默认的 8192×4096 RedPajama 校准规模生成 Qwen3-4B 输入 Hessian，随后进入逐层 QTIP 量化与评测。

## 实验原理

官方入口先通过 `sample_rp1t_concat` 构造 3355 万 token，再对每层 qkv/o/up/down 四类输入累计 $X^TX$。原始实现用 FP64 中间矩阵累积，最后以 FP32 Hessian 保存。

## 实验步骤

1. 使用 Qwen3-4B 官方本地快照和适配后的独立 decoder layer。
2. 启动 32 个 tokenizer worker 构造 8192×4096 token。
3. 按固定 1 小时周期观察终端；连续 5 小时没有 token 进度、层完成标记或 Hessian 文件。
4. 在第五个检查点合并读取进程/GPU/产物证据，确认停滞后中断自有进程。

## 实验配置

- 模型：Qwen3-4B，36 层。
- GPU：本机物理 GPU1，A100 80GB，仅本实验使用。
- 数据：RedPajama-Data-1T-Sample train，8192 sequences，sequence length 4096。
- Hessian：batch 2、large batch 512、32 tokenizer processes、FP64 accumulation。
- 结果目录：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_target_qtip/20260831_191500_qtip_2bit_formal_matrix`。

## 实验结果

- 运行约 18,606 秒（5小时10分）。
- 最终 GPU1 为 0% 利用率、4MiB 显存；父进程休眠，32 个 tokenizer worker 均未返回。
- Hessian 文件 0 个，checkpoint 0 个，因此没有 PPL 或准确率，不能解释为 QTIP 质量失败。

## 结论与修复

失败点是官方多进程 token 构造在当前主机上的进程池停滞。修复后用单进程 fast tokenizer 一次性生成确定性共享 cache，仍保持 Hessian 8192×4096、layerwise fine-tune 384×4096。由于上游最终本来就把 Hessian 转为 FP32，单卡恢复入口直接使用 FP32/TF32 累计同一 $X^TX$ 统计量，并在所有产物中显式记录精度差异。
