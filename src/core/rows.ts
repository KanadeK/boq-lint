import { isHeaderLikeRow } from './fields';
import { parseLocaleNumber } from './numbers';
import type {
  CellSnapshot,
  FieldKey,
  FieldMapping,
  FormulaSnapshot,
  MappedCell,
  MappedRow,
  RowSnapshot,
  RowType,
  WorksheetSnapshot,
} from './types';

const SUBTOTAL_NAME_PATTERN =
  /(?:(?:小计|合计|总计)(?:$|[\s:：、，,（(])|^(?:subtotal|grand\s*total|total)(?:$|[\s:：,(]))/iu;
const SECTION_NAME_PATTERN =
  /(?:^第[一二三四五六七八九十百千万\d]+(?:章|节)(?:$|[\s:：、，,（(])|(?:分部分项(?:工程)?|分部(?:工程)?|措施项目)(?:$|[\s:：、，,（(])|^(?:章节|章|节|chapter|section|division|part)(?:$|[\s:：,(]))/iu;
const NOTE_PATTERN = /(?:^|\s)(?:备注|说明|注[：:]?|note|remarks?)(?:\s|[：:]|$)/iu;

function hasValue(value: unknown): boolean {
  return !(
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('error' in value && typeof value.error === 'string') return value.error;
    return '';
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'symbol') return value.description ?? '';
  return '';
}

function effectiveCellValue(cell: CellSnapshot | undefined): unknown {
  if (cell?.formula !== undefined) {
    return cell.formula.hasCachedResult ? cell.formula.cachedResult : undefined;
  }
  return cell?.value;
}

function addressFor(row: number, column: number): string {
  let result = '';
  let current = column;
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return `${result}${row}`;
}

function fallbackCell(row: number, column: number): CellSnapshot {
  return {
    row,
    column,
    address: addressFor(row, column),
    value: null,
    text: '',
    merged: false,
  };
}

function columnFromLetters(letters: string): number {
  let result = 0;
  for (const character of letters) result = result * 26 + character.charCodeAt(0) - 64;
  return result;
}

function mergeRangeFor(ranges: readonly string[], row: number, column: number): string | undefined {
  return ranges.find((range) => {
    const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/iu.exec(range);
    if (match === null) return false;
    const startColumn = columnFromLetters((match[1] ?? '').toLocaleUpperCase('en-US'));
    const startRow = Number(match[2]);
    const endColumn = columnFromLetters((match[3] ?? '').toLocaleUpperCase('en-US'));
    const endRow = Number(match[4]);
    return row >= startRow && row <= endRow && column >= startColumn && column <= endColumn;
  });
}

function mappedCell(
  field: FieldKey,
  column: number,
  row: RowSnapshot,
  sheet: WorksheetSnapshot,
): MappedCell {
  const source = row.cells[column] ?? fallbackCell(row.rowNumber, column);
  const containingMerge =
    source.mergeRange ?? mergeRangeFor(sheet.mergeRanges, row.rowNumber, column);
  const formula: FormulaSnapshot | undefined = source.formula;
  return {
    field,
    column,
    address: source.address,
    value: effectiveCellValue(source),
    originalValue: source.value,
    text: source.text,
    formula,
    merged: source.merged || containingMerge !== undefined,
    ...(containingMerge === undefined ? {} : { mergeRange: containingMerge }),
    columnHidden: sheet.hiddenColumns.includes(column),
  };
}

export interface RowClassification {
  readonly type: RowType;
  readonly reason: string;
}

export function classifyMappedRowWithReason(
  sourceRow: RowSnapshot,
  mapping: FieldMapping,
  cells: Partial<Record<FieldKey, MappedCell>>,
): RowClassification {
  if (Object.values(cells).every((cell) => !hasValue(cell.value) && cell.formula === undefined)) {
    return { type: 'blank', reason: '映射字段均为空。' };
  }
  if (isHeaderLikeRow(sourceRow, mapping)) {
    return { type: 'repeated_header', reason: '多个映射列再次出现字段别名，判定为重复表头。' };
  }

  const code = cells.item_code?.value;
  const name = cells.item_name?.value;
  const unit = cells.unit?.value;
  const quantity = cells.quantity?.value;
  const unitPrice = cells.unit_price?.value;
  const totalPrice = cells.total_price?.value;
  const numericCount = [quantity, unitPrice, totalPrice].filter(
    (value) => hasValue(value) && parseLocaleNumber(value).valid,
  ).length;
  const nameText = displayValue(name).trim();
  const remarksText = displayValue(cells.remarks?.value).trim();

  if (hasValue(code)) {
    return { type: 'item', reason: '项目编码非空，优先判定为清单项目行。' };
  }

  if (SUBTOTAL_NAME_PATTERN.test(nameText) && numericCount <= 1) {
    return { type: 'subtotal', reason: '名称包含小计、合计或总计，且有效数值字段不足。' };
  }

  if (SECTION_NAME_PATTERN.test(nameText) && numericCount <= 1) {
    return { type: 'section', reason: '名称包含章节、分部、分项或措施项目等标题词。' };
  }

  const coreValues = [name, unit, quantity, unitPrice, totalPrice];
  const presentCoreCount = coreValues.filter(hasValue).length;
  if (numericCount >= 1 && presentCoreCount >= 2) {
    return {
      type: 'item',
      reason: '无项目编码，但多个核心字段存在且至少一个数值字段有效。',
    };
  }

  const onlyRemarks =
    hasValue(cells.remarks?.value) &&
    [code, name, unit, quantity, unitPrice, totalPrice].every((value) => !hasValue(value));
  const explicitNoteName = NOTE_PATTERN.test(nameText);
  const remarksWithoutName = !hasValue(name) && NOTE_PATTERN.test(remarksText);
  if (onlyRemarks || explicitNoteName || remarksWithoutName) {
    return { type: 'note', reason: '仅备注字段有值，或内容含备注、说明、注释标识。' };
  }

  if (presentCoreCount >= 2) {
    return { type: 'item', reason: '无项目编码，但名称、单位、工程量或价格等多个核心字段存在。' };
  }

  if (hasValue(name)) {
    return { type: 'section', reason: '仅名称等少量非数值字段存在，判定为标题行。' };
  }
  return { type: 'note', reason: '存在非核心说明内容，但不足以判定为清单项目行。' };
}

export function classifyMappedRow(
  sourceRow: RowSnapshot,
  mapping: FieldMapping,
  cells: Partial<Record<FieldKey, MappedCell>>,
): RowType {
  return classifyMappedRowWithReason(sourceRow, mapping, cells).type;
}

export function mapSheetRows(
  sheet: WorksheetSnapshot,
  mapping: FieldMapping,
  headerRow: number,
): readonly MappedRow[] {
  const mappedRows: MappedRow[] = [];
  for (const sourceRow of sheet.rows) {
    if (sourceRow.rowNumber <= headerRow) continue;
    const cells: Partial<Record<FieldKey, MappedCell>> = {};
    const values: Partial<Record<FieldKey, unknown>> = {};
    for (const [field, column] of Object.entries(mapping) as [FieldKey, number][]) {
      const cell = mappedCell(field, column, sourceRow, sheet);
      cells[field] = cell;
      values[field] = cell.value;
    }
    const classification = classifyMappedRowWithReason(sourceRow, mapping, cells);
    mappedRows.push({
      sheetName: sheet.name,
      rowNumber: sourceRow.rowNumber,
      hidden: sourceRow.hidden,
      type: classification.type,
      classificationReason: classification.reason,
      values,
      cells,
    });
  }
  return mappedRows;
}

export function isMissing(value: unknown): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

export function normalizeText(value: unknown): string {
  if (isMissing(value)) return '';
  return String(value).normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function normalizeComparable(value: unknown): string {
  return normalizeText(value).toLocaleLowerCase('en-US').replace(/\s+/gu, '');
}

export function formulaError(value: unknown): string | undefined {
  if (
    typeof value === 'string' &&
    /^#(?:REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!)/iu.test(value)
  ) {
    return value;
  }
  if (typeof value === 'object' && value !== null && 'error' in value) {
    const error = value.error;
    if (typeof error === 'string') return error;
  }
  return undefined;
}

export function hasUsableFormulaResult(formula: FormulaSnapshot): boolean {
  return (
    formula.hasCachedResult &&
    formula.cachedResult !== null &&
    formula.cachedResult !== undefined &&
    formulaError(formula.cachedResult) === undefined
  );
}
