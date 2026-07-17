import Decimal from 'decimal.js';

import { fieldLabel } from './fields';
import { parseLocaleNumber } from './numbers';
import { hasUsableFormulaResult, isMissing, normalizeComparable, normalizeText } from './rows';
import type {
  FieldKey,
  LintRule,
  MappedCell,
  MappedRow,
  RowType,
  RuleCategory,
  RuleContext,
  RuleFinding,
  RuleId,
  Severity,
} from './types';
import { FIELD_KEYS, RULE_IDS } from './types';

const ITEM_ROWS = ['item'] as const satisfies readonly RowType[];
const DATA_ROWS = ['item', 'section', 'subtotal', 'note'] as const satisfies readonly RowType[];
const PLACEHOLDER_FEATURES = new Set([
  '详见图纸',
  '同上',
  '见设计',
  '按图施工',
  '详见设计',
  '见图纸',
]);
const PLACEHOLDER_FEATURE_TEMPLATE =
  /^(?:(?:项目)?特征|主要内容为|具体做法|施工做法|做法|内容|要求)?(?:详见图纸|同上|见设计|按图施工|详见设计|见图纸)(?:为准|执行|即可|等)?$/u;

function cellFor(row: MappedRow, field: FieldKey): MappedCell | undefined {
  return row.cells[field];
}

function traceableCell(row: MappedRow): readonly [FieldKey, MappedCell] | undefined {
  const available: [FieldKey, MappedCell][] = [];
  for (const field of FIELD_KEYS) {
    const cell = cellFor(row, field);
    if (cell !== undefined && (!isMissing(cell.value) || cell.formula !== undefined)) {
      available.push([field, cell]);
    }
  }
  return available.find(([, cell]) => !cell.merged) ?? available[0];
}

function excelAddress(row: number, column: number): string {
  let letters = '';
  let current = column;
  while (current > 0) {
    current -= 1;
    letters = String.fromCharCode(65 + (current % 26)) + letters;
    current = Math.floor(current / 26);
  }
  return `${letters}${row}`;
}

function formulaUnavailable(cell: MappedCell | undefined): boolean {
  return cell?.formula !== undefined && !hasUsableFormulaResult(cell.formula);
}

function missingMappedValue(cell: MappedCell | undefined): boolean {
  if (formulaUnavailable(cell)) return false;
  return cell === undefined || isMissing(cell.value);
}

function finding(
  row: MappedRow,
  field: FieldKey | null,
  message: string,
  extras: Omit<RuleFinding, 'rowNumber' | 'field' | 'message'> = {},
): RuleFinding {
  const cell = field === null ? undefined : cellFor(row, field);
  return {
    rowNumber: row.rowNumber,
    field,
    ...(cell === undefined
      ? {}
      : {
          column: cell.column,
          cellAddress: cell.address,
          originalValue: cell.originalValue,
        }),
    ...extras,
    message,
  };
}

function normalizeCode(value: unknown): string {
  return normalizeText(value).replace(/\s+/gu, '');
}

function groupRows(
  rows: readonly MappedRow[],
  keyFor: (row: MappedRow) => string,
): ReadonlyMap<string, readonly MappedRow[]> {
  const groups = new Map<string, MappedRow[]>();
  for (const row of rows) {
    const key = keyFor(row);
    if (key.length === 0) continue;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [row]);
    else group.push(row);
  }
  return groups;
}

function normalizedFeature(value: unknown): string {
  return normalizeText(value).replace(/[\p{P}\p{S}\s]/gu, '');
}

function validNumberCell(row: MappedRow, field: FieldKey) {
  const cell = cellFor(row, field);
  if (cell === undefined || formulaUnavailable(cell) || isMissing(cell.value)) return undefined;
  const parsed = parseLocaleNumber(cell.value);
  return parsed.valid ? { cell, decimal: parsed.decimal! } : undefined;
}

