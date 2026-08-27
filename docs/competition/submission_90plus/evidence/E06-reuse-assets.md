# E06 复用资产核验证明

## 资产存在性

| 资产 | 仓库位置 | 核验方式 | 当前结论 |
| --- | --- | --- | --- |
| 办公写作交付模板 | `app/templates/office-track-writing/` | 干净临时目录创建新项目 | 已存在、可创建 |
| 主文档与 Brief | `main.md`、`brief.md` | 模板项目文件树与录屏 | 已存在 |
| 来源/证据/度量目录 | `sources/`、`evidence/`、`metrics/effect.csv` | 模板目录和状态样本 | 已存在 |
| 复用 SOP | `reuse/SOP.md` | 文件可读、演示项目登记 ready | 已存在 |
| 复用 Skill | `reuse/Skill.md` | 文件可读、演示项目登记 ready | 已存在 |
| 操作者核对表 | 本提交包 `reuse/operator-checklist.md` | 文件可读 | 已存在 |
| 参赛材料生成器 | `app/apps/backend/src/services/officeTrackService.js` | 9/9 服务测试、实际导出 manifest | 已运行 |
| 受控演示生成器 | `app/scripts/competition-office-demo.mjs` | 隔离后端、临时项目、连续录屏 | 已运行 |
| PDF 与完整包清单生成器 | `build-competition-submission-pdf.mjs`、`build-competition-manifest.mjs` | 实际生成 PDF 和逐文件 SHA-256 | 已运行 |

## 技术复用结果

- 演示从新的临时数据目录创建项目，没有复用旧项目状态。
- 仓库内 DOCX 通过内置 OOXML 收件；OfficeCLI 未配置时明确显示 unavailable。
- 模板项目完成收件、处理、审阅、审批、度量、交付，并生成材料 manifest。
- 结束后临时项目被清理，只留下脱敏状态样本、截图和视频。

复现命令与详细边界见 `E10-reuse-dry-run.md`。

## 尚未证明

当前复现操作者是自动化浏览器，不是独立办公用户，因此尚未证明普通目标用户无需作者帮助即可完成任务，也未形成真实培训耗时、跨部门迁移成本或用户反馈。相关结论必须等真实复用演练后再更新。
