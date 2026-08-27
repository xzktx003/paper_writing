# E10 复用演练记录

## 演练范围

使用 `app/scripts/competition-office-demo.mjs` 从一个新的临时数据目录启动系统，新建 `office-track-writing` 模板项目，导入仓库内 DOCX 样例并完成收件、处理、审阅、审批、度量和交付。

## 结果

- 新项目由模板创建，不复用已有业务状态。
- DOCX 由内置 OOXML 解析器读取并进入 inbox。
- 未配置 OfficeCLI 时明确显示 unavailable，没有伪造 Office 输出。
- 检索、证据图、建议接受、人工审批、全成本字段和 submission 导出全部可操作。
- 运行结束后清理临时项目，保留连续录屏、关键截图和脱敏状态样例。

## 复现命令

```bash
node app/scripts/competition-office-demo.mjs
```

## 边界

本记录证明干净环境下的技术复现和模板可执行性。执行者是自动化浏览器，不是独立办公用户，因此不能替代“普通目标用户按 SOP 独立完成”的真实复用验证。
