import { useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import {
  BoqLintError,
  DEFAULT_RULE_CONFIG,
  RULE_IDS,
  RULE_METADATA,
  exportCsv,
  exportJson,
  exportRuleConfig,
  exportXlsx,
  formatReportFileName,
  importRuleConfig,
  loadRuleConfig,
  mapWorksheetHeader,
  parseWorkbook,
  runLint,
  saveRuleConfig,
  type LintReport,
  type MappedRow,
  type ParsedWorkbook,
  type ProgressEvent,
  type RuleConfig,
  type RuleId,
  type WorksheetSnapshot,
} from './core';
import { CheckingStep } from './ui/CheckingStep';
import { getMessages } from './ui/i18n';
import { ImportStep } from './ui/ImportStep';
import { MappingStep } from './ui/MappingStep';
import { ResultsStep } from './ui/ResultsStep';
import { getRuleDefinitions } from './ui/rules';
import { AppHeader, StepIndicator } from './ui/Shell';
import { SettingsDrawer } from './ui/SettingsDrawer';
import { SocialPreview } from './ui/SocialPreview';
import {
  STANDARD_FIELDS,
  type AppStep,
  type CheckMode,
  type FileSummary,
  type IssueContextRow,
  type Locale,
  type ProgressState,
  type SheetMapping,
  type StandardField,
  type ThemePreference,
  type UiIssue,
  type UiResult,
  type UiRuleConfig,
} from './ui/types';

const LANGUAGE_STORAGE_KEY = 'boq-lint:locale';
const THEME_STORAGE_KEY = 'boq-lint:theme';
const SAMPLE_FILES = {
  valid: 'samples/boq-valid-zh.xlsx',
  issues: 'samples/boq-issues-zh.xlsx',
} as const;

const REQUIRED_FIELDS: Readonly<Record<CheckMode, readonly StandardField[]>> = {
  unpriced: ['item_code', 'item_name', 'unit', 'quantity'],
  priced: ['item_code', 'item_name', 'unit', 'quantity', 'unit_price', 'total_price'],
};

function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preferences are optional when storage is unavailable, including restrictive file URLs.
  }
}

