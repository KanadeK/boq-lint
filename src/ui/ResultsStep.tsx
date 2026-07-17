import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowClockwise,
  ArrowLeft,
  Broom,
  CaretLeft,
  CaretRight,
  CheckCircle,
  DownloadSimple,
  FileCsv,
  FileJs,
  FileXls,
  Funnel,
  Info,
  MagnifyingGlass,
  Rows,
  SlidersHorizontal,
  Table,
  Warning,
  WarningOctagon,
  X,
} from '@phosphor-icons/react';
import { formatMessage, getFieldLabel, type Messages } from './i18n';
import { STANDARD_FIELDS, type Locale, type Severity, type UiIssue, type UiResult } from './types';

interface ResultsStepProps {
  readonly locale: Locale;
  readonly messages: Messages;
  readonly result: UiResult;
  readonly exporting: 'csv' | 'json' | 'xlsx' | null;
  readonly exportError: string | null;
  readonly onExport: (format: 'csv' | 'json' | 'xlsx') => void;
  readonly onBack: () => void;
  readonly onRecheck: () => void;
  readonly onNewFile: () => void;
  readonly onOpenSettings: () => void;
}

function SeverityMark({ severity }: { readonly severity: Severity }) {
  if (severity === 'error') return <WarningOctagon size={17} weight="fill" aria-hidden="true" />;
  if (severity === 'warning') return <Warning size={17} weight="fill" aria-hidden="true" />;
  return <Info size={17} weight="fill" aria-hidden="true" />;
}

