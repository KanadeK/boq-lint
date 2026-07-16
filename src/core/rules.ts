import Decimal from 'decimal.js';

import { DEFAULT_RULE_CONFIG, RULE_METADATA, validateRuleConfig } from './config';
import { fieldLabel } from './fields';
import { parseLocaleNumber, roundMoney } from './numbers';
import { formulaError, isMissing, mapSheetRows, normalizeComparable, normalizeText } from './rows';
import type {
  CheckMode,
  FieldKey,
  FieldMapping,
  LintIssue,
  LintReport,
  MappedCell,
  MappedRow,
  ParsedWorkbook,
  ProgressCallback,
  ProgressEvent,
  RuleConfig,
  RuleId,
  RunLintOptions,
  WorksheetSnapshot,
} from './types';
import { APP_VERSION, BoqLintError, RULE_IDS } from './types';

const UNPRICED_REQUIRED: readonly FieldKey[] = ['item_code', 'item_name', 'unit', 'quantity'];
const PRICED_REQUIRED: readonly FieldKey[] = [...UNPRICED_REQUIRED, 'unit_price', 'total_price'];
const NUMERIC_FIELDS: readonly FieldKey[] = ['quantity', 'unit_price', 'total_price'];
const FINGERPRINT_FIELDS: readonly FieldKey[] = [
  'item_code',
  'item_name',
  'item_feature',
  'unit',
  'quantity',
  'unit_price',
  'total_price',
  'remarks',
];

function requiredFields(mode: CheckMode): readonly FieldKey[] {
  return mode === 'priced' ? PRICED_REQUIRED : UNPRICED_REQUIRED;
}

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

function enabled(config: RuleConfig, ruleId: RuleId): boolean {
  return config.rules[ruleId].enabled;
}

function cellFor(row: MappedRow, field: FieldKey): MappedCell | undefined {
  return row.cells[field];
}