async function createOfflineSample(sample: keyof typeof SAMPLE_FILES): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BOQLint';
  const sheet = workbook.addWorksheet('虚构清单');
  const headers = [
    '序号',
    '项目编码',
    '项目名称',
    '项目特征',
    '计量单位',
    '工程量',
    '综合单价',
    '合价',
    '备注',
  ];
  sheet.addRow(['BOQLint 虚构演示数据']);
  sheet.addRow(['仅用于功能演示，不代表真实项目或价格']);
  sheet.addRow(headers);

  if (sample === 'valid') {
    sheet.addRow([
      '1',
      'DEMO-001',
      '虚构土方项目',
      '虚构特征 A',
      'm³',
      12.5,
      100,
      1250,
      '虚构数据',
    ]);
    sheet.addRow(['2', 'DEMO-002', '虚构砌筑项目', '虚构特征 B', 'm³', 8, 260, 2080, '虚构数据']);
    sheet.addRow(['3', 'DEMO-003', '虚构装饰项目', '虚构特征 C', 'm²', 25, 48, 1200, '虚构数据']);
  } else {
    sheet.addRow(['1', ' DEMO-001 ', '虚构问题项目', '', 'm²', 0, 12, 999, '虚构数据']);
    sheet.addRow(['2', '', '虚构缺码项目', '虚构特征', 'm²', '不是数字', 10, 100, '虚构数据']);
    sheet.addRow(['3', 'DEMO-002', '虚构单位冲突', '虚构特征', 'm', 2, 10, 20, '虚构数据']);
    sheet.addRow(['4', 'DEMO-002', '虚构单位冲突', '虚构特征', 'm²', 2, 10, 20, '虚构数据']);
    const hidden = sheet.addRow([
      '5',
      'DEMO-003',
      '虚构隐藏项目',
      '虚构特征',
      '项',
      1,
      1,
      1,
      '虚构数据',
    ]);
    hidden.hidden = true;
    sheet.addRow(headers);
  }

  const output = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(output);
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function browserLocale(): Locale {
  const stored = readPreference(LANGUAGE_STORAGE_KEY);
  if (stored === 'zh-CN' || stored === 'en') return stored;
  return navigator.language.toLocaleLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

function browserTheme(): ThemePreference {
  const stored = readPreference(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
}

function initialRuleConfig(): RuleConfig {
  try {
    return loadRuleConfig();
  } catch {
    return DEFAULT_RULE_CONFIG;
  }
}

function applyTheme(theme: ThemePreference): void {
  const dark =
    theme === 'dark' ||
    (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function uiRuleConfig(config: RuleConfig): UiRuleConfig {
  return {
    calcTolerance: config.calcTolerance,
    rules: RULE_IDS.map((ruleId) => ({
      ruleId,
      severity: RULE_METADATA[ruleId].defaultSeverity,
      core: RULE_METADATA[ruleId].core,
      enabled: config.rules[ruleId].enabled,
    })),
  };
}

function confidence(score: number | undefined): number {
  if (score === undefined) return 0;
  return Math.max(0, Math.min(1, score / 70));
}

function headerCells(sheet: WorksheetSnapshot, rowNumber: number) {
  const row = sheet.rows.find((entry) => entry.rowNumber === rowNumber);
  return Array.from({ length: sheet.columnCount }, (_, index) => {
    const column = index + 1;
    return { column, text: row?.cells[column]?.text ?? '' };
  });
}

function previewRows(sheet: WorksheetSnapshot, headerRow: number) {
  return sheet.rows
    .filter((row) => row.rowNumber > headerRow)
    .slice(0, 50)
    .map((row) => ({
      rowNumber: row.rowNumber,
      cells: Object.values(row.cells)
        .sort((left, right) => left.column - right.column)
        .map((cell) => ({ column: cell.column, text: cell.text })),
    }));
}

function sheetMapping(sheet: WorksheetSnapshot): SheetMapping {
  const best = sheet.headerCandidates[0];
  const headerRow = sheet.detectedHeaderRow ?? best?.rowNumber ?? 1;
  return {
    id: String(sheet.index),
    name: sheet.name,
    state: sheet.visibility,
    selected: sheet.visibility === 'visible',
    headerRow,
    headerConfidence: confidence(best?.score),
    headers: headerCells(sheet, headerRow),
    previewRows: previewRows(sheet, headerRow),
    mapping: { ...sheet.suggestedMapping },
    maxRow: sheet.rowCount,
    maxColumn: sheet.columnCount,
  };
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function issueContext(rows: readonly MappedRow[], issueRow: number): readonly IssueContextRow[] {
  const issueIndex = rows.findIndex((row) => row.rowNumber === issueRow);
  if (issueIndex < 0) return [];
  return rows
    .slice(Math.max(0, issueIndex - 2), Math.min(rows.length, issueIndex + 3))
    .map((row) => ({
      rowNumber: row.rowNumber,
      isIssueRow: row.rowNumber === issueRow,
      values: Object.fromEntries(
        STANDARD_FIELDS.flatMap((field) => {
          const value = row.values[field];
          const text = displayValue(value);
          return text.length === 0 ? [] : [[field, text]];
        }),
      ),
    }));
}

function toUiResult(report: LintReport, locale: Locale, config: UiRuleConfig): UiResult {
  const ruleCopy = new Map(
    getRuleDefinitions(locale, config).map((rule) => [rule.ruleId, rule] as const),
  );
  const issues: UiIssue[] = report.issues.map((issue) => {
    const copy = ruleCopy.get(issue.ruleId);
    const englishMessage = copy === undefined ? issue.ruleId : `${copy.name}. ${copy.description}`;
    return {
      id: issue.id,
      severity: issue.severity,
      ruleId: issue.ruleId,
      sheetName: issue.sheetName,
      rowNumber: issue.rowNumber,
      field: issue.field,
      itemCode: issue.itemCode,
      itemName: issue.itemName,
      originalValue: displayValue(issue.originalValue),
      message: locale === 'zh-CN' ? issue.message : englishMessage,
      suggestion: locale === 'zh-CN' ? issue.remediation : (copy?.suggestion ?? issue.remediation),
      context: issueContext(report.rows[issue.sheetName] ?? [], issue.rowNumber),
      ...(issue.calculation === undefined
        ? {}
        : {
            calculatedValue: issue.calculation.expected,
            difference: issue.calculation.difference,
          }),
    };
  });
  return {
    checkedAt: report.checkedAt,
    summary: {
      totalRows: report.summary.detailRows,
      sheetsChecked: report.summary.checkedSheets,
      errors: report.summary.errors,
      warnings: report.summary.warnings,
      infos: report.summary.infos,
      passedRules: report.summary.passedRules,
      durationMs: report.summary.durationMs,
    },
    issues,
  };
}

function parseProgress(event: ProgressEvent): ProgressState {
  if (event.stage === 'snapshotting') {
    return {
      phase: 'parsing',
      percent: 25 + event.percent * 0.75,
      ...(event.sheetName === undefined ? {} : { detail: event.sheetName }),
    };
  }
  return { phase: 'parsing', percent: 5 + event.percent * 0.2 };
}

function checkProgress(event: ProgressEvent): ProgressState {
  if (event.stage === 'mapping') {
    return {
      phase: 'mapping',
      percent: 10 + event.percent * 0.2,
      ...(event.sheetName === undefined ? {} : { detail: event.sheetName }),
    };
  }
  if (event.stage === 'checking') {
    return {
      phase: 'checking',
      percent: 30 + event.percent * 0.6,
      ...(event.sheetName === undefined ? {} : { detail: event.sheetName }),
    };
  }
  if (event.stage === 'finalizing') {
    return { phase: 'reporting', percent: 90 + event.percent * 0.1 };
  }
  if (event.stage === 'complete') return { phase: 'reporting', percent: 100 };
  return { phase: 'parsing', percent: Math.min(10, event.percent * 0.1) };
}

function saveDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function App() {
  const [locale, setLocale] = useState<Locale>(browserLocale);
  const [theme, setTheme] = useState<ThemePreference>(browserTheme);
  const [step, setStep] = useState<AppStep>('import');
  const [mode, setMode] = useState<CheckMode>('unpriced');
  const [loading, setLoading] = useState(false);
  const [parseState, setParseState] = useState<ProgressState>({ phase: 'parsing', percent: 0 });
  const [fileSummary, setFileSummary] = useState<FileSummary | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheets, setSheets] = useState<readonly SheetMapping[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [checkState, setCheckState] = useState<ProgressState>({ phase: 'mapping', percent: 0 });
  const [checkError, setCheckError] = useState<string | null>(null);
  const [report, setReport] = useState<LintReport | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'json' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ruleConfig, setRuleConfig] = useState<RuleConfig>(initialRuleConfig);
  const [settingsStatus, setSettingsStatus] = useState<'imported' | 'restored' | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const operationRef = useRef(0);
  const messages = getMessages(locale);
  const settingsConfig = useMemo(() => uiRuleConfig(ruleConfig), [ruleConfig]);
  const result = useMemo(
    () => (report === null ? null : toUiResult(report, locale, settingsConfig)),
    [locale, report, settingsConfig],
  );
  const isSocialPreview = new URLSearchParams(window.location.search).get('social') === '1';

  useEffect(() => {
    document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
    writePreference(LANGUAGE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    applyTheme(theme);
    writePreference(THEME_STORAGE_KEY, theme);
    if (theme !== 'auto' || window.matchMedia === undefined) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('auto');
    query.addEventListener?.('change', handleChange);
    return () => query.removeEventListener?.('change', handleChange);
  }, [theme]);

  useEffect(() => {
    try {
      saveRuleConfig(ruleConfig);
    } catch {
      // The app remains usable when browser storage is unavailable.
    }
  }, [ruleConfig]);

  const friendlyError = (error: unknown): string => {
    if (error instanceof BoqLintError) {
      const byCode = {
        UNSUPPORTED_XLS: messages.errorXls,
        ENCRYPTED_WORKBOOK: messages.errorEncrypted,
        CORRUPT_WORKBOOK: messages.errorCorrupt,
        EMPTY_FILE: messages.errorCorrupt,
        EMPTY_WORKBOOK: messages.errorEmptyWorkbook,
        NO_VISIBLE_SHEET: messages.errorNoVisibleSheet,
        HEADER_NOT_FOUND: messages.errorHeader,
        NO_DETAIL_ROWS: messages.errorNoDetails,
        INVALID_CONFIG: messages.errorInvalidConfig,
      } as const;
      return byCode[error.code];
    }
    if (error instanceof RangeError) return messages.errorTooLarge;
    return messages.errorGeneric;
  };

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setImportError(null);
    setCheckError(null);
    setExportError(null);
  };

  const clear = () => {
    operationRef.current += 1;
    setLoading(false);
    setStep('import');
    setFileSummary(null);
    setWorkbook(null);
    setSheets([]);
    setImportError(null);
    setCheckError(null);
    setReport(null);
    setExportError(null);
    setParseState({ phase: 'parsing', percent: 0 });
    setCheckState({ phase: 'mapping', percent: 0 });
  };

  const loadInput = async (input: Blob, name: string, source: FileSummary['source']) => {
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setLoading(true);
    setImportError(null);
    setReport(null);
    setParseState({ phase: 'parsing', percent: 2 });
    try {
      const parsed = await parseWorkbook(input, {
        fileName: name,
        onProgress: (event) => {
          if (operationRef.current === operation) setParseState(parseProgress(event));
        },
      });
      if (operationRef.current !== operation) return;
      setWorkbook(parsed);
      setSheets(parsed.sheets.map(sheetMapping));
      setFileSummary({
        name: parsed.file.name,
        size: parsed.file.size,
        sheetCount: parsed.file.sheetCount,
        source,
      });
      setParseState({ phase: 'parsing', percent: 100 });
    } catch (error) {
      if (operationRef.current !== operation) return;
      setWorkbook(null);
      setSheets([]);
      setFileSummary(null);
      setImportError(friendlyError(error));
    } finally {
      if (operationRef.current === operation) setLoading(false);
    }
  };

  const handleFile = (file: File) => {
    if (!/\.xlsx$/iu.test(file.name)) {
      operationRef.current += 1;
      setLoading(false);
      setImportError(
        file.name.toLocaleLowerCase().endsWith('.xls')
          ? messages.errorXls
          : messages.errorUnsupported,
      );
      setFileSummary(null);
      setWorkbook(null);
      setSheets([]);
      return;
    }
    void loadInput(file, file.name, 'file');
  };

  const handleSample = async (sample: keyof typeof SAMPLE_FILES) => {
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    const path = SAMPLE_FILES[sample];
    setLoading(true);
    setImportError(null);
    try {
      if (window.location.protocol === 'file:') {
        const blob = await createOfflineSample(sample);
        if (operationRef.current !== operation) return;
        await loadInput(blob, path.split('/').at(-1) ?? 'boq-sample.xlsx', 'sample');
        return;
      }
      const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (operationRef.current !== operation) return;
      await loadInput(blob, path.split('/').at(-1) ?? 'boq-sample.xlsx', 'sample');
    } catch (error) {
      if (operationRef.current !== operation) return;
      setLoading(false);
      setImportError(friendlyError(error));
    }
  };

  const selectedSheets = sheets.filter((sheet) => sheet.selected);
  const mappingReady =
    selectedSheets.length > 0 &&
    selectedSheets.every((sheet) =>
      REQUIRED_FIELDS[mode].every((field) => sheet.mapping[field] !== undefined),
    );
  const mappingError =
    selectedSheets.length === 0
      ? messages.noSheetSelected
      : mappingReady
        ? null
        : messages.mappingMissing;

  const changeHeaderRow = (sheetId: string, headerRow: number) => {
    const sourceSheet = workbook?.sheets.find((sheet) => String(sheet.index) === sheetId);
    if (sourceSheet === undefined) return;
    const candidate = mapWorksheetHeader(sourceSheet, headerRow);
    setSheets((current) =>
      current.map((sheet) =>
        sheet.id === sheetId
          ? {
              ...sheet,
              headerRow,
              headerConfidence: confidence(candidate?.score),
              headers: headerCells(sourceSheet, headerRow),
              previewRows: previewRows(sourceSheet, headerRow),
              mapping: { ...(candidate?.mapping ?? {}) },
            }
          : sheet,
      ),
    );
  };

  const changeMapping = (sheetId: string, field: StandardField, column: number | null) => {
    setSheets((current) =>
      current.map((sheet) => {
        if (sheet.id !== sheetId) return sheet;
        const mapping = { ...sheet.mapping };
        if (column === null) delete mapping[field];
        else mapping[field] = column;
        return { ...sheet, mapping };
      }),
    );
  };

  const runCheck = async () => {
    if (workbook === null || !mappingReady) return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setStep('check');
    setCheckError(null);
    setReport(null);
    setCheckState({ phase: 'mapping', percent: 2 });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const nextReport = await runLint(workbook, {
        mode,
        sheets: selectedSheets.map((sheet) => sheet.name),
        mappings: Object.fromEntries(selectedSheets.map((sheet) => [sheet.name, sheet.mapping])),
        headerRows: Object.fromEntries(
          selectedSheets.map((sheet) => [sheet.name, sheet.headerRow]),
        ),
        config: ruleConfig,
        batchSize: 200,
        onProgress: (event) => {
          if (operationRef.current === operation) setCheckState(checkProgress(event));
        },
      });
      if (operationRef.current !== operation) return;
      setReport(nextReport);
      setCheckState({ phase: 'reporting', percent: 100 });
      setStep('results');
    } catch (error) {
      if (operationRef.current !== operation) return;
      setCheckError(friendlyError(error));
    }
  };

  const handleExport = async (format: 'csv' | 'json' | 'xlsx') => {
    if (report === null) return;
    setExporting(format);
    setExportError(null);
    try {
      const date = new Date(report.checkedAt);
      const xlsxName = formatReportFileName(report.file.name, date);
      const fileName = format === 'xlsx' ? xlsxName : xlsxName.replace(/\.xlsx$/u, `.${format}`);
      const blob =
        format === 'csv'
          ? exportCsv(report)
          : format === 'json'
            ? exportJson(report)
            : await exportXlsx(report);
      saveDownload(blob, fileName);
    } catch {
      setExportError(messages.exportError);
    } finally {
      setExporting(null);
    }
  };

  const updateRule = (ruleId: string, enabled: boolean) => {
    if (!RULE_IDS.includes(ruleId as RuleId)) return;
    const typedId = ruleId as RuleId;
    if (RULE_METADATA[typedId].core) return;
    setRuleConfig((current) => ({
      ...current,
      rules: { ...current.rules, [typedId]: { enabled } },
    }));
    setSettingsStatus(null);
    setSettingsError(false);
  };

  const updateTolerance = (value: string) => {
    if (value.trim() !== value || value.length === 0) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return;
    setRuleConfig((current) => ({ ...current, calcTolerance: value }));
    setSettingsStatus(null);
    setSettingsError(false);
  };

  const importConfig = (text: string): string | null => {
    try {
      const imported = importRuleConfig(text);
      setRuleConfig(imported);
      setSettingsStatus('imported');
      setSettingsError(false);
      return uiRuleConfig(imported).calcTolerance;
    } catch {
      setSettingsStatus(null);
      setSettingsError(true);
      return null;
    }
  };

  if (isSocialPreview) return <SocialPreview messages={messages} />;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {messages.skipToContent}
      </a>
      <AppHeader
        locale={locale}
        theme={theme}
        messages={messages}
        onLocaleChange={changeLocale}
        onThemeChange={setTheme}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setSettingsStatus(null);
          setSettingsError(false);
        }}
      />
      <main className="app-main" id="main-content" tabIndex={-1}>
        <StepIndicator activeStep={step} messages={messages} />

        {step === 'import' && (
          <ImportStep
            messages={messages}
            mode={mode}
            loading={loading}
            progress={parseState}
            fileSummary={fileSummary}
            error={importError}
            onModeChange={setMode}
            onFile={handleFile}
            onSample={(sample) => void handleSample(sample)}
            onClear={clear}
            onContinue={() => setStep('mapping')}
          />
        )}

        {step === 'mapping' && (
          <MappingStep
            messages={messages}
            mode={mode}
            sheets={sheets}
            error={mappingError}
            ready={mappingReady}
            onToggleSheet={(sheetId, selected) =>
              setSheets((current) =>
                current.map((sheet) => (sheet.id === sheetId ? { ...sheet, selected } : sheet)),
              )
            }
            onSelectAll={(selected) =>
              setSheets((current) =>
                current.map((sheet) => ({
                  ...sheet,
                  selected: selected && sheet.state === 'visible',
                })),
              )
            }
            onHeaderRowChange={changeHeaderRow}
            onMappingChange={changeMapping}
            onBack={() => setStep('import')}
            onRun={() => void runCheck()}
          />
        )}

        {step === 'check' && (
          <CheckingStep
            messages={messages}
            progress={checkState}
            error={checkError}
            onBack={() => setStep('mapping')}
          />
        )}

        {step === 'results' && result !== null && (
          <ResultsStep
            locale={locale}
            messages={messages}
            result={result}
            exporting={exporting}
            exportError={exportError}
            onExport={(format) => void handleExport(format)}
            onBack={() => setStep('mapping')}
            onRecheck={() => void runCheck()}
            onNewFile={clear}
          />
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <strong>
            {messages.appName} / {messages.brandDescriptor}
          </strong>
          <p>{messages.footerBoundary}</p>
        </div>
      </footer>

      {settingsOpen && (
        <SettingsDrawer
          open
          locale={locale}
          messages={messages}
          config={settingsConfig}
          status={settingsStatus}
          error={settingsError}
          onClose={() => setSettingsOpen(false)}
          onToleranceChange={updateTolerance}
          onRuleToggle={updateRule}
          onRestore={() => {
            setRuleConfig(DEFAULT_RULE_CONFIG);
            setSettingsStatus('restored');
            setSettingsError(false);
            return uiRuleConfig(DEFAULT_RULE_CONFIG).calcTolerance;
          }}
          onImport={importConfig}
          onExport={() =>
            saveDownload(
              new Blob([exportRuleConfig(ruleConfig)], { type: 'application/json;charset=utf-8' }),
              'boq-lint-rule-config.json',
            )
          }
        />
      )}
    </div>
  );
}
