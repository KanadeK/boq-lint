import { expect, test, type Download, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';

async function summaryCount(page: Page, testId: string): Promise<number> {
  const value = await page.getByTestId(testId).locator('strong').textContent();
  return Number((value ?? '').replaceAll(/[^0-9-]/gu, ''));
}

async function goToMapping(
  page: Page,
  sample: 'valid' | 'issues',
  options: { priced?: boolean } = {},
): Promise<void> {
  await page.goto('/');
  if (options.priced === true) await page.getByTestId('mode-priced').check();
  await page.getByTestId(sample === 'valid' ? 'sample-valid' : 'sample-issues').click();
  await expect(page.getByTestId('file-summary')).toContainText(
    sample === 'valid' ? 'boq-clean-sample.xlsx' : 'boq-risk-sample.xlsx',
    { timeout: 30_000 },
  );
  await page.getByTestId('continue-mapping').click();
  await expect(page.getByTestId('mapping-page')).toBeVisible();
  await expect(page.getByTestId('step-mapping')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('run-check')).toBeEnabled();
}

async function runCheck(page: Page): Promise<void> {
  await page.getByTestId('run-check').click();
  await expect(page.getByTestId('results-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('step-results')).toHaveAttribute('aria-current', 'step');
}

async function openIssueResults(page: Page): Promise<void> {
  await goToMapping(page, 'issues', { priced: true });
  await runCheck(page);
}

async function downloadWith(page: Page, testId: string): Promise<Download> {
  const event = page.waitForEvent('download');
  await page.getByTestId(testId).click();
  return event;
}

function issueRows(page: Page) {
  return page.getByTestId('result-table').locator('tbody tr');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('boq-lint:locale', 'zh-CN'));
});

test('1. 问题样例在本地进入三步流程、列出工作表并仅预览前 10 行', async ({ page }) => {
  const unexpectedRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) ||
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    ) {
      unexpectedRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await goToMapping(page, 'issues', { priced: true });

  await expect(page.getByTestId('stepper').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('step-check')).toHaveCount(0);
  await expect(page.getByTestId('sheet-tab-0')).toBeVisible();
  await expect(page.getByTestId('sheet-tab-0')).toHaveText(/\S/u);
  const previewRows = page.getByTestId('preview-table').locator('tbody tr');
  expect(await previewRows.count()).toBeGreaterThan(0);
  expect(await previewRows.count()).toBeLessThanOrEqual(10);
  expect(unexpectedRequests).toEqual([]);
});

test('2. 问题样例完成检查后同时给出 error、warning、info 和 QG 编号', async ({ page }) => {
  await openIssueResults(page);

  expect(await summaryCount(page, 'summary-errors')).toBeGreaterThan(0);
  expect(await summaryCount(page, 'summary-warnings')).toBeGreaterThan(0);
  expect(await summaryCount(page, 'summary-infos')).toBeGreaterThan(0);
  await expect(page.getByTestId('rule-filter').locator('option[value="QG001"]')).toHaveCount(1);
  await expect(page.getByTestId('rule-filter').locator('option[value="QG004"]')).toHaveCount(1);
  await expect(page.getByTestId('rule-filter').locator('option[value="QG014"]')).toHaveCount(1);
  await expect(page.getByTestId('result-table')).not.toContainText(/REQ-|CALC-|STRUCT-|QTY-/u);
});

test('3. 严重程度、规则和工作表筛选只保留匹配问题', async ({ page }) => {
  await openIssueResults(page);

  await page.getByTestId('severity-filter').selectOption('error');
  expect(await issueRows(page).count()).toBeGreaterThan(0);
  for (const row of await issueRows(page).all()) await expect(row).toContainText('错误');

  await page.getByTestId('rule-filter').selectOption('QG010');
  await expect(issueRows(page)).toHaveCount(1);
  await expect(issueRows(page).first()).toContainText('QG010');

  const selectedSheetName =
    (await page.getByTestId('sheet-filter').locator('option').nth(1).textContent()) ?? '';
  expect(selectedSheetName).not.toBe('');
  await page.getByTestId('sheet-filter').selectOption({ index: 1 });
  await expect(issueRows(page)).toHaveCount(1);
  await expect(issueRows(page).first()).toContainText(selectedSheetName);

  await page.getByTestId('clear-filters').click();
  await expect(page.getByTestId('severity-filter')).toHaveValue('all');
  await expect(page.getByTestId('rule-filter')).toHaveValue('all');
  await expect(page.getByTestId('sheet-filter')).toHaveValue('all');
});

test('4. 搜索项目编码可定位 QG010 并打开对应 Excel 行上下文', async ({ page }) => {
  await openIssueResults(page);

  await page.getByTestId('issue-search').fill('030101001006');
  await expect(issueRows(page)).toHaveCount(1);
  await expect(issueRows(page).first()).toContainText('QG010');
  await expect(issueRows(page).first()).toContainText('030101001006');
  await issueRows(page).first().getByRole('button').click();
  await expect(page.getByTestId('issue-context')).toContainText('030101001006');
  await expect(page.getByTestId('issue-context')).toContainText('问题行');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('issue-context')).toHaveCount(0);
});

