import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import {
  APP_VERSION,
  BoqLintError,
  DEFAULT_RULE_CONFIG,
  FIELD_KEYS,
  MAX_XLSX_FILE_SIZE,
  RULE_CONFIG_STORAGE_KEY,
  RULE_DEFINITIONS,
  RULE_IDS,
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
  RuleId,
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

interface FormulaFixture {
  readonly expression: string;
  readonly result?: unknown;
  readonly hasResult: boolean;
}

interface SheetFixtureOptions {
  readonly name?: string;
  readonly index?: number;
  readonly hiddenRows?: readonly number[];
  readonly hiddenColumns?: readonly number[];
  readonly mergeRanges?: readonly string[];
  readonly formulas?: Readonly<Record<string, FormulaFixture>>;
  readonly headerRow?: number;
  readonly visibility?: WorksheetSnapshot['visibility'];
}

interface MutableRuleConfig {
  version: 1;
  calcTolerance: string;
  relativeTolerance: string;
  featureMinLength: number;
  dispersionRatio: string;
  rules: Record<RuleId, { enabled: boolean }>;
}

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

function fixtureText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'symbol') return value.description ?? '';
  if (typeof value === 'function') return '';
  return JSON.stringify(value) ?? '';
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
    const originalValue =
      formula === undefined
        ? value
        : {
            formula: formula.expression,
            ...(formula.hasResult ? { result: formula.result } : {}),
          };
    cells[column] = {
      row: rowNumber,
      column,
      address,
      value: originalValue,
      text:
        formula === undefined
          ? String(value)
          : formula.hasResult && formula.result !== null && formula.result !== undefined
            ? fixtureText(formula.result)
            : '',
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
  for (let row = 1; row < headerRow; row += 1) {
    rows.push(rowSnapshot(row, [`标题 ${row}`], options));
  }
  rows.push(rowSnapshot(headerRow, HEADERS, options));
  dataRows.forEach((values, index) => {
    rows.push(rowSnapshot(headerRow + index + 1, values, options));
  });
  const candidates = detectHeaderCandidates(rows);
  return {
    name: options.name ?? '清单',
    index: options.index ?? 1,
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
    item_code: '010101001001',
    item_name: '虚构演示项目',
    item_feature: '虚构规格与施工做法',
    unit: 'm²',
    quantity: 2,
    unit_price: 12.5,
    total_price: 25,
    remarks: '仅供演示',
    ...overrides,
  };
  return FIELD_KEYS.map((field) => values[field]);
}

function workbookFromSheets(sheets: readonly WorksheetSnapshot[]): ParsedWorkbook {
  return {
    file: {
      name: 'fixture.xlsx',
      size: 1024,
      sheetCount: sheets.length,
      visibleSheetCount: sheets.filter((sheet) => sheet.visibility === 'visible').length,
    },
    sheets,
  };
}

function workbookFixture(
  dataRows: readonly (readonly unknown[])[],
  options: SheetFixtureOptions = {},
): ParsedWorkbook {
  return workbookFromSheets([sheetFixture(dataRows, options)]);
}

function mutableConfig(): MutableRuleConfig {
  return JSON.parse(JSON.stringify(DEFAULT_RULE_CONFIG)) as MutableRuleConfig;
}

