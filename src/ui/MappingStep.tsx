import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CaretDown,
  CheckCircle,
  Eye,
  EyeSlash,
  Info,
  Table,
  WarningCircle,
} from '@phosphor-icons/react';
import { formatMessage, getFieldLabel, type Messages } from './i18n';
import { STANDARD_FIELDS, type CheckMode, type SheetMapping, type StandardField } from './types';

interface MappingStepProps {
  readonly messages: Messages;
  readonly mode: CheckMode;
  readonly sheets: readonly SheetMapping[];
  readonly error: string | null;
  readonly ready: boolean;
  readonly onToggleSheet: (sheetId: string, selected: boolean) => void;
  readonly onSelectAll: (selected: boolean) => void;
  readonly onHeaderRowChange: (sheetId: string, headerRow: number) => void;
  readonly onMappingChange: (sheetId: string, field: StandardField, column: number | null) => void;
  readonly onBack: () => void;
  readonly onRun: () => void;
}

const UNPRICED_REQUIRED: readonly StandardField[] = ['item_code', 'item_name', 'unit', 'quantity'];
const PRICED_REQUIRED: readonly StandardField[] = [
  ...UNPRICED_REQUIRED,
  'unit_price',
  'total_price',
];

function columnName(column: number): string {
  let value = column;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function sheetStateLabel(sheet: SheetMapping, messages: Messages): string {
  if (sheet.state === 'hidden') return messages.hiddenSheet;
  if (sheet.state === 'veryHidden') return messages.veryHiddenSheet;
  return messages.visibleSheet;
}

export function MappingStep({
  messages,
  mode,
  sheets,
  error,
  ready,
  onToggleSheet,
  onSelectAll,
  onHeaderRowChange,
  onMappingChange,
  onBack,
  onRun,
}: MappingStepProps) {
  const [activeSheetId, setActiveSheetId] = useState<string>(sheets[0]?.id ?? '');
  const [headerDraft, setHeaderDraft] = useState(String(sheets[0]?.headerRow ?? 1));

  const activeSheet = sheets.find((sheet) => sheet.id === activeSheetId) ?? sheets[0];
  const selectedCount = sheets.filter((sheet) => sheet.selected).length;
  const visibleCount = sheets.filter((sheet) => sheet.state === 'visible').length;
  const required = mode === 'priced' ? PRICED_REQUIRED : UNPRICED_REQUIRED;
  const mappedColumns = useMemo(() => {
    if (!activeSheet) return [];
    return activeSheet.headers.map((header) => ({
      ...header,
      label: `${columnName(header.column)} - ${header.text || messages.notAvailable}`,
    }));
  }, [activeSheet, messages.notAvailable]);

  return (
    <section
      className="step-page mapping-page"
      aria-labelledby="mapping-title"
      data-testid="mapping-page"
    >
      <div className="page-heading">
        <div>
          <h1 id="mapping-title">{messages.mappingTitle}</h1>
          <p>{messages.mappingIntro}</p>
        </div>
        <div className="selection-count" aria-live="polite">
          <Table size={20} aria-hidden="true" />
          <span>
            {messages.selectedSheets}:{' '}
            <strong data-testid="selected-sheet-count">{selectedCount}</strong>
          </span>
        </div>
      </div>

      <div className="mapping-workspace">
        <aside className="sheet-sidebar" aria-label={messages.selectedSheets}>
          <div className="sheet-sidebar-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => onSelectAll(true)}
              disabled={visibleCount === 0}
              data-testid="select-all-sheets"
            >
              {messages.selectAllSheets}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => onSelectAll(false)}
              disabled={selectedCount === 0}
              data-testid="clear-sheet-selection"
            >
              {messages.clearSheetSelection}
            </button>
          </div>
          <div className="sheet-list" role="tablist" aria-orientation="vertical">
            {sheets.map((sheet, index) => {
              const hidden = sheet.state !== 'visible';
              return (
                <div
                  className={`sheet-list-item${activeSheet?.id === sheet.id ? ' is-active' : ''}${hidden ? ' is-hidden' : ''}`}
                  key={sheet.id}
                >
                  <label className="sheet-checkbox">
                    <input
                      type="checkbox"
                      checked={sheet.selected}
                      onChange={(event) => onToggleSheet(sheet.id, event.target.checked)}
                      data-testid={`sheet-checkbox-${index}`}
                    />
                    <span className="sr-only">{sheet.name}</span>
                  </label>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeSheet?.id === sheet.id}
                    className="sheet-tab"
                    onClick={() => {
                      setActiveSheetId(sheet.id);
                      setHeaderDraft(String(sheet.headerRow));
                    }}
                    data-testid={`sheet-tab-${index}`}
                  >
                    <span className="sheet-name">{sheet.name}</span>
                    <span className="sheet-meta">
                      {hidden ? (
                        <EyeSlash size={14} aria-hidden="true" />
                      ) : (
                        <Eye size={14} aria-hidden="true" />
                      )}
                      {sheetStateLabel(sheet, messages)}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        {activeSheet ? (
          <div className="mapping-detail" role="tabpanel">
            <div className="sheet-detail-heading">
              <div>
                <h2>{activeSheet.name}</h2>
                <p>
                  {formatMessage(messages, 'rowsAndColumns', {
                    rows: activeSheet.maxRow,
                    columns: activeSheet.maxColumn,
                  })}
                </p>
              </div>
              <label className="field-control header-row-control">
                <span>{messages.headerRow}</span>
                <div className="number-input-wrap">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={headerDraft}
                    onChange={(event) => {
                      const value = event.target.value;
                      setHeaderDraft(value);
                      const next = Number(value);
                      if (Number.isInteger(next) && next >= 1 && next <= 50) {
                        onHeaderRowChange(activeSheet.id, next);
                      }
                    }}
                    onBlur={() => {
                      const next = Number(headerDraft);
                      if (!Number.isInteger(next) || next < 1 || next > 50) {
                        setHeaderDraft(String(activeSheet.headerRow));
                      }
                    }}
                    aria-describedby="header-row-hint"
                    data-testid={`header-row-${sheets.indexOf(activeSheet)}`}
                  />
                </div>
                <small id="header-row-hint">{messages.headerManualHint}</small>
              </label>
            </div>

            <div
              className={`confidence-note${activeSheet.headerConfidence < 0.5 ? ' is-warning' : ''}`}
            >
              {activeSheet.headerConfidence < 0.5 ? (
                <WarningCircle size={18} weight="fill" aria-hidden="true" />
              ) : (
                <CheckCircle size={18} weight="fill" aria-hidden="true" />
              )}
              <span>
                {activeSheet.headerConfidence < 0.5
                  ? messages.headerLowConfidence
                  : `${messages.headerDetected} ${Math.round(activeSheet.headerConfidence * 100)}%`}
              </span>
            </div>

            <section className="mapping-section" aria-labelledby="field-mapping-title">
              <h3 id="field-mapping-title">{messages.fieldMapping}</h3>
              <div className="field-mapping-grid">
                {STANDARD_FIELDS.map((field) => {
                  const isRequired = required.includes(field);
                  return (
                    <label className="mapping-control" key={field}>
                      <span className="mapping-label">
                        <span>{getFieldLabel(messages, field)}</span>
                        <small className={isRequired ? 'required-label' : ''}>
                          {isRequired ? messages.requiredField : messages.optionalField}
                        </small>
                      </span>
                      <span className="select-wrap">
                        <select
                          value={activeSheet.mapping[field] ?? ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            onMappingChange(activeSheet.id, field, value ? Number(value) : null);
                          }}
                          data-testid={`mapping-${field}`}
                        >
                          <option value="">{messages.notMapped}</option>
                          {mappedColumns.map((column) => (
                            <option key={column.column} value={column.column}>
                              {column.label}
                            </option>
                          ))}
                        </select>
                        <CaretDown size={16} aria-hidden="true" />
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="preview-section" aria-labelledby="preview-title">
              <div className="section-heading-compact">
                <div>
                  <h3 id="preview-title">{messages.previewTitle}</h3>
                  <p>{messages.previewDescription}</p>
                </div>
              </div>
              {activeSheet.previewRows.length === 0 ? (
                <div className="empty-state compact-empty">
                  <Info size={24} aria-hidden="true" />
                  <p>{messages.emptyPreview}</p>
                </div>
              ) : (
                <div
                  className="table-scroll preview-scroll"
                  data-testid="preview-table"
                  tabIndex={0}
                >
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        {activeSheet.headers.map((header) => (
                          <th scope="col" key={header.column}>
                            <span>{columnName(header.column)}</span>
                            <small>{header.text || messages.notAvailable}</small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeSheet.previewRows.slice(0, 10).map((row) => (
                        <tr key={row.rowNumber}>
                          <th scope="row">{row.rowNumber}</th>
                          {activeSheet.headers.map((header) => (
                            <td key={header.column}>
                              {row.cells.find((cell) => cell.column === header.column)?.text ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="empty-state">
            <WarningCircle size={28} aria-hidden="true" />
            <p>{messages.noSheetSelected}</p>
          </div>
        )}
      </div>

      <div className="sticky-actions">
        <div className={`mapping-status${ready ? ' is-ready' : ' is-warning'}`} aria-live="polite">
          {ready ? (
            <CheckCircle size={19} weight="fill" aria-hidden="true" />
          ) : (
            <WarningCircle size={19} weight="fill" aria-hidden="true" />
          )}
          <span>{error ?? (ready ? messages.mappingReady : messages.mappingMissing)}</span>
        </div>
        <div className="action-group">
          <button
            type="button"
            className="button button-secondary"
            onClick={onBack}
            data-testid="back-import"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {messages.backToImport}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={onRun}
            disabled={!ready}
            data-testid="run-check"
          >
            {messages.startCheck}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
