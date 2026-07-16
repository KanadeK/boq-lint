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

const SUBTOTAL_PATTERN = /(?:小计|合计|总计|subtotal|grand\s*total|total)/iu;
const SECTION_PATTERN = /(?:章节|章|节|分部|分项|措施项目|chapter|section|division|part)/iu;

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

function mappedText(cells: Partial<Record<FieldKey, MappedCell>>): string {
  return Object.values(cells)
    .map((cell) => displayValue(cell.value).trim())
    .filter((value) => value.length > 0)
    .join(' ');
}

export function classifyMappedRow(
  sourceRow: RowSnapshot,
  mapping: FieldMapping,
  cells: Partial<Record<FieldKey, MappedCell>>,
): RowType {
  if (Object.values(cells).every((cell) => !hasValue(cell.value) && cell.formula === undefined)) {
    return 'blank';
  }
  if (isHeaderLikeRow(sourceRow, mapping)) return 'repeated_header';

  const text = mappedText(cells);
  const code = cells.item_code?.value;
  const name = cells.item_name?.value;
  const unit = cells.unit?.value;
  const quantity = cells.quantity?.value;
  const unitPrice = cells.unit_price?.value;
  const totalPrice = cells.total_price?.value;
  const numericCount = [quantity, unitPrice, totalPrice].filter(
    (value) => hasValue(value) && parseLocaleNumber(value).valid,
  ).length;

  if (SUBTOTAL_PATTERN.test(text) && !hasValue(code)) return 'subtotal';

  const coreCount = [code, name, unit, quantity, unitPrice, totalPrice].filter(hasValue).length;
  if (
    !hasValue(code) &&
    numericCount === 0 &&
    (SECTION_PATTERN.test(text) || (hasValue(name) && coreCount === 1))
  ) {
    return 'section';
  }

  if (hasValue(code) || numericCount > 0 || coreCount >= 2) return 'detail';
  return 'section';
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
    mappedRows.push({
      sheetName: sheet.name,
      rowNumber: sourceRow.rowNumber,
      hidden: sourceRow.hidden,
      type: classifyMappedRow(sourceRow, mapping, cells),
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