function onlyRule(ruleId: RuleId): RuleConfig {
  const config = mutableConfig();
  for (const id of RULE_IDS) config.rules[id].enabled = id === ruleId;
  return config;
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

async function lintOnly(
  ruleId: RuleId,
  rows: readonly (readonly unknown[])[],
  options: SheetFixtureOptions = {},
) {
  return lint(rows, { ...options, config: onlyRule(ruleId) });
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

describe('QG rule catalog and configuration', () => {
  it('publishes QG001-QG014 in one fixed order with the complete rule contract', () => {
    expect(RULE_IDS).toEqual(
      Array.from({ length: 14 }, (_, index) => `QG${String(index + 1).padStart(3, '0')}`),
    );
    expect(RULE_DEFINITIONS.map((rule) => rule.id)).toEqual(RULE_IDS);
    for (const rule of RULE_DEFINITIONS) {
      expect(rule).toMatchObject({
        id: rule.ruleId,
        severity: rule.defaultSeverity,
        enabledByDefault: true,
        core: false,
      });
      expect(rule.name).not.toBe('');
      expect(rule.description).not.toBe('');
      expect(rule.category).not.toBe('');
      expect(rule.applicableRowTypes.length).toBeGreaterThan(0);
      expect(rule.check).toBeTypeOf('function');
      expect(rule.remediation).not.toBe('');
      expect(RULE_METADATA[rule.id]).toBe(rule);
    }
  });

  it('uses the required centralized defaults and enables every rule', () => {
    expect(DEFAULT_RULE_CONFIG).toMatchObject({
      calcTolerance: '0.01',
      relativeTolerance: '0.001',
      featureMinLength: 6,
      dispersionRatio: '0.5',
    });
    expect(Object.values(DEFAULT_RULE_CONFIG.rules).every((rule) => rule.enabled)).toBe(true);
  });

  it('allows every rule to be independently disabled', async () => {
    const config = mutableConfig();
    for (const id of RULE_IDS) config.rules[id].enabled = false;
    expect(validateRuleConfig(config)).toMatchObject({ valid: true });
    const report = await lint([detail({ item_name: '', unit: '', quantity: -1 })], {
      config,
    });
    expect(report.issues).toHaveLength(0);
    expect(report.summary.passedRules).toBe(0);
  });

  it('round-trips and persists the expanded rule configuration', () => {
    const config = mutableConfig();
    config.relativeTolerance = '0.002';
    config.featureMinLength = 8;
    config.dispersionRatio = '0.75';
    config.rules.QG001.enabled = false;
    expect(importRuleConfig(exportRuleConfig(config))).toEqual(config);

    const storage = memoryStorage();
    saveRuleConfig(config, storage);
    expect(loadRuleConfig(storage)).toEqual(config);
  });

  it('rejects missing thresholds, negative ratios and unknown rules', () => {
    const config = mutableConfig() as MutableRuleConfig & { UNKNOWN?: { enabled: boolean } };
    config.relativeTolerance = '-0.1';
    config.featureMinLength = 0;
    config.UNKNOWN = { enabled: true };
    const result = validateRuleConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.errors.join(' ')).toMatch(/relativeTolerance|featureMinLength|未知规则/u);
  });

  it('rejects malformed config JSON and clears a corrupted saved config', () => {
    expect(() => importRuleConfig('{"version":')).toThrow(BoqLintError);

    const storage = memoryStorage();
    storage.setItem(RULE_CONFIG_STORAGE_KEY, '{"version":0}');
    expect(loadRuleConfig(storage)).toBe(DEFAULT_RULE_CONFIG);
    expect(storage.getItem(RULE_CONFIG_STORAGE_KEY)).toBeNull();
  });

  it('reports non-object configs, malformed decimal strings and invalid rule switches', () => {
    expect(validateRuleConfig(null)).toEqual({
      valid: false,
      errors: ['配置必须是 JSON 对象。'],
    });
    const valid = mutableConfig();
    const invalid = {
      ...valid,
      calcTolerance: ' 0.01',
      rules: { ...valid.rules, QG001: { enabled: 'yes' } },
    };
    const result = validateRuleConfig(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.join(' ')).toMatch(/calcTolerance|QG001\.enabled/u);
    }
  });
});

describe('header detection and aliases', () => {
  it('normalizes Chinese/full-width headers and maps all standard aliases', () => {
    expect(normalizeHeader('  ITEM\nNAME： ')).toBe('itemname');
    expect(
      mapHeaderValues([
        '编号',
        '清单编码',
        '清单名称',
        '项目特征描述',
        '单位',
        '数量',
        '单价',
        '金额',
        '说明',
      ]),
    ).toEqual(MAPPING);
    expect(resolveHeaderField('编号')).toBe('serial_no');
  });

  it('scans the first 50 rows but not row 51', () => {
    expect(detectHeaderCandidates([rowSnapshot(50, HEADERS)])[0]?.rowNumber).toBe(50);
    expect(detectHeaderCandidates([rowSnapshot(51, HEADERS)])).toHaveLength(0);
  });

  it('supports a manually selected header after the automatic scan window', () => {
    const candidate = mapWorksheetHeader(
      { rows: [rowSnapshot(1, ['说明']), rowSnapshot(75, HEADERS)] },
      75,
    );
    expect(candidate).toMatchObject({ rowNumber: 75, manual: true, mapping: MAPPING });
  });
});