test('5. CSV、JSON、XLSX 三种报告均产生可读取的实际下载', async ({ page }) => {
  await openIssueResults(page);

  const csv = await downloadWith(page, 'export-csv');
  expect(csv.suggestedFilename()).toMatch(/_BOQ_Lint_检查报告_\d{8}-\d{4}\.csv$/u);
  const csvPath = await csv.path();
  expect(csvPath).not.toBeNull();
  if (csvPath === null) throw new Error('CSV download did not produce a local path.');
  const csvBytes = await readFile(csvPath);
  expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csvText = csvBytes.subarray(3).toString('utf8');
  expect(csvText).toContain('规则编号');
  expect(csvText).toContain('QG010');

  const json = await downloadWith(page, 'export-json');
  expect(json.suggestedFilename()).toMatch(/_BOQ_Lint_检查报告_\d{8}-\d{4}\.json$/u);
  const jsonPath = await json.path();
  expect(jsonPath).not.toBeNull();
  if (jsonPath === null) throw new Error('JSON download did not produce a local path.');
  const payload: unknown = JSON.parse(await readFile(jsonPath, 'utf8'));
  expect(payload).toMatchObject({
    appVersion: '0.1.0',
    mode: 'priced',
    ruleConfig: { rules: { QG001: { enabled: true }, QG014: { enabled: true } } },
  });
  if (typeof payload !== 'object' || payload === null || !('issues' in payload)) {
    throw new Error('JSON report does not contain an issues property.');
  }
  expect(Array.isArray(payload.issues)).toBe(true);
  expect(payload.issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ ruleId: 'QG010' })]),
  );

  const xlsx = await downloadWith(page, 'export-xlsx');
  expect(xlsx.suggestedFilename()).toMatch(/_BOQ_Lint_检查报告_\d{8}-\d{4}\.xlsx$/u);
  const xlsxPath = await xlsx.path();
  expect(xlsxPath).not.toBeNull();
  if (xlsxPath === null) throw new Error('XLSX download did not produce a local path.');
  const workbook = new ExcelJS.Workbook();
  const xlsxBytes = new Uint8Array(await readFile(xlsxPath));
  await workbook.xlsx.load(xlsxBytes.buffer);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
    '检查汇总',
    '问题明细',
    '规则说明',
  ]);
  expect(workbook.getWorksheet('规则说明')?.getCell('A2').value).toBe('QG001');
  expect(workbook.getWorksheet('问题明细')?.rowCount).toBeGreaterThan(1);
});

test('6. 结果页关闭 QG001 后立即重新检查并持久保留开关状态', async ({ page }) => {
  await openIssueResults(page);
  const errorsBefore = await summaryCount(page, 'summary-errors');
  await page.getByTestId('rule-filter').selectOption('QG001');
  const qg001Issues = await issueRows(page).count();
  expect(qg001Issues).toBeGreaterThan(0);
  await page.getByTestId('clear-filters').click();

  await page.getByTestId('result-rule-settings').click();
  await expect(page.getByTestId('settings-drawer')).toBeVisible();
  await expect(page.getByTestId('rule-toggle-QG001')).toBeChecked();
  await page.getByTestId('rule-toggle-QG001').click();
  await expect(page.getByTestId('rule-toggle-QG001')).not.toBeChecked();
  await page.getByTestId('close-settings').click();

  await expect
    .poll(() => summaryCount(page, 'summary-errors'), { timeout: 30_000 })
    .toBe(errorsBefore - qg001Issues);
  await expect(page.getByTestId('rule-filter').locator('option[value="QG001"]')).toHaveCount(0);

  await page.getByTestId('result-rule-settings').click();
  await expect(page.getByTestId('rule-toggle-QG001')).not.toBeChecked();
});

test('7. 修改字段映射后可重新检查，且返回映射页仍保留修改', async ({ page }) => {
  await goToMapping(page, 'valid', { priced: true });
  await runCheck(page);
  await page.getByTestId('back-mapping').click();

  const remarks = page.getByTestId('mapping-remarks');
  const original = await remarks.inputValue();
  const changed = original === '1' ? '2' : '1';
  await remarks.selectOption(changed);
  await expect(remarks).toHaveValue(changed);
  await runCheck(page);

  await page.getByTestId('back-mapping').click();
  await expect(page.getByTestId('mapping-remarks')).toHaveValue(changed);
  await runCheck(page);
  expect(await summaryCount(page, 'summary-errors')).toBeGreaterThanOrEqual(0);
});

test('8. 清空会回到导入步骤并移除文件摘要与检查结果', async ({ page }) => {
  await openIssueResults(page);

  await page.getByTestId('new-file').click();
  await expect(page.getByTestId('import-page')).toBeVisible();
  await expect(page.getByTestId('step-import')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('file-summary')).toHaveCount(0);
  await expect(page.getByTestId('results-page')).toHaveCount(0);
  await expect(page.getByTestId('sample-valid')).toBeEnabled();
  await expect(page.getByTestId('sample-issues')).toBeEnabled();
});

test('9. 干净样例在已计价模式下没有 error、warning 或严重问题', async ({ page }) => {
  await goToMapping(page, 'valid', { priced: true });
  await runCheck(page);

  expect(await summaryCount(page, 'summary-errors')).toBe(0);
  expect(await summaryCount(page, 'summary-warnings')).toBe(0);
  await expect(page.getByTestId('no-severe-issues')).toBeVisible();
  await expect(page.getByTestId('summary-total-rows').locator('strong')).not.toHaveText('0');
});
