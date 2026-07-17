export type Locale = 'zh-CN' | 'en';

export type ThemePreference = 'auto' | 'light' | 'dark';

export type CheckMode = 'unpriced' | 'priced';

export type AppStep = 'import' | 'mapping' | 'results';

export type Severity = 'error' | 'warning' | 'info';

export type StandardField =
  | 'serial_no'
  | 'item_code'
  | 'item_name'
  | 'item_feature'
  | 'unit'
  | 'quantity'
  | 'unit_price'
  | 'total_price'
  | 'remarks';

export interface FileSummary {
  readonly name: string;
  readonly size: number;
  readonly sheetCount: number;
  readonly sheetNames: readonly string[];
  readonly source: 'file' | 'sample';
}

export interface PreviewCell {
  readonly column: number;
  readonly text: string;
}

export interface PreviewRow {
  readonly rowNumber: number;
  readonly cells: readonly PreviewCell[];
}

export interface SheetMapping {
  readonly id: string;
  readonly name: string;
  readonly state: 'visible' | 'hidden' | 'veryHidden';
  readonly selected: boolean;
  readonly headerRow: number;
  readonly headerConfidence: number;
  readonly headers: readonly PreviewCell[];
  readonly previewRows: readonly PreviewRow[];
  readonly mapping: Readonly<Partial<Record<StandardField, number>>>;
  readonly maxRow: number;
  readonly maxColumn: number;
}

export interface ProgressState {
  readonly phase: 'parsing' | 'mapping' | 'checking' | 'reporting';
  readonly percent: number;
  readonly detail?: string;
}

export interface IssueContextRow {
  readonly rowNumber: number;
  readonly values: Readonly<Partial<Record<StandardField, string>>>;
  readonly isIssueRow: boolean;
}

export interface UiIssue {
  readonly id: string;
  readonly severity: Severity;
  readonly ruleId: string;
  readonly sheetName: string;
  readonly rowNumber: number;
  readonly field: StandardField | null;
  readonly itemCode: string;
  readonly itemName: string;
  readonly originalValue: string;
  readonly message: string;
  readonly suggestion: string;
  readonly context: readonly IssueContextRow[];
  readonly calculatedValue?: string;
  readonly difference?: string;
}

export interface ResultSummary {
  readonly totalRows: number;
  readonly sheetsChecked: number;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  readonly passedRules: number;
  readonly durationMs: number;
}

export interface UiResult {
  readonly summary: ResultSummary;
  readonly issues: readonly UiIssue[];
  readonly checkedAt: string;
}

export interface RuleSetting {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly enabled: boolean;
}

export interface UiRuleConfig {
  readonly calcTolerance: string;
  readonly relativeTolerance: string;
  readonly dispersionRatio: string;
  readonly featureMinLength: number;
  readonly rules: readonly RuleSetting[];
}

export const STANDARD_FIELDS: readonly StandardField[] = [
  'serial_no',
  'item_code',
  'item_name',
  'item_feature',
  'unit',
  'quantity',
  'unit_price',
  'total_price',
  'remarks',
];
