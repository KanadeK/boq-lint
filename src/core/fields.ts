import type {
  FieldKey,
  FieldMapping,
  HeaderCandidate,
  RowSnapshot,
  WorksheetSnapshot,
} from './types';

export interface FieldDefinition {
  readonly key: FieldKey;
  readonly labelZh: string;
  readonly labelEn: string;
  readonly synonyms: readonly string[];
}

export const FIELD_DEFINITIONS: readonly FieldDefinition[] = [
  {
    key: 'serial_no',
    labelZh: '序号',
    labelEn: 'Serial no.',
    synonyms: ['序号', '编号', '项号', 'no', 'no.', 'serial', 'serial no', 'sequence', 'item no'],
  },
  {
    key: 'item_code',
    labelZh: '项目编码',
    labelEn: 'Item code',
    synonyms: ['项目编码', '清单编码', '编码', 'item code', 'boq code', 'project code', 'code'],
  },
  {
    key: 'item_name',
    labelZh: '项目名称',
    labelEn: 'Item name',
    synonyms: [
      '项目名称',
      '清单项目名称',
      '清单名称',
      'item name',
      'boq item name',
      'project name',
      'work item',
    ],
  },
  {
    key: 'item_feature',
    labelZh: '项目特征',
    labelEn: 'Item feature',
    synonyms: [
      '项目特征',
      '项目特征描述',
      '特征描述',
      '特征',
      'item feature',
      'project feature',
      'feature description',
      'item description',
      'specification',
      'specifications',
      'specs',
    ],
  },
  {
    key: 'unit',
    labelZh: '计量单位',
    labelEn: 'Unit',
    synonyms: ['计量单位', '单位', 'unit', 'unit of measure', 'uom'],
  },
  {
    key: 'quantity',
    labelZh: '工程量',
    labelEn: 'Quantity',
    synonyms: ['工程量', '数量', 'quantity', 'qty'],
  },
  {
    key: 'unit_price',
    labelZh: '综合单价',
    labelEn: 'Unit price',
    synonyms: ['综合单价', '单价', 'unit price', 'comprehensive unit price', 'rate'],
  },
  {
    key: 'total_price',
    labelZh: '合价',
    labelEn: 'Total price',
    synonyms: [
      '合价',
      '综合合价',
      '总价',
      '金额',
      'total price',
      'total amount',
      'extended amount',
      'amount',
    ],
  },
  {
    key: 'remarks',
    labelZh: '备注',
    labelEn: 'Remarks',
    synonyms: ['备注', '说明', 'remarks', 'remark', 'notes', 'note', 'comments', 'comment'],
  },
];

export function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    text = String(value);
  } else if (value instanceof Date) text = value.toISOString();
  else return '';
  return text
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[\s:：._‐‑‒–—―()（）[\]【】-]+/gu, '');
}

const ALIAS_TO_FIELD = new Map<string, FieldKey>();
for (const definition of FIELD_DEFINITIONS) {
  for (const synonym of definition.synonyms) {
    const alias = normalizeHeader(synonym);
    if (!ALIAS_TO_FIELD.has(alias)) ALIAS_TO_FIELD.set(alias, definition.key);
  }
}

export function resolveHeaderField(value: unknown): FieldKey | undefined {
  return ALIAS_TO_FIELD.get(normalizeHeader(value));
}

export function mapHeaderValues(values: readonly unknown[]): FieldMapping {
  const mapping: FieldMapping = {};
  values.forEach((value, index) => {
    const field = resolveHeaderField(value);
    if (field !== undefined && mapping[field] === undefined) mapping[field] = index + 1;
  });
  return mapping;
}

function mapHeaderSnapshot(row: RowSnapshot): FieldMapping {
  const mapping: FieldMapping = {};
  for (const [columnText, cell] of Object.entries(row.cells)) {
    const field = resolveHeaderField(cell.value);
    const column = Number(columnText);
    if (field !== undefined && mapping[field] === undefined) mapping[field] = column;
  }
  return mapping;
}

function candidateScore(mapping: FieldMapping): number {
  const fields = Object.keys(mapping) as FieldKey[];
  let score = fields.length * 10;
  if (mapping.item_code !== undefined) score += 5;
  if (mapping.item_name !== undefined) score += 6;
  if (mapping.quantity !== undefined) score += 5;
  if (mapping.unit !== undefined) score += 3;
  if (mapping.unit_price !== undefined && mapping.total_price !== undefined) score += 3;
  return score;
}

function isViableHeader(mapping: FieldMapping): boolean {
  const matches = Object.keys(mapping).length;
  return matches >= 2 && (mapping.item_name !== undefined || mapping.item_code !== undefined);
}

export function detectHeaderCandidates(
  rows: readonly RowSnapshot[],
  maxRows = 50,
): readonly HeaderCandidate[] {
  return rows
    .filter((row) => row.rowNumber <= maxRows)
    .map((row): HeaderCandidate => {
      const mapping = mapHeaderSnapshot(row);
      return {
        rowNumber: row.rowNumber,
        score: candidateScore(mapping),
        matchedFields: Object.keys(mapping) as FieldKey[],
        mapping,
        manual: false,
      };
    })
    .filter((candidate) => isViableHeader(candidate.mapping))
    .sort((left, right) => right.score - left.score || left.rowNumber - right.rowNumber);
}

export function mapWorksheetHeader(
  sheet: Pick<WorksheetSnapshot, 'rows'>,
  manualHeaderRow?: number,
): HeaderCandidate | undefined {
  if (manualHeaderRow === undefined) return detectHeaderCandidates(sheet.rows)[0];
  const row = sheet.rows.find((entry) => entry.rowNumber === manualHeaderRow);
  if (row === undefined) return undefined;
  const mapping = mapHeaderSnapshot(row);
  return {
    rowNumber: manualHeaderRow,
    score: candidateScore(mapping),
    matchedFields: Object.keys(mapping) as FieldKey[],
    mapping,
    manual: true,
  };
}

export function isHeaderLikeRow(row: RowSnapshot, mapping: FieldMapping): boolean {
  let matches = 0;
  let mappedCells = 0;
  for (const [field, column] of Object.entries(mapping) as [FieldKey, number][]) {
    mappedCells += 1;
    if (resolveHeaderField(row.cells[column]?.value) === field) matches += 1;
  }
  return matches >= 2 && matches >= Math.min(3, mappedCells);
}

export function fieldLabel(field: FieldKey, language: 'zh' | 'en' = 'zh'): string {
  const definition = FIELD_DEFINITIONS.find((entry) => entry.key === field);
  return language === 'zh' ? (definition?.labelZh ?? field) : (definition?.labelEn ?? field);
}
