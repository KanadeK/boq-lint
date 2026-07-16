import { expect, test, type Download, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validSample = path.join(projectRoot, 'public', 'samples', 'boq-valid-zh.xlsx');
const issuesSample = path.join(projectRoot, 'public', 'samples', 'boq-issues-zh.xlsx');
const offlineHtml = path.join(projectRoot, 'release', 'boq-lint-v0.1.0.html');

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
    sample === 'valid' ? 'boq-valid-zh.xlsx' : 'boq-issues-zh.xlsx',
    { timeout: 30_000 },
  );
  await page.getByTestId('continue-mapping').click();
  await expect(page.getByTestId('mapping-page')).toBeVisible();
  await expect(page.getByTestId('run-check')).toBeEnabled();
}

async function runCheck(page: Page): Promise<void> {
  await page.getByTestId('run-check').click();
  await expect(page.getByTestId('results-page')).toBeVisible({ timeout: 30_000 });
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

test('加载正常中文示例后得到明确通过状态且没有错误', async ({ page }) => {
  await goToMapping(page, 'valid');
  await runCheck(page);

  expect(await summaryCount(page, 'summary-errors')).toBe(0);
  expect(await summaryCount(page, 'summary-warnings')).toBe(0);
  await expect(page.getByTestId('no-severe-issues')).toBeVisible();
  await expect(page.getByTestId('summary-total-rows').locator('strong')).not.toHaveText('0');
});

test('加载含问题示例后同时显示错误、警告和提示', async ({ page }) => {
  await openIssueResults(page);

  expect(await summaryCount(page, 'summary-errors')).toBeGreaterThan(0);
  expect(await summaryCount(page, 'summary-warnings')).toBeGreaterThan(0);
  expect(await summaryCount(page, 'summary-infos')).toBeGreaterThan(0);
  await expect(page.getByTestId('result-table')).toContainText('CALC-001');
  await expect(page.getByTestId('result-table')).toContainText('STRUCT-003');
});

test('修改字段映射后可以重新检查并保留修改', async ({ page }) => {
  await goToMapping(page, 'valid');
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
  await page.getByTestId('run-check').click();
  await expect(page.getByTestId('results-page')).toBeVisible({ timeout: 30_000 });
});

test('严重程度、规则、工作表筛选和搜索可定位问题并打开行上下文', async ({ page }) => {
  await openIssueResults(page);

  await page.getByTestId('severity-filter').selectOption('error');
  await page.getByTestId('rule-filter').selectOption('CALC-001');
  await page.getByTestId('sheet-filter').selectOption({ index: 1 });
  await page.getByTestId('issue-search').fill('030101001006');

  const row = page.getByTestId('result-table').locator('tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row.first()).toContainText('CALC-001');
  await expect(row.first()).toContainText('030101001006');
  await row.first().locator('button').click();
  await expect(page.getByTestId('issue-context')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.getByTestId('page-size').selectOption('50');
  await expect(page.getByTestId('page-size')).toHaveValue('50');
  await page.getByTestId('clear-filters').click();
  await expect(page.getByTestId('issue-search')).toHaveValue('');
});

test('可下载 CSV、JSON 和独立 XLSX 报告', async ({ page }) => {
  await openIssueResults(page);

  const csv = await downloadWith(page, 'export-csv');
  expect(csv.suggestedFilename()).toMatch(/_BOQLint_检查报告_\d{8}-\d{4}\.csv$/u);
  const csvPath = await csv.path();
  expect(csvPath).not.toBeNull();
  if (csvPath === null) throw new Error('CSV download did not produce a local path.');
  const csvBytes = await readFile(csvPath);
  expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

  const json = await downloadWith(page, 'export-json');
  expect(json.suggestedFilename()).toMatch(/_BOQLint_检查报告_\d{8}-\d{4}\.json$/u);
  const jsonPath = await json.path();
  expect(jsonPath).not.toBeNull();
  if (jsonPath === null) throw new Error('JSON download did not produce a local path.');
  const payload: unknown = JSON.parse(await readFile(jsonPath, 'utf8'));
  expect(payload).toMatchObject({ appVersion: '0.1.0', mode: 'priced' });
  if (typeof payload !== 'object' || payload === null || !('issues' in payload)) {
    throw new Error('JSON report does not contain an issues property.');
  }
  expect(Array.isArray(payload.issues)).toBe(true);

  const xlsx = await downloadWith(page, 'export-xlsx');
  expect(xlsx.suggestedFilename()).toMatch(/_BOQLint_检查报告_\d{8}-\d{4}\.xlsx$/u);
  const xlsxPath = await xlsx.path();
  expect(xlsxPath).not.toBeNull();
  if (xlsxPath === null) throw new Error('XLSX download did not produce a local path.');
  expect((await readFile(xlsxPath)).byteLength).toBeGreaterThan(1_000);
});

test('可在简体中文和英文之间完整切换', async ({ page }) => {
  await page.goto('/');
  const initial = await page.locator('html').getAttribute('lang');
  await page.getByTestId('language-toggle').click();
  await expect(page.locator('html')).not.toHaveAttribute('lang', initial ?? '');
  await expect(page.getByTestId('import-page')).toBeVisible();
  await page.getByTestId('language-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', initial ?? 'zh-CN');
});

test('深色、浅色和自动主题切换会更新根主题', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('theme-toggle').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('theme-toggle').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('theme-toggle').selectOption('auto');
  await expect(page.getByTestId('theme-toggle')).toHaveValue('auto');
});

test('上传和处理本地文件期间不发送上传请求', async ({ page }) => {
  await page.goto('/');
  const unexpectedRequests: string[] = [];
  page.on('request', (request) => {
    const method = request.method();
    const url = new URL(request.url());
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(method) ||
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    ) {
      unexpectedRequests.push(`${method} ${request.url()}`);
    }
  });

  await page.getByTestId('file-input').setInputFiles(issuesSample);
  await expect(page.getByTestId('file-summary')).toContainText('boq-issues-zh.xlsx', {
    timeout: 30_000,
  });
  await page.getByTestId('continue-mapping').click();
  await runCheck(page);
  expect(unexpectedRequests).toEqual([]);
});

test('file 协议打开单文件离线版后可完成一次本地检查', async ({ page }) => {
  await page.goto(pathToFileURL(offlineHtml).href);
  await expect(page.getByTestId('import-page')).toBeVisible();
  await page.getByTestId('file-input').setInputFiles(validSample);
  await expect(page.getByTestId('file-summary')).toContainText('boq-valid-zh.xlsx', {
    timeout: 30_000,
  });
  await page.getByTestId('continue-mapping').click();
  await runCheck(page);
  expect(await summaryCount(page, 'summary-errors')).toBe(0);
  await expect(page.getByTestId('no-severe-issues')).toBeVisible();
});