function IssueContext({
  issue,
  messages,
  onClose,
}: {
  readonly issue: UiIssue;
  readonly messages: Messages;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || dialogRef.current === null) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hasAttribute('disabled'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    dialogRef.current?.querySelector<HTMLElement>('[data-testid="close-context"]')?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="drawer-layer" data-testid="issue-context">
      <button
        className="drawer-backdrop"
        type="button"
        onClick={onClose}
        aria-label={messages.closeContext}
      />
      <aside
        ref={dialogRef}
        className="context-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-title"
      >
        <div className="drawer-header">
          <div>
            <h2 id="context-title">{messages.contextTitle}</h2>
            <p>
              {formatMessage(messages, 'contextDescription', {
                sheet: issue.sheetName,
                row: issue.rowNumber,
              })}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={messages.closeContext}
            data-testid="close-context"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={`issue-context-summary severity-${issue.severity}`}>
          <SeverityMark severity={issue.severity} />
          <div>
            <strong>{issue.ruleId}</strong>
            <p>{issue.message}</p>
          </div>
        </div>

        {issue.context.length > 0 ? (
          <div className="context-rows">
            {issue.context.map((row) => (
              <section
                className={`context-row${row.isIssueRow ? ' is-issue-row' : ''}`}
                key={row.rowNumber}
              >
                <div className="context-row-heading">
                  <strong>
                    {messages.excelRow} {row.rowNumber}
                  </strong>
                  {row.isIssueRow && <span>{messages.issueRow}</span>}
                </div>
                <dl>
                  {STANDARD_FIELDS.map((field) => {
                    const value = row.values[field];
                    if (!value) return null;
                    return (
                      <div key={field}>
                        <dt>{getFieldLabel(messages, field)}</dt>
                        <dd>{value}</dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <Info size={24} aria-hidden="true" />
            <p>{messages.notAvailable}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

export function ResultsStep({
  locale,
  messages,
  result,
  exporting,
  exportError,
  onExport,
  onBack,
  onRecheck,
  onNewFile,
  onOpenSettings,
}: ResultsStepProps) {
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [ruleId, setRuleId] = useState('all');
  const [sheet, setSheet] = useState('all');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [page, setPage] = useState(1);
  const [selectedIssue, setSelectedIssue] = useState<UiIssue | null>(null);

  const rules = useMemo(
    () => [...new Set(result.issues.map((issue) => issue.ruleId))].sort(),
    [result.issues],
  );
  const sheets = useMemo(
    () => [...new Set(result.issues.map((issue) => issue.sheetName))].sort(),
    [result.issues],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return result.issues.filter((issue) => {
      if (severity !== 'all' && issue.severity !== severity) return false;
      if (ruleId !== 'all' && issue.ruleId !== ruleId) return false;
      if (sheet !== 'all' && issue.sheetName !== sheet) return false;
      if (!query) return true;
      return [issue.itemCode, issue.itemName, issue.message]
        .join('\n')
        .toLocaleLowerCase(locale)
        .includes(query);
    });
  }, [locale, result.issues, ruleId, search, severity, sheet]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageIssues = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const labels: Record<Severity, string> = {
    error: messages.errors,
    warning: messages.warnings,
    info: messages.infos,
  };
  const hasFilters = severity !== 'all' || ruleId !== 'all' || sheet !== 'all' || search.length > 0;
  const numberFormatter = new Intl.NumberFormat(locale);

  const resetFilters = () => {
    setSeverity('all');
    setRuleId('all');
    setSheet('all');
    setSearch('');
    setPage(1);
  };

  return (
    <section
      className="step-page results-page"
      aria-labelledby="result-title"
      data-testid="results-page"
    >
      <div className="page-heading results-heading">
        <div>
          <h1 id="result-title">{messages.resultTitle}</h1>
          <p>{messages.resultIntro}</p>
        </div>
        <div className="results-heading-actions">
          <time className="checked-time" dateTime={result.checkedAt}>
            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
              new Date(result.checkedAt),
            )}
          </time>
          <button
            type="button"
            className="button button-secondary"
            onClick={onOpenSettings}
            data-testid="result-rule-settings"
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            {messages.settingsTitle}
          </button>
        </div>
      </div>

      <div className="summary-grid" aria-label={messages.resultTitle}>
        <div className="summary-item neutral" data-testid="summary-sheets">
          <Table size={21} aria-hidden="true" />
          <span>{messages.sheetsChecked}</span>
          <strong>{numberFormatter.format(result.summary.sheetsChecked)}</strong>
        </div>
        <div className="summary-item neutral" data-testid="summary-total-rows">
          <Rows size={21} aria-hidden="true" />
          <span>{messages.totalRows}</span>
          <strong>{numberFormatter.format(result.summary.totalRows)}</strong>
        </div>
        <div className="summary-item error" data-testid="summary-errors">
          <WarningOctagon size={21} weight="fill" aria-hidden="true" />
          <span>{messages.severeIssues}</span>
          <strong data-testid="error-count">{numberFormatter.format(result.summary.errors)}</strong>
        </div>
        <div className="summary-item warning" data-testid="summary-warnings">
          <Warning size={21} weight="fill" aria-hidden="true" />
          <span>{messages.warnings}</span>
          <strong data-testid="warning-count">
            {numberFormatter.format(result.summary.warnings)}
          </strong>
        </div>
        <div className="summary-item info" data-testid="summary-infos">
          <Info size={21} weight="fill" aria-hidden="true" />
          <span>{messages.infos}</span>
          <strong data-testid="info-count">{numberFormatter.format(result.summary.infos)}</strong>
        </div>
      </div>

      {result.issues.length === 0 ? (
        <div className="pass-state" data-testid="no-severe-issues">
          <CheckCircle size={42} weight="duotone" aria-hidden="true" />
          <h2>{messages.resultPassTitle}</h2>
          <p>{messages.resultPassText}</p>
        </div>
      ) : (
        <section className="issues-section" aria-labelledby="issues-title">
          <div className="issues-heading">
            <div>
              <h2 id="issues-title">{messages.issueList}</h2>
              <p>{formatMessage(messages, 'issueCount', { count: filtered.length })}</p>
            </div>
          </div>

          <div className="filter-bar" aria-label={messages.issueList}>
            <label className="filter-search">
              <span className="sr-only">{messages.searchLabel}</span>
              <MagnifyingGlass size={18} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={messages.searchPlaceholder}
                data-testid="issue-search"
              />
            </label>
            <label className="filter-control">
              <span>{messages.filterSeverity}</span>
              <select
                value={severity}
                onChange={(event) => {
                  setSeverity(event.target.value as 'all' | Severity);
                  setPage(1);
                }}
                data-testid="severity-filter"
              >
                <option value="all">{messages.filterAll}</option>
                <option value="error">{messages.errors}</option>
                <option value="warning">{messages.warnings}</option>
                <option value="info">{messages.infos}</option>
              </select>
            </label>
            <label className="filter-control">
              <span>{messages.filterRule}</span>
              <select
                value={ruleId}
                onChange={(event) => {
                  setRuleId(event.target.value);
                  setPage(1);
                }}
                data-testid="rule-filter"
              >
                <option value="all">{messages.filterAll}</option>
                {rules.map((rule) => (
                  <option key={rule} value={rule}>
                    {rule}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span>{messages.filterSheet}</span>
              <select
                value={sheet}
                onChange={(event) => {
                  setSheet(event.target.value);
                  setPage(1);
                }}
                data-testid="sheet-filter"
              >
                <option value="all">{messages.filterAll}</option>
                {sheets.map((sheetName) => (
                  <option key={sheetName} value={sheetName}>
                    {sheetName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button-quiet filter-reset"
              onClick={resetFilters}
              disabled={!hasFilters}
              data-testid="clear-filters"
            >
              <Funnel size={17} aria-hidden="true" />
              {messages.clearFilters}
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state filter-empty" data-testid="no-filtered-results">
              <MagnifyingGlass size={28} aria-hidden="true" />
              <p>{messages.noFilteredIssues}</p>
              <button type="button" className="button button-secondary" onClick={resetFilters}>
                {messages.clearFilters}
              </button>
            </div>
          ) : (
            <>
              <div
                className="table-scroll results-table-wrap"
                tabIndex={0}
                data-testid="result-table"
              >
                <table className="results-table" data-testid="issues-table">
                  <thead>
                    <tr>
                      <th scope="col">{messages.severity}</th>
                      <th scope="col">{messages.ruleId}</th>
                      <th scope="col">{messages.worksheet}</th>
                      <th scope="col">{messages.excelRow}</th>
                      <th scope="col">{messages.fieldColumn}</th>
                      <th scope="col">{messages.itemCode}</th>
                      <th scope="col">{messages.originalValue}</th>
                      <th scope="col">{messages.issueDescription}</th>
                      <th scope="col">{messages.fixSuggestion}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageIssues.map((issue, index) => (
                      <tr key={issue.id} data-testid={`issue-row-${index}`}>
                        <td>
                          <span className={`severity-badge severity-${issue.severity}`}>
                            <SeverityMark severity={issue.severity} />
                            {labels[issue.severity]}
                          </span>
                        </td>
                        <td>
                          <code>{issue.ruleId}</code>
                        </td>
                        <td>{issue.sheetName}</td>
                        <td className="number-cell">{issue.rowNumber}</td>
                        <td>
                          {issue.field ? getFieldLabel(messages, issue.field) : messages.rowLevel}
                        </td>
                        <td>{issue.itemCode || messages.notAvailable}</td>
                        <td className="raw-value" title={issue.originalValue}>
                          {issue.originalValue || messages.notAvailable}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="issue-open-button"
                            onClick={() => setSelectedIssue(issue)}
                            aria-label={formatMessage(messages, 'openContext', {
                              row: issue.rowNumber,
                            })}
                          >
                            {issue.message}
                          </button>
                          {(issue.calculatedValue || issue.difference) && (
                            <small className="calc-detail">
                              {issue.calculatedValue &&
                                `${messages.calculatedValue}: ${issue.calculatedValue}`}
                              {issue.difference && ` ${messages.difference}: ${issue.difference}`}
                            </small>
                          )}
                        </td>
                        <td>{issue.suggestion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-row">
                <label className="page-size-control">
                  <span>{messages.rowsPerPage}</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value) as 25 | 50 | 100);
                      setPage(1);
                    }}
                    data-testid="page-size"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
                <nav className="pagination" aria-label={messages.pagination}>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={safePage <= 1}
                    aria-label={messages.previousPage}
                    data-testid="previous-page"
                  >
                    <CaretLeft size={18} aria-hidden="true" />
                  </button>
                  <span>
                    {formatMessage(messages, 'pageStatus', { page: safePage, pages: totalPages })}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={safePage >= totalPages}
                    aria-label={messages.nextPage}
                    data-testid="next-page"
                  >
                    <CaretRight size={18} aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </>
          )}
        </section>
      )}

      <section className="export-section" aria-labelledby="export-title">
        <div>
          <h2 id="export-title">{messages.exportTitle}</h2>
          <p>{messages.exportDescription}</p>
        </div>
        <div className="export-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onExport('csv')}
            disabled={exporting !== null}
            data-testid="export-csv"
          >
            <FileCsv size={19} aria-hidden="true" />
            {exporting === 'csv' ? messages.exporting : messages.exportCsv}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onExport('json')}
            disabled={exporting !== null}
            data-testid="export-json"
          >
            <FileJs size={19} aria-hidden="true" />
            {exporting === 'json' ? messages.exporting : messages.exportJson}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => onExport('xlsx')}
            disabled={exporting !== null}
            data-testid="export-xlsx"
          >
            {exporting === 'xlsx' ? (
              <DownloadSimple size={19} aria-hidden="true" />
            ) : (
              <FileXls size={19} aria-hidden="true" />
            )}
            {exporting === 'xlsx' ? messages.exporting : messages.exportXlsx}
          </button>
        </div>
        {exportError && (
          <div className="alert alert-error export-alert" role="alert">
            <WarningOctagon size={20} aria-hidden="true" />
            <p>{exportError}</p>
          </div>
        )}
      </section>

      <div className="result-navigation">
        <button
          type="button"
          className="button button-secondary"
          onClick={onBack}
          data-testid="back-mapping"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          {messages.backToMapping}
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={onRecheck}
          data-testid="recheck"
        >
          <ArrowClockwise size={18} aria-hidden="true" />
          {messages.recheck}
        </button>
        <button
          type="button"
          className="button button-danger-quiet"
          onClick={onNewFile}
          data-testid="new-file"
        >
          <Broom size={18} aria-hidden="true" />
          {messages.newFile}
        </button>
      </div>

      {selectedIssue && (
        <IssueContext
          issue={selectedIssue}
          messages={messages}
          onClose={() => setSelectedIssue(null)}
        />
      )}
    </section>
  );
}