describe('row classification and reasons', () => {
  function mapped(row: readonly unknown[]) {
    return mapSheetRows(sheetFixture([row]), MAPPING, 1)[0]!;
  }

  it('classifies item, section, subtotal, note, blank and repeated-header rows', () => {
    expect(mapped(detail()).type).toBe('item');
    expect(mapped([null, null, '第一章 土建工程']).type).toBe('section');
    expect(mapped([null, null, '本页合计', null, null, null, null, 25]).type).toBe('subtotal');
    expect(mapped([null, null, null, null, null, null, null, null, '备注：仅供说明']).type).toBe(
      'note',
    );
    expect(mapped([]).type).toBe('blank');
    expect(mapped(HEADERS).type).toBe('repeated_header');
  });

  it('treats a no-code row with multiple core fields as an item and records a reason', () => {
    const row = mapped([1, '', '补充项目', '虚构完整特征', '项', 2]);
    expect(row.type).toBe('item');
    expect(row.classificationReason).toContain('多个核心字段');
  });

  it('does not let feature text or broad chapter characters hide a valid no-code item', () => {
    expect(mapped([1, '', '无编码合法项目', '各层合计厚度20mm', 'm²', 2]).type).toBe('item');
    expect(mapped([2, '', '节能门窗安装', '虚构完整特征', 'm²', 3]).type).toBe('item');
    expect(mapped([null, null, '本页合计', null, null, null, null, 25]).type).toBe('subtotal');
  });

  it('recognizes an explicit note before weak item evidence but keeps strong item evidence', () => {
    expect(mapped([null, null, '备注：本表单位约定', null, 'm²']).type).toBe('note');
    expect(mapped([1, null, '备注性演示项目', '虚构完整特征', 'm²', 2]).type).toBe('item');
    expect(mapped([1, '010101001001', '备注：作为项目名称', '虚构完整特征', '项']).type).toBe(
      'item',
    );
  });

  it('does not apply required rules to section, subtotal or note rows', async () => {
    const report = await lint([
      [null, null, '第一章'],
      [null, null, '合计', null, null, null, null, 25],
      [null, null, null, null, null, null, null, null, '备注：说明'],
      detail(),
    ]);
    expect(report.summary.detailRows).toBe(1);
    expect(report.issues).toHaveLength(0);
  });
});

describe('number cleaning and Decimal arithmetic', () => {
  it.each([
    ['1,234.56', '1234.56'],
    ['１２３４．５６', '1234.56'],
    ['十二点五', '12.5'],
    ['负一百二十三点四五', '-123.45'],
    ['两千零二', '2002'],
    ['(1,234.56)', '-1234.56'],
  ])('parses %s as %s', (source, expected) => {
    expect(parseLocaleNumber(source).normalized).toBe(expected);
  });

  it.each(['约 12 元', '12,34.56', '(-12)', '十二米'])('rejects non-numeric input %s', (source) => {
    expect(parseLocaleNumber(source).valid).toBe(false);
  });

  it('uses Decimal and half-up money rounding', () => {
    expect(calculateTotal('0.1', '0.2')?.toFixed(2)).toBe('0.02');
    expect(calculateTotal('1', '1.005')?.toFixed(2)).toBe('1.01');
  });
});

