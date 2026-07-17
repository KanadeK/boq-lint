import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_CONFIG, RULE_IDS, parseWorkbook, runLint, type LintReport } from '../core';

async function checkSample(fileName: string): Promise<LintReport> {
  const bytes = await readFile(path.join(process.cwd(), 'examples', fileName));
  const workbook = await parseWorkbook(new Uint8Array(bytes), { fileName });
  const sheets = workbook.sheets.filter((sheet) => sheet.visibility === 'visible');

  return runLint(workbook, {
    mode: 'priced',
    sheets: sheets.map((sheet) => sheet.name),
    mappings: Object.fromEntries(sheets.map((sheet) => [sheet.name, sheet.suggestedMapping])),
    headerRows: Object.fromEntries(
      sheets.map((sheet) => [sheet.name, sheet.detectedHeaderRow ?? 1]),
    ),
    config: DEFAULT_RULE_CONFIG,
  });
}

describe('generated workbook samples', () => {
  it('parses the clean sample without any issue', async () => {
    const report = await checkSample('boq-clean-sample.xlsx');

    expect(report.summary.detailRows).toBeGreaterThan(0);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
    expect(report.summary.infos).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it('parses the risk sample and exercises every v0.1.0 rule', async () => {
    const report = await checkSample('boq-risk-sample.xlsx');
    const triggeredRules = [...new Set(report.issues.map((issue) => issue.ruleId))].sort();

    expect(report.summary.errors).toBeGreaterThan(0);
    expect(report.summary.warnings).toBeGreaterThan(0);
    expect(report.summary.infos).toBeGreaterThan(0);
    expect(triggeredRules).toEqual([...RULE_IDS].sort());
  });
});
