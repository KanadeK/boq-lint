import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  APP_VERSION,
  BoqLintError,
  DEFAULT_RULE_CONFIG,
  FIELD_KEYS,
  RULE_METADATA,
  calculateTotal,
  createCsvReport,
  createJsonReport,
  createXlsxReport,
  detectHeaderCandidates,
  exportCsv,
  exportJson,
  exportRuleConfig,
  exportXlsx,
  formatReportFileName,
  importRuleConfig,
  loadRuleConfig,
  mapHeaderValues,
  mapSheetRows,
  mapWorksheetHeader,
  normalizeHeader,
  parseLocaleNumber,
  parseWorkbook,
  resolveHeaderField,
  runLint,
  saveRuleConfig,
  validateRuleConfig,
} from './index';
import type {
  CellSnapshot,
  FieldKey,
  FieldMapping,
  LintReport,
  ParsedWorkbook,
  RowSnapshot,
  RuleConfig,
  WorksheetSnapshot,
} from './index';

const MAPPING: FieldMapping = {
  serial_no: 1,
  item_code: 2,
  item_name: 3,
  item_feature: 4,
  unit: 5,
  quantity: 6,
  unit_price: 7,
  total_price: 8,
  remarks: 9,
};

const HEADERS = [
  '序号',
  '项目编码',
  '项目名称',
  '项目特征',
  '计量单位',
  '工程量',
  '综合单价',
  '合价',
  '备注',
] as const;

function columnName(column: number): string {
  let name = '';
  let current = column;
  while (current > 0) {
    current -= 1;
    name = String.fromCharCode(65 + (current % 26)) + name;
    current = Math.floor(current / 26);
  }
  return name;
}

interface FormulaFixture {
  readonly expression: string;
  readonly result?: unknown;
  readonly hasResult: boolean;
}

interface SheetFixtureOptions {
  readonly name?: string;
  readonly hiddenRows?: readonly number[];
  readonly hiddenColumns?: readonly number[];
  readonly mergeRanges?: readonly string[];
  readonly formulas?: Readonly<Record<string, FormulaFixture>>;
  readonly headerRow?: number;
  readonly visibility?: WorksheetSnapshot['visibility'];
}

function rowSnapshot(
  rowNumber: number,
  values: readonly unknown[],
  options: SheetFixtureOptions = {},
): RowSnapshot {
  const cells: Record<number, CellSnapshot> = {};
  values.forEach((value, offset) => {
    const column = offset + 1;
    const address = `${columnName(column)}${rowNumber}`;
    const formula = options.formulas?.[`${rowNumber}:${column}`];
    if ((value === undefined || value === null || value === '') && formula === undefined) return;
    const formulaText = (() => {
      if (formula === undefined || !formula.hasResult || formula.result == null) return '';
      if (typeof formula.result === 'string') return formula.result;
      if (
        typeof formula.result === 'number' ||
        typeof formula.result === 'bigint' ||
        typeof formula.result === 'boolean'
      ) {
        return String(formula.result);
      }
      if (typeof formula.result === 'symbol') return formula.result.description ?? '';
      if (typeof formula.result === 'function') return '';
      return JSON.stringify(formula.result);
    })();
    cells[column] = {
      row: rowNumber,
      column,
      address,
      value:
        formula === undefined ? value : { formula: formula.expression, result: formula.result },
      text: formula === undefined ? String(value) : formulaText,
      ...(formula === undefined
        ? {}
        : {
            formula: {
              expression: formula.expression,
              ...(formula.hasResult ? { cachedResult: formula.result } : {}),
              hasCachedResult: formula.hasResult,
            },
          }),
      merged: false,
    };
  });
  return {
    rowNumber,
    hidden: options.hiddenRows?.includes(rowNumber) ?? false,
    cells,
  };
}