describe('QG001-QG006 row rules', () => {
  it('QG001 reports a missing item name as error', async () => {
    const issue = (await lintOnly('QG001', [detail({ item_name: '' })])).issues[0];
    expect(issue).toMatchObject({ ruleId: 'QG001', severity: 'error', field: 'item_name' });
  });

  it('QG002 reports a missing unit as error', async () => {
    const issue = (await lintOnly('QG002', [detail({ unit: '' })])).issues[0];
    expect(issue).toMatchObject({ ruleId: 'QG002', severity: 'error', field: 'unit' });
  });

  it('QG003 reports invalid and negative quantities, but excludes zero', async () => {
    const report = await lintOnly('QG003', [
      detail({ item_code: '010101001001', quantity: '约12' }),
      detail({ item_code: '010101001002', quantity: -1 }),
      detail({ item_code: '010101001003', quantity: 0 }),
    ]);
    expect(report.issues).toHaveLength(2);
    expect(report.issues.every((issue) => issue.severity === 'error')).toBe(true);
    expect(report.issues.map((issue) => issue.rowNumber)).toEqual([2, 3]);
  });

  it('QG004 reports only zero quantity as warning', async () => {
    const report = await lintOnly('QG004', [
      detail({ item_code: '010101001001', quantity: 0 }),
      detail({ item_code: '010101001002', quantity: -1 }),
    ]);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({ ruleId: 'QG004', severity: 'warning', rowNumber: 2 });
  });

  it('QG005 warns for missing code and explains template differences', async () => {
    const issue = (await lintOnly('QG005', [detail({ item_code: '' })])).issues[0];
    expect(issue).toMatchObject({ ruleId: 'QG005', severity: 'warning', field: 'item_code' });
    expect(issue?.message).toMatch(/地区、行业或企业模板/u);
  });

  it('QG006 checks the whitespace-stripped 12-digit format as info', async () => {
    const report = await lintOnly('QG006', [
      detail({ item_code: ' 010101001001 ' }),
      detail({ item_code: 'DEMO-001' }),
    ]);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({ ruleId: 'QG006', severity: 'info', rowNumber: 3 });
    expect(report.issues[0]?.message).toMatch(/不同地区、行业和企业模板/u);
  });
});

describe('QG007-QG009 duplicate and text rules', () => {
  it('QG007 reports every duplicate-code row with all related rows and isolates sheets', async () => {
    const sheetA = sheetFixture(
      [
        detail({ item_code: '010101001001', item_name: '项目甲' }),
        detail({ item_code: '010101001001', item_name: '项目乙', serial_no: 2 }),
      ],
      { name: '甲表', index: 1 },
    );
    const sheetB = sheetFixture([detail({ item_code: '010101001001' })], {
      name: '乙表',
      index: 2,
    });
    const report = await runLint(workbookFromSheets([sheetA, sheetB]), {
      mode: 'priced',
      config: onlyRule('QG007'),
    });
    expect(report.issues).toHaveLength(2);
    expect(report.issues.every((issue) => issue.sheetName === '甲表')).toBe(true);
    expect(report.issues.every((issue) => JSON.stringify(issue.relatedRows) === '[2,3]')).toBe(
      true,
    );
  });

  it('QG008 fingerprints normalized name + feature + unit regardless of code or price', async () => {
    const report = await lintOnly('QG008', [
      detail({ item_code: '010101001001', quantity: 1, unit_price: 10, total_price: 10 }),
      detail({
        item_code: '010101001002',
        item_name: ' 虚构演示 项目 ',
        item_feature: '虚构规格与施工做法',
        unit: ' m² ',
        quantity: 9,
        unit_price: 99,
        total_price: 891,
      }),
    ]);
    expect(report.issues).toHaveLength(2);
    expect(report.issues[0]?.relatedRows).toEqual([2, 3]);
    expect(report.issues[0]?.message).toContain('不自动认定为重复列项');
  });

  it('QG009 detects empty, short and placeholder features with a centralized threshold', async () => {
    const report = await lintOnly('QG009', [
      detail({ item_code: '010101001001', item_feature: '' }),
      detail({ item_code: '010101001002', item_feature: '短。' }),
      detail({ item_code: '010101001003', item_feature: ' 详见图纸。' }),
      detail({ item_code: '010101001004', item_feature: '虚构完整项目特征' }),
    ]);
    expect(report.issues).toHaveLength(3);

    const config = mutableConfig();
    for (const id of RULE_IDS) config.rules[id].enabled = id === 'QG009';
    config.featureMinLength = 1;
    const permissive = await lint([detail({ item_feature: '短。' })], {
      config,
    });
    expect(permissive.issues).toHaveLength(0);
  });

  it('QG009 catches placeholder templates with generic wrappers without flagging real detail', async () => {
    const report = await lintOnly('QG009', [
      detail({ item_code: '010101001001', item_feature: '项目特征详见图纸' }),
      detail({ item_code: '010101001002', item_feature: '具体做法按图施工' }),
      detail({
        item_code: '010101001003',
        item_feature: 'C30 混凝土，节点位置详见图纸，厚度 120mm',
      }),
    ]);
    expect(report.issues.map((issue) => issue.rowNumber)).toEqual([2, 3]);
    expect(report.issues.every((issue) => issue.message.includes('占位表达'))).toBe(true);
  });
});