function median(values: readonly Decimal[]): Decimal {
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return sorted[middle - 1]!.plus(sorted[middle]!).dividedBy(2);
}

interface RuleSeed {
  readonly id: RuleId;
  readonly name: string;
  readonly description: string;
  readonly severity: Severity;
  readonly category: RuleCategory;
  readonly applicableRowTypes: readonly RowType[];
  readonly check: (context: RuleContext) => readonly RuleFinding[];
  readonly remediation: string;
}

function defineRule(seed: RuleSeed): LintRule {
  return Object.freeze({
    ...seed,
    ruleId: seed.id,
    defaultSeverity: seed.severity,
    enabledByDefault: true,
    core: false,
  });
}

export const RULE_DEFINITIONS: readonly LintRule[] = [
  defineRule({
    id: 'QG001',
    name: '项目名称缺失',
    description: '检查清单项目行是否缺少项目名称。',
    severity: 'error',
    category: 'required',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows }) =>
      itemRows
        .filter((row) => missingMappedValue(cellFor(row, 'item_name')))
        .map((row) => finding(row, 'item_name', '清单项目行缺少项目名称。')),
    remediation: '补充项目名称，并确认项目名称字段映射正确。',
  }),
  defineRule({
    id: 'QG002',
    name: '计量单位缺失',
    description: '检查清单项目行是否缺少计量单位。',
    severity: 'error',
    category: 'required',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows }) =>
      itemRows
        .filter((row) => missingMappedValue(cellFor(row, 'unit')))
        .map((row) => finding(row, 'unit', '清单项目行缺少计量单位。')),
    remediation: '补充计量单位，并确认计量单位字段映射正确。',
  }),
  defineRule({
    id: 'QG003',
    name: '工程量无效',
    description: '工程量不是有限数值或小于零；零工程量由 QG004 单独提示。',
    severity: 'error',
    category: 'quantity',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows }) =>
      itemRows.flatMap((row) => {
        const cell = cellFor(row, 'quantity');
        if (formulaUnavailable(cell)) return [];
        const parsed = parseLocaleNumber(cell?.value);
        if (!parsed.valid) {
          return [finding(row, 'quantity', '工程量不是有效的有限数值。')];
        }
        if (parsed.decimal!.lessThan(0)) {
          return [
            finding(row, 'quantity', `工程量 ${parsed.normalized ?? ''} 小于零。`, {
              originalValue: cell?.originalValue,
            }),
          ];
        }
        return [];
      }),
    remediation: '将工程量改为有效的非负有限数值；如为调整项，请核对业务表达方式。',
  }),
  defineRule({
    id: 'QG004',
    name: '零工程量',
    description: '检查工程量等于零的清单项目行。',
    severity: 'warning',
    category: 'quantity',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows }) =>
      itemRows.flatMap((row) => {
        const value = validNumberCell(row, 'quantity');
        return value?.decimal.equals(0) === true
          ? [finding(row, 'quantity', '工程量等于零，请确认该清单项是否需要保留。')]
          : [];
      }),
    remediation: '核实零工程量的业务原因；不需要的清单项可在原文件或计价软件中处理。',
  }),
  defineRule({
    id: 'QG005',
    name: '项目编码缺失',
    description: '提示清单项目行缺少项目编码，不直接认定为违规。',
    severity: 'warning',
    category: 'code',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows }) =>
      itemRows
        .filter((row) => missingMappedValue(cellFor(row, 'item_code')))
        .map((row) =>
          finding(
            row,
            'item_code',
            '项目编码为空；补充项目及不同地区、行业或企业模板可能采用不同编码方式，请结合实际复核。',
          ),
        ),
    remediation: '结合项目所在地、行业及企业模板要求确认是否需要补充项目编码。',
  }),
  defineRule({
    id: 'QG006',
    name: '编码格式可疑',
    description: '项目编码去除空白后不是常见的 12 位数字格式。',
    severity: 'info',
    category: 'code',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows }) =>
      itemRows.flatMap((row) => {
        const cell = cellFor(row, 'item_code');
        if (missingMappedValue(cell) || formulaUnavailable(cell)) return [];
        const code = normalizeCode(cell?.value);
        if (/^\d{12}$/u.test(code)) return [];
        return [
          finding(
            row,
            'item_code',
            '项目编码去除空白后不是常见的 12 位数字格式；不同地区、行业和企业模板可能采用其他编码方式，仅提示复核。',
          ),
        ];
      }),
    remediation: '人工核对编码格式及适用模板；工具不会据此自动认定违规或修改原值。',
  }),
  defineRule({
    id: 'QG007',
    name: '重复项目编码',
    description: '同一工作表内相同的非空项目编码出现多次。',
    severity: 'warning',
    category: 'duplicate',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows }) => {
      const groups = groupRows(itemRows, (row) => normalizeCode(row.values.item_code));
      const results: RuleFinding[] = [];
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const relatedRows = group.map((row) => row.rowNumber);
        for (const row of group) {
          results.push(
            finding(
              row,
              'item_code',
              `同一工作表内项目编码重复，相关 Excel 行：${relatedRows.join('、')}。`,
              { relatedRows },
            ),
          );
        }
      }
      return results;
    },
    remediation: '逐行核对重复编码；确认是合理拆分、模板差异还是重复录入。',
  }),
  defineRule({
    id: 'QG008',
    name: '疑似重复清单项',
    description: '规范化项目名称、项目特征和单位组成的指纹完全相同。',
    severity: 'warning',
    category: 'duplicate',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows }) => {
      const groups = groupRows(itemRows, (row) => {
        const fingerprint = [
          normalizeComparable(row.values.item_name),
          normalizeComparable(row.values.item_feature),
          normalizeComparable(row.values.unit),
        ];
        return fingerprint.every((part) => part.length === 0) ? '' : JSON.stringify(fingerprint);
      });
      const results: RuleFinding[] = [];
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const relatedRows = group.map((row) => row.rowNumber);
        for (const row of group) {
          results.push(
            finding(
              row,
              'item_name',
              `项目名称、项目特征和单位与其他清单项完全相同，相关 Excel 行：${relatedRows.join('、')}；仅提示复核，不自动认定为重复列项。`,
              { relatedRows },
            ),
          );
        }
      }
      return results;
    },
    remediation: '对照相关行的工作内容和计量边界，人工确认是否为合理拆分或重复列项。',
  }),
  defineRule({
    id: 'QG009',
    name: '项目特征描述不足',
    description: '项目特征为空、规范化后过短，或主要为占位表达。',
    severity: 'warning',
    category: 'text',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows, config }) =>
      itemRows.flatMap((row) => {
        const cell = cellFor(row, 'item_feature');
        if (formulaUnavailable(cell)) return [];
        if (cell === undefined || isMissing(cell.value)) {
          return [finding(row, 'item_feature', '项目特征为空。')];
        }
        const normalized = normalizedFeature(cell.value);
        if (PLACEHOLDER_FEATURES.has(normalized) || PLACEHOLDER_FEATURE_TEMPLATE.test(normalized)) {
          return [
            finding(
              row,
              'item_feature',
              `项目特征“${normalizeText(cell.value)}”主要为占位表达，信息不足。`,
            ),
          ];
        }
        if (normalized.length < config.featureMinLength) {
          return [
            finding(
              row,
              'item_feature',
              `项目特征去除空白和标点后仅 ${normalized.length} 个字符，少于配置阈值 ${config.featureMinLength}。`,
            ),
          ];
        }
        return [];
      }),
    remediation: '结合设计、合同和计量要求补充可供复核的项目特征描述。',
  }),
  defineRule({
    id: 'QG010',
    name: '合价计算不一致',
    description: '工程量乘综合单价与合价的差额超过绝对或相对允许误差。',
    severity: 'error',
    category: 'calculation',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows, config }) =>
      itemRows.flatMap((row) => {
        const quantity = validNumberCell(row, 'quantity');
        const unitPrice = validNumberCell(row, 'unit_price');
        const totalPrice = validNumberCell(row, 'total_price');
        if (quantity === undefined || unitPrice === undefined || totalPrice === undefined)
          return [];
        const expected = quantity.decimal.times(unitPrice.decimal);
        const actual = totalPrice.decimal;
        const difference = actual.minus(expected);
        const tolerance = Decimal.max(
          new Decimal(config.calcTolerance),
          actual.abs().times(new Decimal(config.relativeTolerance)),
        );
        if (difference.abs().lessThanOrEqualTo(tolerance)) return [];
        return [
          finding(
            row,
            'total_price',
            `表内合价 ${actual.toString()} 与工程量乘综合单价 ${expected.toString()} 不一致，差额 ${difference.toString()}，允许误差 ${tolerance.toString()}。`,
            {
              calculation: {
                actual: actual.toString(),
                expected: expected.toString(),
                difference: difference.toString(),
                tolerance: tolerance.toString(),
              },
            },
          ),
        ];
      }),
    remediation: '核对工程量、综合单价、合价、公式及舍入口径。',
  }),
  defineRule({
    id: 'QG011',
    name: '单价异常',
    description: '综合单价小于零或等于零。',
    severity: 'warning',
    category: 'pricing',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows }) =>
      itemRows.flatMap((row) => {
        const unitPrice = validNumberCell(row, 'unit_price');
        if (unitPrice === undefined || !unitPrice.decimal.lessThanOrEqualTo(0)) return [];
        const state = unitPrice.decimal.equals(0) ? '等于零' : '小于零';
        return [
          finding(
            row,
            'unit_price',
            `综合单价 ${unitPrice.decimal.toString()} ${state}；赠送项、抵扣项或暂不计价项可能具有业务含义，请人工复核。`,
          ),
        ];
      }),
    remediation: '核对单价及其业务依据，不要仅因零值或负值自动修改。',
  }),
  defineRule({
    id: 'QG012',
    name: '同类项目单价离散',
    description: '同一规范化项目名称和单位至少四项时，检查单价相对中位数的偏差。',
    severity: 'info',
    category: 'pricing',
    applicableRowTypes: ITEM_ROWS,
    check: ({ itemRows, config }) => {
      const groups = groupRows(itemRows, (row) => {
        const name = normalizeComparable(row.values.item_name);
        const unit = normalizeComparable(row.values.unit);
        return name.length === 0 || unit.length === 0 ? '' : JSON.stringify([name, unit]);
      });
      const threshold = new Decimal(config.dispersionRatio);
      const results: RuleFinding[] = [];
      for (const group of groups.values()) {
        const priced = group.flatMap((row) => {
          const value = validNumberCell(row, 'unit_price');
          return value === undefined ? [] : [{ row, value }];
        });
        if (priced.length < 4) continue;
        const groupMedian = median(priced.map(({ value }) => value.decimal));
        if (groupMedian.equals(0)) continue;
        const relatedRows = priced.map(({ row }) => row.rowNumber);
        for (const { row, value } of priced) {
          const ratio = value.decimal.minus(groupMedian).abs().dividedBy(groupMedian.abs());
          if (ratio.lessThanOrEqualTo(threshold)) continue;
          results.push(
            finding(
              row,
              'unit_price',
              `综合单价 ${value.decimal.toString()} 与同类项目中位数 ${groupMedian.toString()} 的偏差 ${ratio.times(100).toDecimalPlaces(2).toString()}%，超过配置阈值 ${threshold.times(100).toString()}%。`,
              { relatedRows },
            ),
          );
        }
      }
      return results;
    },
    remediation: '结合工作内容、项目特征、时间地点和计价条件人工复核价格差异。',
  }),
  defineRule({
    id: 'QG013',
    name: '公式缺少缓存结果',
    description: '项目行单元格包含公式，但没有浏览器可用的缓存结果。',
    severity: 'warning',
    category: 'formula',
    applicableRowTypes: ITEM_ROWS,
    check: ({ sheet, itemRows, mapping }) => {
      const fieldByColumn = new Map<number, FieldKey>(
        (Object.entries(mapping) as [FieldKey, number][]).map(([field, column]) => [column, field]),
      );
      const sourceByRow = new Map(sheet.rows.map((row) => [row.rowNumber, row]));
      const results: RuleFinding[] = [];
      for (const row of itemRows) {
        const source = sourceByRow.get(row.rowNumber);
        if (source === undefined) continue;
        for (const cell of Object.values(source.cells)) {
          if (cell.formula === undefined || hasUsableFormulaResult(cell.formula)) continue;
          results.push({
            rowNumber: row.rowNumber,
            field: fieldByColumn.get(cell.column) ?? null,
            column: cell.column,
            cellAddress: cell.address,
            originalValue: cell.formula.expression,
            message: `公式“${cell.formula.expression}”没有可用的缓存结果，浏览器无法确认其计算值。`,
          });
        }
      }
      return results;
    },
    remediation: '请使用 Excel 或 WPS 重新计算并保存工作簿，再次导入检查。',
  }),
  defineRule({
    id: 'QG014',
    name: '导入结构风险',
    description: '项目数据区域存在隐藏行、映射隐藏列或影响字段读取的合并单元格。',
    severity: 'info',
    category: 'structure',
    applicableRowTypes: DATA_ROWS,
    check: ({ sheet, rows, itemRows, mapping, headerRow }) => {
      const results: RuleFinding[] = [];
      const header = sheet.rows.find((row) => row.rowNumber === headerRow);
      for (const [field, column] of Object.entries(mapping) as [FieldKey, number][]) {
        if (!sheet.hiddenColumns.includes(column)) continue;
        const cell = header?.cells[column];
        results.push({
          rowNumber: headerRow,
          field,
          column,
          cellAddress: cell?.address ?? excelAddress(headerRow, column),
          originalValue: cell?.value ?? fieldLabel(field),
          message: `映射字段“${fieldLabel(field)}”所在列被隐藏，可能影响数据读取和人工复核。`,
        });
      }

      for (const row of rows) {
        if (!row.hidden || row.type === 'blank' || row.type === 'repeated_header') continue;
        const trace = traceableCell(row);
        if (trace === undefined) continue;
        results.push(
          finding(row, trace[0], `数据区域第 ${row.rowNumber} 行被隐藏，可能遗漏待复核内容。`),
        );
      }

      const seenMergeFields = new Set<string>();
      for (const row of itemRows) {
        for (const [field, cell] of Object.entries(row.cells) as [FieldKey, MappedCell][]) {
          if (!cell.merged) continue;
          const range = cell.mergeRange ?? cell.address;
          const key = `${field}|${range}`;
          if (seenMergeFields.has(key)) continue;
          seenMergeFields.add(key);
          results.push(
            finding(
              row,
              field,
              `清单项目字段“${fieldLabel(field)}”位于合并区域 ${range}，可能影响逐行读取。`,
            ),
          );
        }
      }
      return results;
    },
    remediation: '取消隐藏并复核数据区域；对影响逐行读取的合并单元格进行拆分和补值。',
  }),
];

if (RULE_DEFINITIONS.map((rule) => rule.id).join('|') !== RULE_IDS.join('|')) {
  throw new Error('规则定义顺序必须与 RULE_IDS 完全一致。');
}

export const RULE_METADATA: Readonly<Record<RuleId, LintRule>> = Object.freeze(
  Object.fromEntries(RULE_DEFINITIONS.map((rule) => [rule.id, rule])) as Record<RuleId, LintRule>,
);
