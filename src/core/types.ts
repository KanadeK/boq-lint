export const APP_VERSION = '0.1.0' as const;

export const FIELD_KEYS = [
  'serial_no',
  'item_code',
  'item_name',
  'item_feature',
  'unit',
  'quantity',
  'unit_price',
  'total_price',
  'remarks',
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];
export type FieldMapping = Partial<Record<FieldKey, number>>;
export type CheckMode = 'unpriced' | 'priced';
export type Severity = 'error' | 'warning' | 'info';

export const RULE_IDS = [
  'REQ-001',
  'NUM-001',
  'QTY-001',
  'DUP-001',
  'DUP-002',
  'UNIT-001',
  'CALC-001',
  'FORMULA-001',
  'FORMULA-002',
  'TEXT-001',
  'CODE-001',
  'STRUCT-001',
  'STRUCT-002',
  'STRUCT-003',
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export interface RuleMetadata {
  readonly ruleId: RuleId;
  readonly name: string;
  readonly description: string;
  readonly defaultSeverity: Severity;
  readonly remediation: string;
  readonly core: boolean;
}

export interface RuleSwitch {
  readonly enabled: boolean;
}

export interface RuleConfig {
  readonly version: 1;
  readonly calcTolerance: string;
  readonly rules: Readonly<Record<RuleId, RuleSwitch>>;
}

export interface WorkbookFileInfo {
  readonly name: string;
  readonly size: number;
  readonly sheetCount: number;
  readonly visibleSheetCount: number;
}

export type WorksheetVisibility = 'visible' | 'hidden' | 'veryHidden';

export interface FormulaSnapshot {
  readonly expression: string;
  readonly cachedResult?: unknown;
  readonly hasCachedResult: boolean;
}

export interface CellSnapshot {
  readonly row: number;
  readonly column: number;
  readonly address: string;
  readonly value: unknown;
  readonly text: string;
  readonly formula?: FormulaSnapshot;
  readonly merged: boolean;
  readonly mergeRange?: string;
}

export interface RowSnapshot {
  readonly rowNumber: number;
  readonly hidden: boolean;
  readonly cells: Readonly<Record<number, CellSnapshot>>;
}

export interface HeaderCandidate {
  readonly rowNumber: number;
  readonly score: number;
  readonly matchedFields: readonly FieldKey[];
  readonly mapping: FieldMapping;
  readonly manual: boolean;
}

export interface WorksheetSnapshot {
  readonly name: string;
  readonly index: number;
  readonly visibility: WorksheetVisibility;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly rows: readonly RowSnapshot[];
  readonly hiddenColumns: readonly number[];
  readonly mergeRanges: readonly string[];
  readonly headerCandidates: readonly HeaderCandidate[];
  readonly detectedHeaderRow?: number;
  readonly suggestedMapping: FieldMapping;
}

export interface ParsedWorkbook {
  readonly file: WorkbookFileInfo;
  readonly sheets: readonly WorksheetSnapshot[];
}

export type RowType = 'detail' | 'section' | 'subtotal' | 'repeated_header' | 'blank';

export interface MappedCell {
  readonly field: FieldKey;
  readonly column: number;
  readonly address: string;
  readonly value: unknown;
  readonly originalValue: unknown;
  readonly text: string;
  readonly formula?: FormulaSnapshot;
  readonly merged: boolean;
  readonly mergeRange?: string;
  readonly columnHidden: boolean;
}

export interface MappedRow {
  readonly sheetName: string;
  readonly rowNumber: number;
  readonly hidden: boolean;
  readonly type: RowType;
  readonly values: Readonly<Partial<Record<FieldKey, unknown>>>;
  readonly cells: Readonly<Partial<Record<FieldKey, MappedCell>>>;
}

export interface CalculationDetails {
  readonly actual: string;
  readonly expected: string;
  readonly difference: string;
  readonly tolerance: string;
}

export interface LintIssue {
  readonly id: string;
  readonly severity: Severity;
  readonly ruleId: RuleId;
  readonly ruleName: string;
  readonly sheetName: string;
  readonly rowNumber: number;
  readonly field: FieldKey | null;
  readonly column: number | null;
  readonly cellAddress?: string;
  readonly itemCode: string;
  readonly itemName: string;
  readonly originalValue: unknown;
  readonly message: string;
  readonly remediation: string;
  readonly relatedRows?: readonly number[];
  readonly calculation?: CalculationDetails;
}

export interface LintSummary {
  readonly detailRows: number;
  readonly checkedSheets: number;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  readonly passedRules: number;
  readonly durationMs: number;
}

export interface LintReport {
  readonly appVersion: typeof APP_VERSION;
  readonly file: WorkbookFileInfo;
  readonly checkedAt: string;
  readonly mode: CheckMode;
  readonly mappings: Readonly<Record<string, FieldMapping>>;
  readonly ruleConfig: RuleConfig;
  readonly summary: LintSummary;
  readonly issues: readonly LintIssue[];
  readonly rows: Readonly<Record<string, readonly MappedRow[]>>;
}

export type ProgressStage =
  'reading' | 'snapshotting' | 'mapping' | 'checking' | 'finalizing' | 'complete';

export interface ProgressEvent {
  readonly stage: ProgressStage;
  readonly processed: number;
  readonly total: number;
  readonly percent: number;
  readonly sheetName?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface ParseWorkbookOptions {
  readonly fileName?: string;
  readonly onProgress?: ProgressCallback;
}

export interface RunLintOptions {
  readonly mode: CheckMode;
  readonly sheets?: readonly string[];
  readonly mappings?: Readonly<Record<string, FieldMapping>>;
  readonly headerRows?: Readonly<Record<string, number>>;
  readonly config?: RuleConfig;
  readonly onProgress?: ProgressCallback;
  readonly batchSize?: number;
}

export type CoreErrorCode =
  | 'UNSUPPORTED_XLS'
  | 'ENCRYPTED_WORKBOOK'
  | 'CORRUPT_WORKBOOK'
  | 'EMPTY_FILE'
  | 'EMPTY_WORKBOOK'
  | 'NO_VISIBLE_SHEET'
  | 'HEADER_NOT_FOUND'
  | 'NO_DETAIL_ROWS'
  | 'INVALID_CONFIG';

const CORE_ERROR_MESSAGES: Readonly<Record<CoreErrorCode, string>> = {
  UNSUPPORTED_XLS: '暂不支持 .xls 文件，请先在 Excel 中另存为 .xlsx 后重试。',
  ENCRYPTED_WORKBOOK: '无法读取加密或受密码保护的工作簿，请解除密码保护后重试。',
  CORRUPT_WORKBOOK: '工作簿无法解析，文件可能已损坏或不是有效的 .xlsx 文件。',
  EMPTY_FILE: '所选文件为空，请选择包含工程量清单的 .xlsx 文件。',
  EMPTY_WORKBOOK: '工作簿中没有任何工作表。',
  NO_VISIBLE_SHEET: '工作簿中没有可见工作表，请先取消隐藏至少一个工作表。',
  HEADER_NOT_FOUND: '无法自动识别表头，请手动选择表头行并完成字段映射。',
  NO_DETAIL_ROWS: '所选工作表中没有可检查的明细行。',
  INVALID_CONFIG: '规则配置无效。',
};

export class BoqLintError extends Error {
  readonly code: CoreErrorCode;
  readonly details?: string;

  constructor(code: CoreErrorCode, details?: string) {
    super(
      details === undefined ? CORE_ERROR_MESSAGES[code] : `${CORE_ERROR_MESSAGES[code]} ${details}`,
    );
    this.name = 'BoqLintError';
    this.code = code;
    this.details = details;
  }
}