describe('QG010-QG012 amount and pricing rules', () => {
  it('QG010 uses max(absolute 0.01, abs(total) × 0.1%) with Decimal', async () => {
    const report = await lintOnly('QG010', [
      detail({
        item_code: '010101001001',
        quantity: 1,
        unit_price: 10_000,
        total_price: 10_005,
      }),
      detail({
        item_code: '010101001002',
        quantity: 1,
        unit_price: 10_000,
        total_price: 10_020,
      }),
    ]);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      ruleId: 'QG010',
      severity: 'error',
      rowNumber: 3,
      calculation: {
        actual: '10020',
        expected: '10000',
        difference: '20',
        tolerance: '10.02',
      },
    });
  });

  it('QG010 accepts a difference equal to the active tolerance', async () => {
    const report = await lintOnly('QG010', [
      detail({ quantity: 1, unit_price: 10, total_price: 10.01 }),
    ]);
    expect(report.issues).toHaveLength(0);
  });

  it('QG011 warns for zero and negative unit prices with business context', async () => {
    const report = await lintOnly('QG011', [
      detail({ item_code: '010101001001', unit_price: 0, total_price: 0 }),
      detail({ item_code: '010101001002', unit_price: -2, total_price: -4 }),
      detail({ item_code: '010101001003', unit_price: 1, total_price: 2 }),
    ]);
    expect(report.issues).toHaveLength(2);
    expect(report.issues.every((issue) => issue.severity === 'warning')).toBe(true);
    expect(report.issues[0]?.message).toMatch(/赠送项、抵扣项或暂不计价项/u);
  });

  it('QG012 uses a non-zero median for groups of at least four and a strict 50% threshold', async () => {
    const prices = [100, 100, 100, 200];
    const rows = prices.map((price, index) =>
      detail({
        serial_no: index + 1,
        item_code: `01010100100${index + 1}`,
        item_name: '同类虚构项目',
        unit: '项',
        unit_price: price,
        total_price: price * 2,
      }),
    );
    const report = await lintOnly('QG012', rows);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({ ruleId: 'QG012', severity: 'info', rowNumber: 5 });
    expect(report.issues[0]?.relatedRows).toEqual([2, 3, 4, 5]);

    const config = mutableConfig();
    for (const id of RULE_IDS) config.rules[id].enabled = id === 'QG012';
    config.dispersionRatio = '1';
    expect((await lint(rows, { config })).issues).toHaveLength(0);
  });

  it('QG012 skips a group whose median is zero', async () => {
    const report = await lintOnly(
      'QG012',
      [-10, 0, 0, 10].map((price, index) =>
        detail({
          item_code: `01010100100${index + 1}`,
          item_name: '零中位数组',
          unit: '项',
          unit_price: price,
        }),
      ),
    );
    expect(report.issues).toHaveLength(0);
  });
});

