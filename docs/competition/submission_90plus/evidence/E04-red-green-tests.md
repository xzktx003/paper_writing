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

## 主流程验证

- `app/tests/e2e/office-delivery.spec.ts`：真实 Chromium 操作六阶段主流程，并验证缺材料时不形成总建议分。
- `app/apps/backend/src/services/__tests__/officeWorkflowService.test.js`：验证 review/approve 门禁、非法跳转和全成本遥测。
- `app/apps/backend/src/services/__tests__/officeTrackService.test.js`：验证材料审核、特殊上限、负提效、导出和 manifest。
- `app/apps/backend/src/routes/__tests__/officeWorkspace.test.js`：验证导入、检索、证据图、会议、运行和持久化路由。

最终全量结果在提交前写入 `test-evidence.md`，不提前伪造通过数量。