function display(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'symbol') return value.description ?? '';
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  try {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function missingRequired(cell: MappedCell | undefined): boolean {
  if (cell?.formula !== undefined && !cell.formula.hasCachedResult) return false;
  return cell === undefined || isMissing(cell.value);
}

function numericFingerprint(value: unknown): string {
  const parsed = parseLocaleNumber(value);
  return parsed.valid ? `number:${parsed.normalized!}` : `text:${normalizeComparable(value)}`;
}

function rowFingerprint(row: MappedRow): string {
  return JSON.stringify(
    FINGERPRINT_FIELDS.map((field) =>
      NUMERIC_FIELDS.includes(field)
        ? numericFingerprint(row.values[field])
        : normalizeComparable(row.values[field]),
    ),
  );
}

function conflictSignature(row: MappedRow): string {
  return JSON.stringify([
    normalizeComparable(row.values.item_name),
    normalizeComparable(row.values.unit),
    normalizeComparable(row.values.item_feature),
  ]);
}

function codeFormattingProblem(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  return (
    /^\s|\s$/u.test(value) || /[\r\n]/u.test(value) || /[\uFF01-\uFF60\uFFE0-\uFFE6]/u.test(value)
  );
}

interface IssueInput {
  readonly ruleId: RuleId;
  readonly sheetName: string;
  readonly rowNumber: number;
  readonly field: FieldKey | null;
  readonly column?: number | null;
  readonly cellAddress?: string;
  readonly itemCode?: string;
  readonly itemName?: string;
  readonly originalValue?: unknown;
  readonly message: string;
  readonly relatedRows?: readonly number[];
  readonly calculation?: LintIssue['calculation'];
}

function issueFrom(input: IssueInput, sequence: number): LintIssue {
  const metadata = RULE_METADATA[input.ruleId];
  return {
    id: `${input.ruleId}:${input.sheetName}:${input.rowNumber}:${input.field ?? 'row'}:${sequence}`,
    severity: metadata.defaultSeverity,
    ruleId: input.ruleId,
    ruleName: metadata.name,
    sheetName: input.sheetName,
    rowNumber: input.rowNumber,
    field: input.field,
    column: input.column ?? null,
    ...(input.cellAddress === undefined ? {} : { cellAddress: input.cellAddress }),
    itemCode: input.itemCode ?? '',
    itemName: input.itemName ?? '',
    originalValue: input.originalValue ?? null,
    message: input.message,
    remediation: metadata.remediation,
    ...(input.relatedRows === undefined ? {} : { relatedRows: input.relatedRows }),
    ...(input.calculation === undefined ? {} : { calculation: input.calculation }),
  };
}

function sourceRow(sheet: WorksheetSnapshot, rowNumber: number) {
  return sheet.rows.find((row) => row.rowNumber === rowNumber);
}

function addFormulaIssues(
  sheet: WorksheetSnapshot,
  row: MappedRow,
  mapping: FieldMapping,
  config: RuleConfig,
  add: (input: IssueInput) => void,
): void {
  const source = sourceRow(sheet, row.rowNumber);
  if (source === undefined) return;
  const fieldByColumn = new Map<number, FieldKey>(
    (Object.entries(mapping) as [FieldKey, number][]).map(([field, column]) => [column, field]),
  );
  for (const cell of Object.values(source.cells)) {
    if (cell.formula === undefined) continue;
    const field = fieldByColumn.get(cell.column) ?? null;
    const error = formulaError(cell.formula.cachedResult);
    if (error !== undefined && enabled(config, 'FORMULA-001')) {
      add({
        ruleId: 'FORMULA-001',
        sheetName: sheet.name,
        rowNumber: row.rowNumber,
        field,
        column: cell.column,
        cellAddress: cell.address,
        itemCode: normalizeText(row.values.item_code),
        itemName: normalizeText(row.values.item_name),
        originalValue: error,
        message: `公式“${cell.formula.expression}”的结果为 ${error}。`,
      });
    } else if (!cell.formula.hasCachedResult && enabled(config, 'FORMULA-002')) {
      add({
        ruleId: 'FORMULA-002',
        sheetName: sheet.name,
        rowNumber: row.rowNumber,
        field,
        column: cell.column,
        cellAddress: cell.address,
        itemCode: normalizeText(row.values.item_code),
        itemName: normalizeText(row.values.item_name),
        originalValue: cell.formula.expression,
        message: `公式“${cell.formula.expression}”没有可读取的缓存结果，浏览器无法确认其计算值。`,
      });
    }
  }
}

function checkRowRules(
  sheet: WorksheetSnapshot,
  row: MappedRow,
  mapping: FieldMapping,
  mode: CheckMode,
  config: RuleConfig,
  add: (input: IssueInput) => void,
): void {
  const itemCode = normalizeText(row.values.item_code);
  const itemName = normalizeText(row.values.item_name);
  const context = { sheetName: sheet.name, rowNumber: row.rowNumber, itemCode, itemName };

  if (enabled(config, 'REQ-001')) {
    for (const field of requiredFields(mode)) {
      const cell = cellFor(row, field);
      if (missingRequired(cell)) {
        add({
          ...context,
          ruleId: 'REQ-001',
          field,
          column: cell?.column ?? mapping[field] ?? null,
          cellAddress: cell?.address,
          originalValue: cell?.originalValue,
          message: `必需字段“${fieldLabel(field)}”为空。`,
        });
      }
    }
  }

  if (enabled(config, 'NUM-001')) {
    for (const field of NUMERIC_FIELDS) {
      const cell = cellFor(row, field);
      if (
        cell === undefined ||
        isMissing(cell.value) ||
        (cell.formula !== undefined && !cell.formula.hasCachedResult) ||
        formulaError(cell.value) !== undefined
      ) {
        continue;
      }
      if (!parseLocaleNumber(cell.value).valid) {
        add({
          ...context,
          ruleId: 'NUM-001',
          field,
          column: cell.column,
          cellAddress: cell.address,
          originalValue: cell.originalValue,
          message: `“${fieldLabel(field)}”不是有效数值：${display(cell.value)}。`,
        });
      }
    }
  }

  const quantityCell = cellFor(row, 'quantity');
  const quantity = parseLocaleNumber(quantityCell?.value);
  if (enabled(config, 'QTY-001') && quantity.valid && quantity.decimal!.lessThanOrEqualTo(0)) {
    add({
      ...context,
      ruleId: 'QTY-001',
      field: 'quantity',
      column: quantityCell?.column,
      cellAddress: quantityCell?.address,
      originalValue: quantityCell?.originalValue,
      message: `工程量为 ${quantity.normalized}，等于零或小于零。`,
    });
  }

  const featureCell = cellFor(row, 'item_feature');
  if (enabled(config, 'TEXT-001') && missingRequired(featureCell)) {
    add({
      ...context,
      ruleId: 'TEXT-001',
      field: 'item_feature',
      column: featureCell?.column ?? mapping.item_feature ?? null,
      cellAddress: featureCell?.address,
      originalValue: featureCell?.originalValue,
      message: '项目特征为空。',
    });
  }

  const codeCell = cellFor(row, 'item_code');
  if (enabled(config, 'CODE-001') && codeFormattingProblem(codeCell?.originalValue)) {
    add({
      ...context,
      ruleId: 'CODE-001',
      field: 'item_code',
      column: codeCell?.column,
      cellAddress: codeCell?.address,
      originalValue: codeCell?.originalValue,
      message: '项目编码含首尾空格、换行或明显全角字符。',
    });
  }

  if (enabled(config, 'STRUCT-001')) {
    for (const field of requiredFields(mode)) {
      const cell = cellFor(row, field);
      if (cell?.merged === true) {
        add({
          ...context,
          ruleId: 'STRUCT-001',
          field,
          column: cell.column,
          cellAddress: cell.address,
          originalValue: cell.originalValue,
          message: `关键字段“${fieldLabel(field)}”位于合并区域 ${cell.mergeRange ?? cell.address}。`,
        });
      }
    }
  }

  if (enabled(config, 'STRUCT-002') && row.hidden) {
    add({
      ...context,
      ruleId: 'STRUCT-002',
      field: null,
      originalValue: true,
      message: '该清单明细行处于隐藏状态。',
    });
  }

  if (mode === 'priced' && enabled(config, 'CALC-001')) {
    const quantityValue = parseLocaleNumber(row.values.quantity);
    const unitPriceValue = parseLocaleNumber(row.values.unit_price);
    const totalPriceValue = parseLocaleNumber(row.values.total_price);
    const formulaUnavailable = (['quantity', 'unit_price', 'total_price'] as const).some(
      (field) => row.cells[field]?.formula?.hasCachedResult === false,
    );
    const formulaHasError = (['quantity', 'unit_price', 'total_price'] as const).some(
      (field) => formulaError(row.values[field]) !== undefined,
    );
    if (
      !formulaUnavailable &&
      !formulaHasError &&
      quantityValue.valid &&
      unitPriceValue.valid &&
      totalPriceValue.valid
    ) {
      const expected = roundMoney(quantityValue.decimal!.times(unitPriceValue.decimal!));
      const actual = totalPriceValue.decimal!;
      const difference = actual.minus(expected);
      const tolerance = new Decimal(config.calcTolerance);
      if (difference.abs().greaterThan(tolerance)) {
        const totalCell = cellFor(row, 'total_price');
        add({
          ...context,
          ruleId: 'CALC-001',
          field: 'total_price',
          column: totalCell?.column,
          cellAddress: totalCell?.address,
          originalValue: totalCell?.originalValue,
          message: `表内合价 ${actual.toString()} 与计算合价 ${expected.toFixed(2)} 不一致，差额 ${difference.toString()}。`,
          calculation: {
            actual: actual.toString(),
            expected: expected.toFixed(2),
            difference: difference.toString(),
            tolerance: tolerance.toString(),
          },
        });
      }
    }
  }

  addFormulaIssues(sheet, row, mapping, config, add);
}

function checkSheetConsistency(
  sheet: WorksheetSnapshot,
  rows: readonly MappedRow[],
  config: RuleConfig,
  add: (input: IssueInput) => void,
): void {
  const fingerprints = new Map<string, number>();
  const signaturesByCode = new Map<string, { signature: string; row: number }>();
  const unitByCode = new Map<string, { unit: string; row: number }>();
  const unitByName = new Map<string, { unit: string; row: number }>();

  for (const row of rows) {
    const itemCode = normalizeText(row.values.item_code);
    const itemName = normalizeText(row.values.item_name);
    const context = { sheetName: sheet.name, rowNumber: row.rowNumber, itemCode, itemName };

    if (enabled(config, 'DUP-001')) {
      const fingerprint = rowFingerprint(row);
      const priorRow = fingerprints.get(fingerprint);
      if (priorRow === undefined) fingerprints.set(fingerprint, row.rowNumber);
      else {
        add({
          ...context,
          ruleId: 'DUP-001',
          field: null,
          originalValue: null,
          relatedRows: [priorRow],
          message: `该明细与第 ${priorRow} 行完全重复。`,
        });
      }
    }

    const normalizedCode = normalizeComparable(row.values.item_code);
    if (enabled(config, 'DUP-002') && normalizedCode.length > 0) {
      const signature = conflictSignature(row);
      const prior = signaturesByCode.get(normalizedCode);
      if (prior === undefined)
        signaturesByCode.set(normalizedCode, { signature, row: row.rowNumber });
      else if (prior.signature !== signature) {
        add({
          ...context,
          ruleId: 'DUP-002',
          field: 'item_code',
          column: row.cells.item_code?.column,
          cellAddress: row.cells.item_code?.address,
          originalValue: row.cells.item_code?.originalValue,
          relatedRows: [prior.row],
          message: `同一项目编码与第 ${prior.row} 行的名称、单位或项目特征不一致。`,
        });
      }
    }

    if (enabled(config, 'UNIT-001')) {
      const unit = normalizeComparable(row.values.unit);
      const normalizedName = normalizeComparable(row.values.item_name);
      let conflict: { unit: string; row: number } | undefined;
      if (unit.length > 0 && normalizedCode.length > 0) {
        const prior = unitByCode.get(normalizedCode);
        if (prior === undefined) unitByCode.set(normalizedCode, { unit, row: row.rowNumber });
        else if (prior.unit !== unit) conflict = prior;
      }
      if (unit.length > 0 && normalizedName.length > 0) {
        const prior = unitByName.get(normalizedName);
        if (prior === undefined) unitByName.set(normalizedName, { unit, row: row.rowNumber });
        else if (prior.unit !== unit && conflict === undefined) conflict = prior;
      }
      if (conflict !== undefined) {
        add({
          ...context,
          ruleId: 'UNIT-001',
          field: 'unit',
          column: row.cells.unit?.column,
          cellAddress: row.cells.unit?.address,
          originalValue: row.cells.unit?.originalValue,
          relatedRows: [conflict.row],
          message: `计量单位与第 ${conflict.row} 行不一致。`,
        });
      }
    }
  }
}

function resolvedConfig(config: RuleConfig | undefined): RuleConfig {
  if (config === undefined) return DEFAULT_RULE_CONFIG;
  const validation = validateRuleConfig(config);
  if (!validation.valid) throw new BoqLintError('INVALID_CONFIG', validation.errors.join(' '));
  return validation.config;
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
  let mappedSheetCount = 0;
  for (const sheet of selectedSheets) {
    const mapping = options.mappings?.[sheet.name] ?? sheet.suggestedMapping;
    const headerRow = options.headerRows?.[sheet.name] ?? sheet.detectedHeaderRow;
    if (Object.keys(mapping).length === 0 || headerRow === undefined) {
      throw new BoqLintError('HEADER_NOT_FOUND', `工作表“${sheet.name}”。`);
    }
    mappings[sheet.name] = { ...mapping };
    rowsBySheet[sheet.name] = mapSheetRows(sheet, mapping, headerRow);
    mappedSheetCount += 1;
    emitProgress(options.onProgress, {
      stage: 'mapping',
      processed: mappedSheetCount,
      total: selectedSheets.length,
      sheetName: sheet.name,
    });
  }

  const issues: LintIssue[] = [];
  const issueKeys = new Set<string>();
  const add = (input: IssueInput): void => {
    const key = `${input.ruleId}|${input.sheetName}|${input.rowNumber}|${input.field ?? ''}|${input.column ?? ''}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push(issueFrom(input, issues.length + 1));
  };

  const totalRows = Object.values(rowsBySheet).reduce((sum, rows) => sum + rows.length, 0);
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 250));
  let processed = 0;
  let detailRows = 0;
  for (const sheet of selectedSheets) {
    const mapping = mappings[sheet.name]!;
    const rows = rowsBySheet[sheet.name] ?? [];

    if (enabled(config, 'STRUCT-002')) {
      for (const field of requiredFields(options.mode)) {
        const column = mapping[field];
        if (column !== undefined && sheet.hiddenColumns.includes(column)) {
          add({
            ruleId: 'STRUCT-002',
            sheetName: sheet.name,
            rowNumber: options.headerRows?.[sheet.name] ?? sheet.detectedHeaderRow ?? 1,
            field,
            column,
            originalValue: true,
            message: `关键字段列“${fieldLabel(field)}”处于隐藏状态。`,
          });
        }
      }
    }

    const detailSheetRows: MappedRow[] = [];
    for (const row of rows) {
      if (row.type === 'repeated_header') {
        if (enabled(config, 'STRUCT-003')) {
          add({
            ruleId: 'STRUCT-003',
            sheetName: sheet.name,
            rowNumber: row.rowNumber,
            field: null,
            originalValue: null,
            message: '在明细区域发现重复表头，该行已从明细检查中排除。',
          });
        }
      } else if (row.type === 'detail') {
        detailRows += 1;
        detailSheetRows.push(row);
        checkRowRules(sheet, row, mapping, options.mode, config, add);
      }

      processed += 1;
      if (processed % batchSize === 0 || processed === totalRows) {
        emitProgress(options.onProgress, {
          stage: 'checking',
          processed,
          total: totalRows,
          sheetName: sheet.name,
        });
        if (processed < totalRows) await yieldToBrowser();
      }
    }
    checkSheetConsistency(sheet, detailSheetRows, config, add);
  }

  if (detailRows === 0) throw new BoqLintError('NO_DETAIL_ROWS');
  emitProgress(options.onProgress, { stage: 'finalizing', processed: 0, total: 1 });

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const infos = issues.filter((issue) => issue.severity === 'info').length;
  const failedRuleIds = new Set(issues.map((issue) => issue.ruleId));
  const enabledRuleCount = RULE_IDS.filter((ruleId) => enabled(config, ruleId)).length;
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