describe('QG013-QG014 formula and structure rules', () => {
  it('QG013 warns only when a formula has no usable cached result', async () => {
    const report = await lintOnly(
      'QG013',
      [
        detail({ item_code: '010101001001', total_price: '' }),
        detail({ item_code: '010101001002', total_price: 25 }),
      ],
      {
        formulas: {
          '2:8': { expression: 'F2*G2', hasResult: false },
          '3:8': { expression: 'F3*G3', result: 25, hasResult: true },
        },
      },
    );
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      ruleId: 'QG013',
      severity: 'warning',
      rowNumber: 2,
      field: 'total_price',
      cellAddress: 'H2',
    });
    expect(report.issues[0]?.remediation).toMatch(/Excel 或 WPS/u);
  });

  it('QG013 preserves an unmapped formula address and exports a non-empty location', async () => {
    const bytes = await xlsxBytes((workbook) => {
      const sheet = workbook.addWorksheet('追溯');
      sheet.addRow([...HEADERS, '辅助公式']);
      sheet.addRow([...detail(), null]);
      sheet.getCell('J2').value = { formula: 'F2*G2' };
    });
    const parsed = await parseWorkbook(bytes, { fileName: 'trace.xlsx' });
    const report = await runLint(parsed, { mode: 'priced', config: onlyRule('QG013') });
    expect(report.issues[0]).toMatchObject({
      field: null,
      column: 10,
      cellAddress: 'J2',
      originalValue: 'F2*G2',
    });
    expect(createCsvReport(report)).toContain('单元格 J2');
  });

  it('QG014 reports hidden rows, mapped hidden columns and data merges as info', async () => {
    const report = await lintOnly('QG014', [detail()], {
      hiddenRows: [2],
      hiddenColumns: [6],
      mergeRanges: ['A1:I1', 'B2:B3'],
    });
    expect(report.issues).toHaveLength(3);
    expect(report.issues.every((issue) => issue.severity === 'info')).toBe(true);
    expect(report.issues.some((issue) => issue.rowNumber === 1 && issue.field === 'quantity')).toBe(
      true,
    );
    expect(
      report.issues.some(
        (issue) =>
          issue.rowNumber === 2 &&
          issue.field === 'serial_no' &&
          issue.cellAddress === 'A2' &&
          issue.originalValue === 1,
      ),
    ).toBe(true);
    expect(report.issues.some((issue) => issue.field === 'item_code')).toBe(true);
    expect(report.issues.every((issue) => !issue.message.includes('A1:I1'))).toBe(true);
  });

  it('QG014 emits only one issue per merged range and mapped field', async () => {
    const report = await lintOnly(
      'QG014',
      [detail(), detail({ item_code: '010101001002', serial_no: 2 })],
      { mergeRanges: ['B2:B3'] },
    );
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.cellAddress).toBe('B2');
  });
});