function sheetFixture(
  dataRows: readonly (readonly unknown[])[],
  options: SheetFixtureOptions = {},
): WorksheetSnapshot {
  const headerRow = options.headerRow ?? 1;
  const rows: RowSnapshot[] = [];
  for (let row = 1; row < headerRow; row += 1)
    rows.push(rowSnapshot(row, [`标题 ${row}`], options));
  rows.push(rowSnapshot(headerRow, HEADERS, options));
  dataRows.forEach((values, index) =>
    rows.push(rowSnapshot(headerRow + index + 1, values, options)),
  );
  const candidates = detectHeaderCandidates(rows);
  return {
    name: options.name ?? '清单',
    index: 1,
    visibility: options.visibility ?? 'visible',
    rowCount: rows.length,
    columnCount: 9,
    rows,
    hiddenColumns: options.hiddenColumns ?? [],
    mergeRanges: options.mergeRanges ?? [],
    headerCandidates: candidates,
    detectedHeaderRow: headerRow,
    suggestedMapping: MAPPING,
  };
}

function detail(overrides: Partial<Record<FieldKey, unknown>> = {}): readonly unknown[] {
  const values: Record<FieldKey, unknown> = {
    serial_no: 1,
    item_code: '010101001',
    item_name: '虚构演示项目',
    item_feature: '虚构规格与做法',
    unit: 'm²',
    quantity: 2,
    unit_price: 12.5,
    total_price: 25,
    remarks: '仅供演示',
    ...overrides,
  };
  return FIELD_KEYS.map((field) => values[field]);
}

function workbookFixture(
  dataRows: readonly (readonly unknown[])[],
  options: SheetFixtureOptions = {},
): ParsedWorkbook {
  const sheet = sheetFixture(dataRows, options);
  return {
    file: { name: 'fixture.xlsx', size: 1024, sheetCount: 1, visibleSheetCount: 1 },
    sheets: [sheet],
  };
}

async function lint(
  rows: readonly (readonly unknown[])[],
  options: SheetFixtureOptions & {
    readonly mode?: 'unpriced' | 'priced';
    readonly config?: RuleConfig;
  } = {},
) {
  return runLint(workbookFixture(rows, options), {
    mode: options.mode ?? 'priced',
    config: options.config,
  });
}

