import ExcelJS from 'exceljs';

import { detectHeaderCandidates } from './fields';
import type {
  CellSnapshot,
  ParseWorkbookOptions,
  ParsedWorkbook,
  ProgressCallback,
  ProgressEvent,
  RowSnapshot,
  WorksheetSnapshot,
} from './types';
import { BoqLintError } from './types';

type WorkbookInput = Blob | ArrayBuffer | Uint8Array;

export const MAX_XLSX_FILE_SIZE = 20 * 1024 * 1024;

function emitProgress(
  callback: ProgressCallback | undefined,
  event: Omit<ProgressEvent, 'percent'>,
): void {
  callback?.({
    ...event,
    percent: event.total <= 0 ? 100 : Math.round((event.processed / event.total) * 100),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function inputName(input: WorkbookInput, optionName: string | undefined): string {
  if (optionName !== undefined && optionName.trim().length > 0) return optionName;
  if (isRecord(input) && typeof input.name === 'string' && input.name.trim().length > 0) {
    return input.name;
  }
  return '未命名工作簿.xlsx';
}

async function inputBytes(input: WorkbookInput): Promise<Uint8Array> {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(
      input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
    );
  }
  return new Uint8Array(await input.arrayBuffer());
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function validateContainer(bytes: Uint8Array, fileName: string): void {
  if (/\.xls$/iu.test(fileName)) throw new BoqLintError('UNSUPPORTED_XLS');
  if (!/\.xlsx$/iu.test(fileName)) throw new BoqLintError('UNSUPPORTED_FORMAT');
  if (bytes.byteLength === 0) throw new BoqLintError('EMPTY_FILE');
  if (bytes.byteLength > MAX_XLSX_FILE_SIZE) throw new BoqLintError('FILE_TOO_LARGE');

  const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (startsWith(bytes, oleSignature)) {
    if (/\.xlsx$/iu.test(fileName)) throw new BoqLintError('ENCRYPTED_WORKBOOK');
    throw new BoqLintError('UNSUPPORTED_XLS');
  }
  if (!startsWith(bytes, [0x50, 0x4b])) throw new BoqLintError('CORRUPT_WORKBOOK');
}

function formulaExpression(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.formula === 'string' && value.formula.length > 0) return value.formula;
  if (typeof value.sharedFormula === 'string' && value.sharedFormula.length > 0) {
    return value.sharedFormula;
  }
  return undefined;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function plainCellValue(value: unknown): unknown {
  if (value instanceof Date) return new Date(value.getTime());
  if (!isRecord(value)) return value;
  if (Array.isArray(value.richText)) {
    return value.richText
      .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  if (typeof value.text === 'string' && typeof value.hyperlink === 'string') return value.text;
  if (typeof value.error === 'string') return { error: value.error };
  if (formulaExpression(value) !== undefined) {
    return {
      formula: formulaExpression(value),
      ...(hasOwn(value, 'result') ? { result: plainCellValue(value.result) } : {}),
    };
  }
  return Object.prototype.toString.call(value);
}

function parseCellAddress(address: string): { row: number; column: number } | undefined {
  const match = /^([A-Z]+)(\d+)$/u.exec(address.toLocaleUpperCase('en-US'));
  if (match === null) return undefined;
  let column = 0;
  for (const character of match[1] ?? '') column = column * 26 + character.charCodeAt(0) - 64;
  return { row: Number(match[2]), column };
}

function mergeRangeAt(ranges: readonly string[], row: number, column: number): string | undefined {
  return ranges.find((range) => {
    const [startText, endText] = range.split(':');
    const start = startText === undefined ? undefined : parseCellAddress(startText);
    const end = endText === undefined ? start : parseCellAddress(endText);
    return (
      start !== undefined &&
      end !== undefined &&
      row >= start.row &&
      row <= end.row &&
      column >= start.column &&
      column <= end.column
    );
  });
}

function snapshotWorksheet(worksheet: ExcelJS.Worksheet, index: number): WorksheetSnapshot {
  const mergeRanges = [...worksheet.model.merges];
  const rowCount = Math.max(worksheet.rowCount, worksheet.actualRowCount);
  const columnCount = Math.max(worksheet.columnCount, worksheet.actualColumnCount);
  const hiddenColumns: number[] = [];
  for (let column = 1; column <= columnCount; column += 1) {
    if (worksheet.getColumn(column).hidden === true) hiddenColumns.push(column);
  }

  const rows: RowSnapshot[] = [];
  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const worksheetRow = worksheet.getRow(rowNumber);
    const cells: Record<number, CellSnapshot> = {};
    worksheetRow.eachCell({ includeEmpty: false }, (cell, column) => {
      const original = cell.value;
      const expression = formulaExpression(original);
      const range = mergeRangeAt(mergeRanges, rowNumber, column);
      const normalizedValue = plainCellValue(original);
      cells[column] = {
        row: rowNumber,
        column,
        address: cell.address,
        value: normalizedValue,
        text: cell.text,
        ...(expression === undefined
          ? {}
          : {
              formula: {
                expression,
                ...(isRecord(original) && hasOwn(original, 'result')
                  ? { cachedResult: plainCellValue(original.result) }
                  : {}),
                hasCachedResult: isRecord(original) && hasOwn(original, 'result'),
              },
            }),
        merged: range !== undefined || cell.isMerged,
        ...(range === undefined ? {} : { mergeRange: range }),
      };
    });
    rows.push({ rowNumber, hidden: worksheetRow.hidden === true, cells });
  }

  const candidates = detectHeaderCandidates(rows);
  const best = candidates[0];
  return {
    name: worksheet.name,
    index,
    visibility: worksheet.state,
    rowCount,
    columnCount,
    rows,
    hiddenColumns,
    mergeRanges,
    headerCandidates: candidates,
    ...(best === undefined ? {} : { detectedHeaderRow: best.rowNumber }),
    suggestedMapping: best?.mapping ?? {},
  };
}

function parsingError(error: unknown): BoqLintError {
  if (error instanceof BoqLintError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/password|encrypt|encryption|encrypted|decrypt/iu.test(message)) {
    return new BoqLintError('ENCRYPTED_WORKBOOK');
  }
  return new BoqLintError('CORRUPT_WORKBOOK');
}

/** Loads and snapshots a workbook entirely in local memory; no network API is used. */
export async function parseWorkbook(
  input: WorkbookInput,
  options: ParseWorkbookOptions = {},
): Promise<ParsedWorkbook> {
  const name = inputName(input, options.fileName);
  emitProgress(options.onProgress, { stage: 'reading', processed: 0, total: 1 });
  const bytes = await inputBytes(input);
  validateContainer(bytes, name);

  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS accepts Uint8Array in browsers, although its public declaration still names Node Buffer.
    const loadInput = bytes as unknown as Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(loadInput);
  } catch (error) {
    throw parsingError(error);
  }
  emitProgress(options.onProgress, { stage: 'reading', processed: 1, total: 1 });

  if (workbook.worksheets.length === 0) throw new BoqLintError('EMPTY_WORKBOOK');
  if (workbook.worksheets.every((sheet) => sheet.state !== 'visible')) {
    throw new BoqLintError('NO_VISIBLE_SHEET');
  }

  const sheets: WorksheetSnapshot[] = [];
  for (const [index, worksheet] of workbook.worksheets.entries()) {
    sheets.push(snapshotWorksheet(worksheet, index + 1));
    emitProgress(options.onProgress, {
      stage: 'snapshotting',
      processed: index + 1,
      total: workbook.worksheets.length,
      sheetName: worksheet.name,
    });
  }

  return {
    file: {
      name,
      size: bytes.byteLength,
      sheetCount: sheets.length,
      visibleSheetCount: sheets.filter((sheet) => sheet.visibility === 'visible').length,
    },
    sheets,
  };
}

export const loadWorkbook = parseWorkbook;
