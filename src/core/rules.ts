import { DEFAULT_RULE_CONFIG, validateRuleConfig } from './config';
import { RULE_DEFINITIONS } from './rule-definitions';
import { mapSheetRows, normalizeText } from './rows';
import type {
  FieldMapping,
  LintIssue,
  LintReport,
  LintRule,
  MappedRow,
  ParsedWorkbook,
  ProgressCallback,
  ProgressEvent,
  RuleConfig,
  RuleContext,
  RuleFinding,
  RunLintOptions,
  WorksheetSnapshot,
} from './types';
import { APP_VERSION, BoqLintError, RULE_IDS } from './types';

function emitProgress(
  callback: ProgressCallback | undefined,
  event: Omit<ProgressEvent, 'percent'>,
): void {
  callback?.({
    ...event,
    percent: event.total <= 0 ? 100 : Math.round((event.processed / event.total) * 100),
  });
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function resolvedConfig(config: RuleConfig | undefined): RuleConfig {
  if (config === undefined) return DEFAULT_RULE_CONFIG;
  const validation = validateRuleConfig(config);
  if (!validation.valid) throw new BoqLintError('INVALID_CONFIG', validation.errors.join(' '));
  return validation.config;
}

function issueFrom(
  rule: LintRule,
  sheetName: string,
  rows: readonly MappedRow[],
  finding: RuleFinding,
  sequence: number,
): LintIssue {
  const row = rows.find((candidate) => candidate.rowNumber === finding.rowNumber);
  return {
    id: `${rule.id}:${sheetName}:${finding.rowNumber}:${finding.cellAddress ?? finding.field ?? 'row'}:${sequence}`,
    severity: rule.severity,
    ruleId: rule.id,
    ruleName: rule.name,
    category: rule.category,
    sheetName,
    rowNumber: finding.rowNumber,
    field: finding.field,
    column: finding.column ?? null,
    ...(finding.cellAddress === undefined ? {} : { cellAddress: finding.cellAddress }),
    itemCode: normalizeText(row?.values.item_code),
    itemName: normalizeText(row?.values.item_name),
    originalValue: finding.originalValue ?? null,
    message: finding.message,
    remediation: rule.remediation,
    ...(finding.relatedRows === undefined ? {} : { relatedRows: finding.relatedRows }),
    ...(finding.calculation === undefined ? {} : { calculation: finding.calculation }),
  };
}

function issueKey(rule: LintRule, sheetName: string, finding: RuleFinding): string {
  const location =
    finding.cellAddress ??
    `${finding.rowNumber}:${finding.field ?? 'row'}:${finding.column ?? 'none'}`;
  return `${rule.id}|${sheetName}|${location}`;
}

interface PreparedSheet {
  readonly sheet: WorksheetSnapshot;
  readonly mapping: FieldMapping;
  readonly headerRow: number;
  readonly rows: readonly MappedRow[];
  readonly itemRows: readonly MappedRow[];
}

function prepareContext(
  prepared: PreparedSheet,
  mode: RunLintOptions['mode'],
  config: RuleConfig,
): RuleContext {
  return {
    sheet: prepared.sheet,
    rows: prepared.rows,
    itemRows: prepared.itemRows,
    mapping: prepared.mapping,
    headerRow: prepared.headerRow,
    mode,
    config,
  };
}

export async function runLint(
  workbook: ParsedWorkbook,
  options: RunLintOptions,
): Promise<LintReport> {
  const startedAt = performance.now();
  const config = resolvedConfig(options.config);
  const selectedNames =
    options.sheets ??
    workbook.sheets.filter((sheet) => sheet.visibility === 'visible').map((sheet) => sheet.name);
  const selectedSheets = selectedNames
    .map((name) => workbook.sheets.find((sheet) => sheet.name === name))
    .filter((sheet): sheet is WorksheetSnapshot => sheet !== undefined);
  if (selectedSheets.length === 0) throw new BoqLintError('NO_VISIBLE_SHEET');

  const mappings: Record<string, FieldMapping> = {};
  const rowsBySheet: Record<string, readonly MappedRow[]> = {};
  const preparedSheets: PreparedSheet[] = [];
  for (const [index, sheet] of selectedSheets.entries()) {
    const mapping = options.mappings?.[sheet.name] ?? sheet.suggestedMapping;
    const headerRow = options.headerRows?.[sheet.name] ?? sheet.detectedHeaderRow;
    if (Object.keys(mapping).length === 0 || headerRow === undefined) {
      throw new BoqLintError('HEADER_NOT_FOUND', `工作表“${sheet.name}”。`);
    }
    const rows = mapSheetRows(sheet, mapping, headerRow);
    const itemRows = rows.filter((row) => row.type === 'item');
    mappings[sheet.name] = { ...mapping };
    rowsBySheet[sheet.name] = rows;
    preparedSheets.push({ sheet, mapping, headerRow, rows, itemRows });
    emitProgress(options.onProgress, {
      stage: 'mapping',
      processed: index + 1,
      total: selectedSheets.length,
      sheetName: sheet.name,
    });
  }

  const detailRows = preparedSheets.reduce((sum, prepared) => sum + prepared.itemRows.length, 0);
  if (detailRows === 0) throw new BoqLintError('NO_DETAIL_ROWS');

  const enabledRules = RULE_DEFINITIONS.filter((rule) => config.rules[rule.id].enabled);
  const totalChecks = Math.max(1, enabledRules.length * preparedSheets.length);
  let processedChecks = 0;
  const issues: LintIssue[] = [];
  const issueKeys = new Set<string>();

  for (const rule of enabledRules) {
    for (const prepared of preparedSheets) {
      const findings = rule.check(prepareContext(prepared, options.mode, config));
      for (const finding of findings) {
        const key = issueKey(rule, prepared.sheet.name, finding);
        if (issueKeys.has(key)) continue;
        issueKeys.add(key);
        issues.push(
          issueFrom(rule, prepared.sheet.name, prepared.rows, finding, issues.length + 1),
        );
      }
      processedChecks += 1;
      emitProgress(options.onProgress, {
        stage: 'checking',
        processed: processedChecks,
        total: totalChecks,
        sheetName: prepared.sheet.name,
      });
      if (processedChecks < totalChecks) await yieldToBrowser();
    }
  }
  if (enabledRules.length === 0) {
    emitProgress(options.onProgress, { stage: 'checking', processed: 1, total: 1 });
  }

  emitProgress(options.onProgress, { stage: 'finalizing', processed: 0, total: 1 });
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const infos = issues.filter((issue) => issue.severity === 'info').length;
  const failedRuleIds = new Set(issues.map((issue) => issue.ruleId));
  const enabledRuleCount = RULE_IDS.filter((ruleId) => config.rules[ruleId].enabled).length;

  const report: LintReport = {
    appVersion: APP_VERSION,
    file: workbook.file,
    checkedAt: new Date().toISOString(),
    mode: options.mode,
    mappings,
    ruleConfig: config,
    summary: {
      detailRows,
      checkedSheets: selectedSheets.length,
      errors,
      warnings,
      infos,
      passedRules: enabledRuleCount - failedRuleIds.size,
      durationMs: Math.max(0, performance.now() - startedAt),
    },
    issues,
    rows: rowsBySheet,
  };
  emitProgress(options.onProgress, { stage: 'finalizing', processed: 1, total: 1 });
  emitProgress(options.onProgress, { stage: 'complete', processed: 1, total: 1 });
  return report;
}

export const checkWorkbook = runLint;
