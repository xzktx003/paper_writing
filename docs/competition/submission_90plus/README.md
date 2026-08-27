# OpenPrism Office 办公赛道提交包

版本日期：2026-08-28

作品名称：OpenPrism Office——可核验的 AI 办公材料工作台

本目录按“智效同行·AI生产力创新挑战赛”办公场景规则组织。目标是让评委在三分钟内看懂作品价值，并能从每个关键结论回到代码、测试、录屏、受控实验或真实业务记录。

## 1. 提交材料导航

| 材料 | 文件 | 状态 | 证据边界 |
| --- | --- | --- | --- |
| M01 作品方案 | `M01-proposal.md` | 已完成 | 产品、代码和测试支持 |
| M02 三分钟演示 | `M02-demo-script.md`、`evidence/demo/office-demo-submission.mp4`（讲解成片）、`office-demo-submission.srt`、`slides/`、`office-demo.mp4`/`office-demo.webm`（原始证据）、`coverage.json` | 已核验：150.424 秒配音成片、8 张 PPT、6 段实操、50 条逐句字幕、73.76 秒原始连续操作、19 张截图 | 中文语音和字幕独立存在；真实操作、OfficeCLI 成功与真实性边界均可回查 |
| M03 复用价值 | `M03-reuse-statement.md` | 已完成 | 模板、SOP、Skill 支持 |
| M04 作品意义 | `M04-significance.md` | 已完成 | 方案与流程支持 |
| M05 效果证明 | `M05-effect-evidence.md` | 受控证据已完成；业务试点待实际使用 | 不把技术测试写成企业提效 |
| M06 标准化资产 | `M06-reuse-assets.md`、`reuse/` | 已完成 | 可定位资产支持 |
| 评委导航 | `reviewer-guide.md` | 已完成 | 逐项证据定位 |
| 初赛评分准备 | `initial-score-guide.md`、`blank-initial-score-sheet.md` | 已完成 | 非官方建议 |
| 决赛准备 | `finals-pack.md`、`finals-score-guide.md` | 已完成 | 现场问答仍由评委评分 |
| 证据总索引 | `evidence/INDEX.md` | 已完成 | E0-E3 分层 |
| 提交核对表 | `submission-checklist.md` | 已完成 | 技术材料、人工签署和业务证据分开核对 |
| 哈希清单 | `submission-manifest.json` | 由脚本在最终导出时生成 | SHA-256 |
| A4 合订本 | `OpenPrism-Office-competition-submission.pdf` | 已生成 | M01-M06、评委说明和初决赛准备 |

## 2. 真实性口径

- **产品事实**：由当前提交 commit、源码、自动化测试和浏览器录屏证明。
- **受控实验事实**：由 `experiments/results/office_competition_controlled_evaluation_20260827.json` 证明，只适用于脱敏样本和规定参数。
- **业务事实**：必须来自真实岗位、真实周期、真实任务和人工确认记录；没有原始记录时保持“待试点”。
- **评分判断**：所有分数均为准备度分析，不是组委会或人工评委正式评分，也不构成 90 分承诺。

## 3. 推荐提交顺序

1. 提交 M01-M06、评委指南、复用资产和哈希清单。
2. 优先将 H.264 `evidence/demo/office-demo-submission.mp4` 作为三分钟内实操演示附件；`office-demo.mp4` 和 `office-demo.webm` 保留为未经剪辑的连续录屏证据。
3. 将关键截图、受控实验摘要和测试证据作为 M05 附件。
4. 若提交前已有真实业务试点，只向 `pilot-measurement-register.csv` 写入可回查的原始记录，并同步更新 M05；不得用演示 fixture 替代。
5. 提交前执行 `reuse/operator-checklist.md` 的脱敏、可播放和哈希核对。

合订本可通过 `npm run competition:pdf` 重建；连续演示可通过 `npm run competition:demo` 重录；`npm run competition:video` 会用原始 MP4 生成 8 张 PPT 讲解页、中文神经语音、逐句 SRT、六段实操解释、150 秒 H.264/AAC 成片及封面；最后运行 `npm run competition:manifest` 重建完整哈希清单。

## 4. 90+ 冲刺逻辑

高分路径不是堆功能，而是形成一条可核验故事：真实高频办公痛点 → 旧流程成本 → 六阶段新流程 → 三分钟实操 → 全成本效果证明 → 人工审批与风险边界 → 可复制资产。当前代码和演示主要支撑创新性、可推广性及流程型提效；提效与场景价值能否进入最高档，最终取决于真实业务记录。
