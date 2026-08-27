import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OpenPrism Office delivery workspace contract', () => {
  it('exposes the office delivery workflow from the formal React workspace', async () => {
    const rightPanel = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/RightPanel.tsx'), 'utf8');
    const deliveryPanel = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/OfficeDeliveryPanel.tsx'), 'utf8');

    expect(rightPanel).toContain("'delivery'");
    expect(rightPanel).toContain('OfficeDeliveryPanel');
    expect(rightPanel).toContain('right-panel-delivery-tab');
    expect(deliveryPanel).toContain('data-testid="office-delivery-panel"');
    expect(deliveryPanel).toContain('任务 Brief');
    expect(deliveryPanel).toContain('材料与证据');
    expect(deliveryPanel).toContain('效果与复用');
    expect(deliveryPanel).toContain('审核与导出');
    expect(deliveryPanel).toContain('比赛就绪度仅用于准备，不代表官方评分或获奖结果');
    expect(deliveryPanel).toContain('scoreFormation?.scoreStatus');
    expect(deliveryPanel).toContain('module.reasons');
    expect(deliveryPanel).toContain('module.band');
    expect(deliveryPanel).toContain('module.deductions');
    expect(deliveryPanel).toContain('module.evidenceLocations');
    expect(deliveryPanel).toContain('module.confidence');
    expect(deliveryPanel).toContain('module.analysisPath');
    expect(deliveryPanel).toContain('module.assumptions');
    expect(deliveryPanel).toContain('module.possibleBias');
    expect(deliveryPanel).toContain('styles.deliveryGate');
    expect(deliveryPanel).toContain('disabled={!audit || !confirmed || busy != null}');
    expect(deliveryPanel).toContain("setConfirmed(false);\n    setMessage('');");
  });

  it('uses authenticated managed-project endpoints for load, save, audit, and export', async () => {
    const api = await readFile(join(process.cwd(), 'apps/frontend/src/app/api/officeTrackApi.ts'), 'utf8');

    expect(api).toContain('/office-track');
    expect(api).toContain("'/audit'");
    expect(api).toContain("'/export'");
    expect(api).toContain('getOfficeTrack');
    expect(api).toContain('saveOfficeTrack');
    expect(api).toContain('auditOfficeTrack');
    expect(api).toContain('exportOfficeTrack');
  });

  it('presents the office product identity without erasing research workflows', async () => {
    const projects = await readFile(join(process.cwd(), 'apps/frontend/src/app/ProjectPage.tsx'), 'utf8');
    const landing = await readFile(join(process.cwd(), 'apps/frontend/src/app/LandingPage.tsx'), 'utf8');
    const zhLocale = await readFile(join(process.cwd(), 'apps/frontend/src/i18n/locales/zh-CN.json'), 'utf8');

    expect(projects).toContain('OpenPrism Office');
    expect(projects).toContain('可核验的 AI 办公材料工作台');
    expect(landing).toContain('OpenPrism Office');
    expect(zhLocale).toContain('证据核验');
  });
});
