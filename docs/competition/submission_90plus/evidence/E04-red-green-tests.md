# E04 红绿灯与工程验证

## 受控实验红绿过程

首次办公赛道受控评估共 9 项检查，结果为 8 通过、1 失败。失败现象是“没有证明稳定提效”被误判为支持“已经证明稳定提效”。

修复步骤：

1. 在 `officeIntelligenceService.test.js` 增加中文否定证明红灯用例。
2. 验证测试失败，关系不是 conflict。
3. 将 no proof/not proven、没有证明/未证明/不能证明及 prove/proof/证明/证实纳入局部否定判断。
4. 单元回归 6/6 通过。
5. 重新运行受控评估，9/9 通过，重复运行 100 次。

原始结构化结果：`experiments/results/office_competition_controlled_evaluation_20260827.json`。

## 第二版参赛演示红绿过程

1. 先在 `competitionDemoEvidenceContract.test.mjs` 和 UI 契约中要求 OfficeCLI `ok`、六阶段 success、每阶段至少两张截图、解析/执行详情 testid 与 `coverage.json`；旧材料缺这些内容，红灯为 3 项失败。
2. 首轮重录在 evidence graph 的 conflict 断言处终止，证明“字幕写了冲突”不能代替真实关系结果。
3. 将受控反证改为共享动作词局部否定“未证明稳定提效”，服务级独立验证 conflict 后完整重录。
4. 视觉验收发现 designed 边界与 94/100 总分滚出视口，改用结果节点取景锚点后再次完整重录。
5. 最终演示契约 5/5 通过；19 张截图、六阶段 success、OfficeCLI `ok / validate` 与媒体参数写入覆盖率和日志。
6. 办公主流程 E2E 随后暴露旧英文断言 `sufficient`，而当前用户界面显示“字段完整”；更新为当前可见语义后桌面与手机 2/2 通过。

结构化结果：`experiments/results/competition_demo_v2_coverage_20260828.json`。

## 主流程验证

- `app/tests/e2e/office-delivery.spec.ts`：真实 Chromium 操作六阶段主流程，并验证缺材料时不形成总建议分。
- `app/apps/backend/src/services/__tests__/officeWorkflowService.test.js`：验证 review/approve 门禁、非法跳转和全成本遥测。
- `app/apps/backend/src/services/__tests__/officeTrackService.test.js`：验证材料审核、特殊上限、负提效、导出和 manifest。
- `app/apps/backend/src/routes/__tests__/officeWorkspace.test.js`：验证导入、检索、证据图、会议、运行和持久化路由。
- `app/tests/competitionDemoEvidenceContract.test.mjs`：验证主演示不存在主要功能失败、六阶段截图数量/大小、OfficeCLI 成功和覆盖率证据。

最终全量结果在提交前写入 `test-evidence.md`，不提前伪造通过数量。