function mutableConfig(): {
  version: 1;
  calcTolerance: string;
  rules: Record<string, { enabled: boolean }>;
} {
  return JSON.parse(JSON.stringify(DEFAULT_RULE_CONFIG)) as {
    version: 1;
    calcTolerance: string;
    rules: Record<string, { enabled: boolean }>;
  };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

async function xlsxBytes(setup?: (workbook: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  setup?.(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  const view = buffer as unknown as Uint8Array;
  const copy = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  return new Uint8Array(copy);
}

describe('header normalization and mapping', () => {
  it('normalizes whitespace, line breaks, full-width colons and case', () => {
    expect(normalizeHeader('  ITEM\nNAME： ')).toBe('itemname');
  });

  it.each([
    ['项目编码', 'item_code'],
    ['清单编码', 'item_code'],
    ['编码', 'item_code'],
    ['项目名称', 'item_name'],
    ['清单项目名称', 'item_name'],
    ['清单名称', 'item_name'],
    ['项目特征', 'item_feature'],
    ['项目特征描述', 'item_feature'],
    ['特征描述', 'item_feature'],
    ['特征', 'item_feature'],
    ['计量单位', 'unit'],
    ['单位', 'unit'],
    ['工程量', 'quantity'],
    ['数量', 'quantity'],
    ['综合单价', 'unit_price'],
    ['单价', 'unit_price'],
    ['合价', 'total_price'],
    ['综合合价', 'total_price'],
    ['总价', 'total_price'],
    ['金额', 'total_price'],
    ['备注', 'remarks'],
    ['说明', 'remarks'],
    ['序号', 'serial_no'],
    ['编号', 'serial_no'],
  ] as const)('maps required Chinese synonym %s', (header, field) => {
    expect(resolveHeaderField(header)).toBe(field);
  });

  it('never maps 编号 to item_code', () => {
    expect(mapHeaderValues(['编号'])).toEqual({ serial_no: 1 });
  });

  it('maps sensible English headers', () => {
    expect(
      mapHeaderValues([
        'No.',
        'Item Code',
        'Item Name',
        'Feature Description',
        'UOM',
        'Qty',
        'Unit Price',
        'Total Amount',
        'Remarks',
      ]),
    ).toEqual(MAPPING);
  });

  it('detects a Chinese header within the first 30 rows', () => {
    const sheet = sheetFixture([detail()], { headerRow: 18 });
    expect(sheet.headerCandidates[0]?.rowNumber).toBe(18);
  });

  it('chooses the highest-scoring candidate rather than the earliest row', () => {
    const rows = [rowSnapshot(1, ['项目编码', '项目名称']), rowSnapshot(2, HEADERS)];
    expect(detectHeaderCandidates(rows)[0]?.rowNumber).toBe(2);
  });

  it('does not auto-detect a header after row 30', () => {
    const row = rowSnapshot(31, HEADERS);
    expect(detectHeaderCandidates([row])).toHaveLength(0);
  });

  it('supports a manually selected header row', () => {
    const rows = [rowSnapshot(1, ['说明']), rowSnapshot(35, HEADERS)];
    const candidate = mapWorksheetHeader({ rows }, 35);
    expect(candidate?.manual).toBe(true);
    expect(candidate?.mapping.item_code).toBe(2);
  });
});

describe('row classification', () => {
  function typeOf(row: readonly unknown[]): string | undefined {
    const sheet = sheetFixture([row]);
    return mapSheetRows(sheet, MAPPING, 1)[0]?.type;
  }

  it('classifies a normal BOQ row as detail', () => expect(typeOf(detail())).toBe('detail'));
  it('classifies an empty row as blank', () => expect(typeOf([])).toBe('blank'));
  it('classifies a chapter title as section', () =>
    expect(typeOf([null, null, '第一章 土建工程'])).toBe('section'));
  it('classifies a subtotal row as subtotal', () =>
    expect(typeOf([null, null, '本页小计', null, null, null, null, 25])).toBe('subtotal'));
  it('classifies a grand total row as subtotal', () =>
    expect(typeOf([null, null, '合计', null, null, null, null, 25])).toBe('subtotal'));
  it('classifies a repeated header in the data region separately', () =>
    expect(typeOf(HEADERS)).toBe('repeated_header'));

  it('excludes repeated headers from details and reports STRUCT-003', async () => {
    const report = await lint([detail(), HEADERS, detail({ item_code: 'B' })]);
    expect(report.summary.detailRows).toBe(2);
    expect(report.issues.some((issue) => issue.ruleId === 'STRUCT-003')).toBe(true);
  });
});

describe('strict localized number parsing and Decimal calculations', () => {
  it('parses a correctly grouped comma number', () =>
    expect(parseLocaleNumber('1,234.56').normalized).toBe('1234.56'));
  it('parses an ungrouped decimal', () =>
    expect(parseLocaleNumber('1234.56').normalized).toBe('1234.56'));
  it('trims leading and trailing whitespace', () =>
    expect(parseLocaleNumber('  1234.56  ').normalized).toBe('1234.56'));
  it('parses an accounting-style negative', () =>
    expect(parseLocaleNumber('(1,234.56)').normalized).toBe('-1234.56'));
  it('parses an Excel numeric cell value', () =>
    expect(parseLocaleNumber(1234.56).valid).toBe(true));
  it('normalizes full-width numeric characters', () =>
    expect(parseLocaleNumber('１２３４．５６').normalized).toBe('1234.56'));
  it('rejects arbitrary text containing a number', () =>
    expect(parseLocaleNumber('约 12 元').valid).toBe(false));
  it('rejects malformed comma grouping', () =>
    expect(parseLocaleNumber('12,34.56').valid).toBe(false));
  it('rejects a double-negative accounting representation', () =>
    expect(parseLocaleNumber('(-12)').valid).toBe(false));
  it('calculates and rounds money with Decimal rather than binary floating point', () =>
    expect(calculateTotal('0.1', '0.2')?.toFixed(2)).toBe('0.02'));
  it('rounds half up to two decimal places', () =>
    expect(calculateTotal('1', '1.005')?.toFixed(2)).toBe('1.01'));
});

describe('validation rules and mode differences', () => {
  it('REQ-001 reports each required missing field', async () => {
    const report = await lint([detail({ item_code: '', item_name: '' })], { mode: 'unpriced' });
    expect(
      report.issues.filter((issue) => issue.ruleId === 'REQ-001').map((issue) => issue.field),
    ).toEqual(['item_code', 'item_name']);
  });

  it('unpriced mode does not require unit price or total price', async () => {
    const report = await lint([detail({ unit_price: '', total_price: '' })], { mode: 'unpriced' });
    expect(report.issues.filter((issue) => issue.ruleId === 'REQ-001')).toHaveLength(0);
    expect(report.issues.filter((issue) => issue.ruleId === 'CALC-001')).toHaveLength(0);
  });

  it('priced mode requires unit price and total price', async () => {
    const report = await lint([detail({ unit_price: '', total_price: '' })], { mode: 'priced' });
    expect(
      report.issues.filter((issue) => issue.ruleId === 'REQ-001').map((issue) => issue.field),
    ).toEqual(['unit_price', 'total_price']);
  });

  it('NUM-001 rejects a textual quantity', async () => {
    const report = await lint([detail({ quantity: '约12' })]);
    expect(
      report.issues.some((issue) => issue.ruleId === 'NUM-001' && issue.field === 'quantity'),
    ).toBe(true);
  });

  it('QTY-001 warns for zero and negative quantities', async () => {
    const report = await lint([
      detail({ item_code: 'A', quantity: 0, total_price: 0 }),
      detail({ item_code: 'B', quantity: -1, total_price: -12.5 }),
    ]);
    expect(report.issues.filter((issue) => issue.ruleId === 'QTY-001')).toHaveLength(2);
    expect(RULE_METADATA['QTY-001'].defaultSeverity).toBe('warning');
  });

  it('DUP-001 detects otherwise identical details even when serial numbers differ', async () => {
    const report = await lint([detail({ serial_no: 1 }), detail({ serial_no: 2 })]);
    expect(report.issues.find((issue) => issue.ruleId === 'DUP-001')?.relatedRows).toEqual([2]);
  });

  it('DUP-002 detects one code mapped to conflicting name, unit or feature', async () => {
    const report = await lint([
      detail({ item_code: 'A', item_name: '名称甲' }),
      detail({ item_code: 'A', item_name: '名称乙', serial_no: 2 }),
    ]);
    expect(report.issues.some((issue) => issue.ruleId === 'DUP-002')).toBe(true);
  });

  it('UNIT-001 detects units conflicting by normalized item name', async () => {
    const report = await lint([
      detail({ item_code: 'A', item_name: '同 名称', unit: 'm' }),
      detail({ item_code: 'B', item_name: '同名称', unit: 'm²', serial_no: 2 }),
    ]);
    expect(report.issues.some((issue) => issue.ruleId === 'UNIT-001')).toBe(true);
  });

  it('CALC-001 records actual, expected and difference using two-decimal rounding', async () => {
    const report = await lint([
      detail({ quantity: '3', unit_price: '3.335', total_price: '10.03' }),
    ]);
    const issue = report.issues.find((entry) => entry.ruleId === 'CALC-001');
    expect(issue?.calculation).toMatchObject({
      actual: '10.03',
      expected: '10.01',
      difference: '0.02',
    });
  });

  it('CALC-001 accepts a difference equal to the default 0.01 tolerance', async () => {
    const report = await lint([detail({ quantity: 1, unit_price: 10, total_price: 10.01 })]);
    expect(report.issues.some((issue) => issue.ruleId === 'CALC-001')).toBe(false);
  });

  it('CALC-001 honors a configured absolute tolerance', async () => {
    const config = mutableConfig();
    config.calcTolerance = '0.10';
    const report = await lint([detail({ quantity: 1, unit_price: 10, total_price: 10.09 })], {
      config: config as RuleConfig,
    });
    expect(report.issues.some((issue) => issue.ruleId === 'CALC-001')).toBe(false);
  });

  it('FORMULA-001 reports cached Excel formula errors', async () => {
    const report = await lint([detail({ total_price: '#DIV/0!' })], {
      formulas: { '2:8': { expression: 'F2*G2/0', result: { error: '#DIV/0!' }, hasResult: true } },
    });
    expect(report.issues.some((issue) => issue.ruleId === 'FORMULA-001')).toBe(true);
  });

  it('FORMULA-002 reports formulas without cached values but not NUM or CALC', async () => {
    const report = await lint([detail({ total_price: '' })], {
      formulas: { '2:8': { expression: 'F2*G2', hasResult: false } },
    });
    expect(report.issues.some((issue) => issue.ruleId === 'FORMULA-002')).toBe(true);
    expect(
      report.issues.some((issue) => issue.ruleId === 'NUM-001' && issue.field === 'total_price'),
    ).toBe(false);
    expect(report.issues.some((issue) => issue.ruleId === 'CALC-001')).toBe(false);
  });

  it('TEXT-001 warns when item feature is empty', async () => {
    const report = await lint([detail({ item_feature: '' })]);
    expect(report.issues.some((issue) => issue.ruleId === 'TEXT-001')).toBe(true);
  });

  it('CODE-001 warns without modifying a code with whitespace or full-width characters', async () => {
    const raw = ' Ａ01\n';
    const report = await lint([detail({ item_code: raw })]);
    const issue = report.issues.find((entry) => entry.ruleId === 'CODE-001');
    expect(issue?.originalValue).toBe(raw);
  });

  it('STRUCT-001 reports a required field crossing a merged range', async () => {
    const report = await lint([detail()], { mergeRanges: ['B2:B3'] });
    expect(
      report.issues.some((issue) => issue.ruleId === 'STRUCT-001' && issue.field === 'item_code'),
    ).toBe(true);
  });

  it('STRUCT-002 reports hidden detail rows and hidden key columns', async () => {
    const report = await lint([detail()], { hiddenRows: [2], hiddenColumns: [6] });
    const issues = report.issues.filter((issue) => issue.ruleId === 'STRUCT-002');
    expect(issues.some((issue) => issue.rowNumber === 2 && issue.field === null)).toBe(true);
    expect(issues.some((issue) => issue.field === 'quantity')).toBe(true);
  });

  it('can disable a non-core rule', async () => {
    const config = mutableConfig();
    config.rules['TEXT-001']!.enabled = false;
    const report = await lint([detail({ item_feature: '' })], { config: config as RuleConfig });
    expect(report.issues.some((issue) => issue.ruleId === 'TEXT-001')).toBe(false);
  });

  it('returns summary counts and a stable passed-rule count', async () => {
    const report = await lint([detail()]);
    expect(report.summary).toMatchObject({ detailRows: 1, checkedSheets: 1 });
    expect(report.summary.passedRules).toBeGreaterThan(0);
  });

  it('throws a clear error when there are no detail rows', async () => {
    await expect(lint([[null, null, '第一章']])).rejects.toMatchObject({ code: 'NO_DETAIL_ROWS' });
  });

  it('batches 10,000 details and emits monotonic progress through completion', async () => {
    const rows = Array.from({ length: 10_000 }, (_, index) =>
      detail({ serial_no: index + 1, item_code: `CODE-${index + 1}` }),
    );
    const percents: number[] = [];
    const report = await runLint(workbookFixture(rows), {
      mode: 'priced',
      batchSize: 500,
      onProgress: (event) => {
        if (event.stage === 'checking') percents.push(event.percent);
      },
    });
    expect(report.summary.detailRows).toBe(10_000);
    expect(percents.at(-1)).toBe(100);
    expect(percents.every((value, index) => index === 0 || value >= percents[index - 1]!)).toBe(
      true,
    );
  }, 20_000);
});

describe('rule configuration', () => {
  it('ships CALC-001 tolerance 0.01 and all rules enabled', () => {
    expect(DEFAULT_RULE_CONFIG.calcTolerance).toBe('0.01');
    expect(Object.values(DEFAULT_RULE_CONFIG.rules).every((rule) => rule.enabled)).toBe(true);
  });

  it('accepts a valid imported configuration', () => {
    const config = mutableConfig();
    config.rules['TEXT-001']!.enabled = false;
    expect(importRuleConfig(JSON.stringify(config)).rules['TEXT-001'].enabled).toBe(false);
  });

  it('round-trips an exported configuration', () => {
    const config = mutableConfig();
    config.calcTolerance = '0.25';
    expect(importRuleConfig(exportRuleConfig(config as RuleConfig))).toEqual(config);
  });

  it('persists only rule configuration in the supplied browser storage', () => {
    const storage = memoryStorage();
    saveRuleConfig(DEFAULT_RULE_CONFIG, storage);
    expect(loadRuleConfig(storage)).toEqual(DEFAULT_RULE_CONFIG);
    expect(storage.length).toBe(1);
  });

  it('discards invalid locally stored configuration and restores defaults', () => {
    const storage = memoryStorage();
    storage.setItem('boq-lint:rule-config:v1', '{invalid');
    expect(loadRuleConfig(storage)).toBe(DEFAULT_RULE_CONFIG);
    expect(storage.length).toBe(0);
  });

  it('rejects malformed JSON with an understandable core error', () => {
    expect(() => importRuleConfig('{')).toThrow(BoqLintError);
  });

  it('rejects a disabled REQ-001 core rule', () => {
    const config = mutableConfig();
    config.rules['REQ-001']!.enabled = false;
    const result = validateRuleConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toContain('不能关闭');
  });

  it('rejects a disabled NUM-001 core rule', () => {
    const config = mutableConfig();
    config.rules['NUM-001']!.enabled = false;
    expect(validateRuleConfig(config).valid).toBe(false);
  });

  it('rejects negative or non-string tolerances and unknown rules', () => {
    const config = mutableConfig();
    config.calcTolerance = '-0.01';
    config.rules.UNKNOWN = { enabled: true };
    const result = validateRuleConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveLength(2);
  });
});

describe('browser-local workbook loading and snapshotting', () => {
  it('loads an xlsx and snapshots metadata, formulas, hidden rows/columns and merges', async () => {
    const bytes = await xlsxBytes((workbook) => {
      const sheet = workbook.addWorksheet('清单');
      sheet.addRow([...HEADERS]);
      sheet.addRow([...detail()]);
      sheet.getCell('H2').value = { formula: 'F2*G2', result: 25 };
      sheet.getRow(2).hidden = true;
      sheet.getColumn(6).hidden = true;
      sheet.mergeCells('B2:B3');
    });
    const parsed = await parseWorkbook(bytes, { fileName: '本地清单.xlsx' });
    const sheet = parsed.sheets[0]!;
    expect(parsed.file).toMatchObject({
      name: '本地清单.xlsx',
      sheetCount: 1,
      visibleSheetCount: 1,
    });
    expect(sheet.rows[1]?.hidden).toBe(true);
    expect(sheet.hiddenColumns).toContain(6);
    expect(sheet.mergeRanges).toContain('B2:B3');
    expect(sheet.rows[1]?.cells[8]?.formula).toMatchObject({
      hasCachedResult: true,
      cachedResult: 25,
    });
  });

  it('rejects .xls by extension with a clear code', async () => {
    await expect(
      parseWorkbook(new Uint8Array([0x50, 0x4b]), { fileName: 'legacy.xls' }),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_XLS',
    });
  });

  it('recognizes an OLE-wrapped .xlsx as encrypted', async () => {
    const signature = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(parseWorkbook(signature, { fileName: 'protected.xlsx' })).rejects.toMatchObject({
      code: 'ENCRYPTED_WORKBOOK',
    });
  });

  it('rejects an empty file', async () => {
    await expect(parseWorkbook(new Uint8Array(), { fileName: 'empty.xlsx' })).rejects.toMatchObject(
      {
        code: 'EMPTY_FILE',
      },
    );
  });

  it('rejects a corrupt zip-shaped input', async () => {
    await expect(
      parseWorkbook(new Uint8Array([0x50, 0x4b, 0x01, 0x02]), { fileName: 'corrupt.xlsx' }),
    ).rejects.toMatchObject({ code: 'CORRUPT_WORKBOOK' });
  });

  it('rejects an xlsx with no worksheets', async () => {
    const bytes = await xlsxBytes();
    await expect(parseWorkbook(bytes, { fileName: 'empty-workbook.xlsx' })).rejects.toMatchObject({
      code: 'EMPTY_WORKBOOK',
    });
  });

  it('rejects a workbook with no visible worksheet', async () => {
    const bytes = await xlsxBytes((workbook) => {
      workbook.addWorksheet('隐藏').state = 'hidden';
    });
    await expect(parseWorkbook(bytes, { fileName: 'hidden.xlsx' })).rejects.toMatchObject({
      code: 'NO_VISIBLE_SHEET',
    });
  });
});

describe('report exports', () => {
  let report: LintReport;

  beforeEach(async () => {
    report = await lint([detail({ quantity: 1, unit_price: 10, total_price: 20 })]);
  });

  it('creates CSV with a UTF-8 BOM and one row per issue', () => {
    const csv = createCsvReport(report);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split('\r\n')).toHaveLength(report.issues.length + 1);
  });

  it('escapes commas, quotes and newlines in CSV values', async () => {
    const special = await lint([detail({ quantity: '12,"甲"\n续行' })]);
    expect(createCsvReport(special)).toContain('"12,""甲""\n续行"');
  });

  it('exports CSV and JSON as browser Blobs', () => {
    expect(exportCsv(report)).toBeInstanceOf(Blob);
    expect(exportJson(report)).toBeInstanceOf(Blob);
  });

  it('exports the XLSX report as a browser Blob with a readable workbook', async () => {
    const blob = await exportXlsx(report);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const workbook = new ExcelJS.Workbook();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      '检查汇总',
      '问题明细',
      '规则说明',
    ]);
  });

  it('creates the required JSON report structure without workbook row snapshots', () => {
    const payload = JSON.parse(createJsonReport(report)) as Record<string, unknown>;
    expect(payload).toMatchObject({ appVersion: APP_VERSION, mode: 'priced' });
    expect(payload).toHaveProperty('file');
    expect(payload).toHaveProperty('mappings');
    expect(payload).toHaveProperty('ruleConfig');
    expect(payload).toHaveProperty('summary');
    expect(payload).toHaveProperty('issues');
    expect(payload).not.toHaveProperty('rows');
  });

  it('creates an XLSX report with three required sheets, frozen headers and filters', async () => {
    const bytes = await createXlsxReport(report);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      '检查汇总',
      '问题明细',
      '规则说明',
    ]);
    const issues = workbook.getWorksheet('问题明细')!;
    expect(issues.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(issues.autoFilter).toBeTruthy();
    expect(typeof issues.getCell('D2').value).toBe('number');
  });

  it('formats the requested deterministic report filename', () => {
    expect(formatReportFileName('虚构清单.xlsx', new Date(2026, 6, 15, 9, 5))).toBe(
      '虚构清单_BOQLint_检查报告_20260715-0905.xlsx',
    );
  });
});