describe('rule engine ordering, tracing and progress', () => {
  it('emits issues in fixed rule order with category and exact source tracing', async () => {
    const report = await lint([
      detail({
        item_code: 'DEMO',
        item_name: '',
        item_feature: '同上',
        unit: '',
        quantity: -1,
        unit_price: 0,
        total_price: 99,
      }),
    ]);
    const indexes = report.issues.map((issue) => RULE_IDS.indexOf(issue.ruleId));
    expect(indexes.every((value, index) => index === 0 || value >= indexes[index - 1]!)).toBe(true);
    for (const issue of report.issues) {
      expect(issue.sheetName).toBe('清单');
      expect(issue.rowNumber).toBeGreaterThan(1);
      expect(issue.category).not.toBe('');
      expect(issue.originalValue).not.toBeUndefined();
    }
  });

  it('deduplicates the same rule and cell', async () => {
    const report = await lintOnly('QG014', [detail(), detail({ item_code: '010101001002' })], {
      mergeRanges: ['B2:B3'],
    });
    const keys = report.issues.map(
      (issue) => `${issue.ruleId}|${issue.sheetName}|${issue.cellAddress ?? issue.rowNumber}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reports a clean item with no issues and emits checking completion', async () => {
    const percents: number[] = [];
    const report = await runLint(workbookFixture([detail()]), {
      mode: 'priced',
      onProgress: (event) => {
        if (event.stage === 'checking') percents.push(event.percent);
      },
    });
    expect(report.issues).toHaveLength(0);
    expect(report.summary).toMatchObject({ detailRows: 1, checkedSheets: 1, passedRules: 14 });
    expect(percents.at(-1)).toBe(100);
  });

  it('throws a clear error when no item row exists', async () => {
    await expect(lint([[null, null, '第一章']])).rejects.toMatchObject({
      code: 'NO_DETAIL_ROWS',
    });
  });
});

describe('browser-local workbook parsing limits', () => {
  it('loads and snapshots an xlsx entirely from bytes', async () => {
    const bytes = await xlsxBytes((workbook) => {
      const sheet = workbook.addWorksheet('清单');
      sheet.addRow([...HEADERS]);
      sheet.addRow([...detail()]);
      sheet.getRow(2).hidden = true;
      sheet.getColumn(6).hidden = true;
      sheet.mergeCells('B2:B3');
    });
    const parsed = await parseWorkbook(bytes, { fileName: 'fixture.xlsx' });
    expect(parsed.file).toMatchObject({ name: 'fixture.xlsx', sheetCount: 1 });
    expect(parsed.sheets[0]?.detectedHeaderRow).toBe(1);
    expect(parsed.sheets[0]?.hiddenColumns).toContain(6);
    expect(parsed.sheets[0]?.mergeRanges).toContain('B2:B3');
  });

  it('rejects non-xlsx extensions before parsing', async () => {
    const zipPrefix = new Uint8Array([0x50, 0x4b]);
    await expect(parseWorkbook(zipPrefix, { fileName: 'fixture.xls' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_XLS',
    });
    await expect(parseWorkbook(zipPrefix, { fileName: 'fixture.xlsm' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
    await expect(parseWorkbook(zipPrefix, { fileName: 'fixture.pdf' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
  });

  it('enforces the 20MB hard limit before ExcelJS parsing', async () => {
    const bytes = new Uint8Array(MAX_XLSX_FILE_SIZE + 1);
    bytes[0] = 0x50;
    bytes[1] = 0x4b;
    await expect(parseWorkbook(bytes, { fileName: 'large.xlsx' })).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
  });

  it('distinguishes empty and corrupt xlsx files', async () => {
    await expect(parseWorkbook(new Uint8Array(), { fileName: 'empty.xlsx' })).rejects.toMatchObject(
      { code: 'EMPTY_FILE' },
    );
    await expect(
      parseWorkbook(new Uint8Array([1, 2, 3]), { fileName: 'broken.xlsx' }),
    ).rejects.toMatchObject({ code: 'CORRUPT_WORKBOOK' });
  });

  it('identifies an OLE-wrapped xlsx as encrypted or password protected', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(parseWorkbook(ole, { fileName: 'protected.xlsx' })).rejects.toMatchObject({
      code: 'ENCRYPTED_WORKBOOK',
    });
  });

  it('distinguishes an empty workbook from one with no visible worksheets', async () => {
    const empty = await xlsxBytes();
    await expect(parseWorkbook(empty, { fileName: 'empty-workbook.xlsx' })).rejects.toMatchObject({
      code: 'EMPTY_WORKBOOK',
    });

    const hidden = await xlsxBytes((workbook) => {
      workbook.addWorksheet('隐藏清单').state = 'hidden';
    });
    await expect(parseWorkbook(hidden, { fileName: 'hidden.xlsx' })).rejects.toMatchObject({
      code: 'NO_VISIBLE_SHEET',
    });
  });

  it('keeps a visible sheet without a recognizable header available for manual mapping', async () => {
    const bytes = await xlsxBytes((workbook) => {
      workbook.addWorksheet('待映射').addRow(['项目说明', '请手动选择表头']);
    });
    const parsed = await parseWorkbook(bytes, { fileName: 'manual-mapping.xlsx' });
    expect(parsed.sheets[0]).toMatchObject({
      name: '待映射',
      suggestedMapping: {},
      headerCandidates: [],
    });
    expect(parsed.sheets[0]?.detectedHeaderRow).toBeUndefined();
  });

  it('snapshots rich text, hyperlinks, errors and cached formulas without executing them', async () => {
    const bytes = await xlsxBytes((workbook) => {
      const sheet = workbook.addWorksheet('复杂单元格');
      sheet.addRow([...HEADERS]);
      const row = sheet.addRow([...detail()]);
      row.getCell(3).value = { richText: [{ text: '富文本' }, { text: '项目' }] };
      row.getCell(4).value = { text: '查看说明', hyperlink: 'https://example.invalid/spec' };
      row.getCell(5).value = { error: '#N/A' };
      row.getCell(8).value = { formula: 'F2*G2', result: 25 };
    });
    const parsed = await parseWorkbook(bytes, { fileName: 'cell-values.xlsx' });
    const cells = parsed.sheets[0]?.rows[1]?.cells;
    expect(cells?.[3]?.value).toBe('富文本项目');
    expect(cells?.[4]?.value).toBe('查看说明');
    expect(cells?.[5]?.value).toEqual({ error: '#N/A' });
    expect(cells?.[8]?.formula).toMatchObject({ hasCachedResult: true, cachedResult: 25 });
  });
});

describe('safe report exports', () => {
  async function reportWithIssue(): Promise<LintReport> {
    return lintOnly('QG003', [detail({ quantity: -1 })]);
  }

  it('neutralizes =, +, -, and @ after leading whitespace in CSV text', async () => {
    const report = await reportWithIssue();
    const issue = report.issues[0]!;
    const injected = ['=2+2', ' +SUM(A1:A2)', '-2+3', '\t@cmd'].map((value, index) => ({
      ...issue,
      id: `injected-${index}`,
      itemName: value,
      originalValue: value,
      message: value,
      remediation: value,
    }));
    const csv = createCsvReport({ ...report, issues: injected });
    expect(csv).toContain("'=2+2");
    expect(csv).toContain(" '+SUM(A1:A2)");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("\t'@cmd");
  });

  it('keeps numeric negatives numeric while escaping CSV delimiters', async () => {
    const report = await reportWithIssue();
    const issue = report.issues[0]!;
    const csv = createCsvReport({
      ...report,
      issues: [{ ...issue, originalValue: -12, message: '含,逗号和"引号"\n换行' }],
    });
    expect(csv).toContain(',-12,');
    expect(csv).toContain('"含,逗号和""引号""\n换行"');
  });

  it('exports useful row, column and field fallbacks when a cell address is unavailable', async () => {
    const report = await reportWithIssue();
    const issue = report.issues[0]!;
    const rowLocation = { ...issue, id: 'row-location', field: null, column: null };
    const columnLocation = { ...issue, id: 'column-location', field: null, column: 10 };
    const fieldLocation = {
      ...issue,
      id: 'field-location',
      field: 'quantity' as const,
      column: null,
    };
    delete rowLocation.cellAddress;
    delete columnLocation.cellAddress;
    delete fieldLocation.cellAddress;
    const csv = createCsvReport({
      ...report,
      issues: [rowLocation, columnLocation, fieldLocation],
    });
    expect(csv).toContain(',第 2 行,');
    expect(csv).toContain(',第 10 列,');
    expect(csv).toContain(',工程量,');
  });

  it('returns browser download blobs for CSV, JSON and XLSX reports', async () => {
    const report = await reportWithIssue();
    const csv = exportCsv(report);
    const json = exportJson(report);
    const xlsx = await exportXlsx(report);
    expect(csv.type).toBe('text/csv;charset=utf-8');
    expect(await csv.text()).toContain('QG003');
    expect(json.type).toBe('application/json;charset=utf-8');
    expect(JSON.parse(await json.text())).toMatchObject({ issues: [{ ruleId: 'QG003' }] });
    expect(xlsx.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(xlsx.size).toBeGreaterThan(0);
  });

  it('exports JSON without raw row snapshots and XLSX with three report sheets', async () => {
    const report = await reportWithIssue();
    const json = createJsonReport(report);
    expect(JSON.parse(json)).toMatchObject({
      appVersion: APP_VERSION,
      issues: [{ ruleId: 'QG003' }],
    });
    expect(json).not.toContain('"rows"');

    const bytes = await createXlsxReport(report);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.creator).toBe('BOQ Lint');
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      '检查汇总',
      '问题明细',
      '规则说明',
    ]);
    expect(workbook.getWorksheet('规则说明')?.getCell('A2').value).toBe('QG001');
  });

  it('uses the BOQ Lint brand consistently in report file names', () => {
    expect(formatReportFileName('fixture.xlsx', new Date(2026, 6, 17, 9, 5))).toBe(
      'fixture_BOQ_Lint_检查报告_20260717-0905.xlsx',
    );
    expect(formatReportFileName('', new Date(2026, 6, 17, 9, 5))).toBe(
      '工程量清单_BOQ_Lint_检查报告_20260717-0905.xlsx',
    );
  });
});

describe('public error and version contracts', () => {
  it('retains the v0.1.0 version and typed core errors', () => {
    expect(APP_VERSION).toBe('0.1.0');
    expect(new BoqLintError('FILE_TOO_LARGE')).toMatchObject({
      name: 'BoqLintError',
      code: 'FILE_TOO_LARGE',
    });
  });
});
