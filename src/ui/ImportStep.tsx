import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  ArrowRight,
  CheckCircle,
  FileArrowDown,
  FileXls,
  HardDrives,
  ShieldCheck,
  Trash,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react';
import type { Messages } from './i18n';
import type { CheckMode, FileSummary, ProgressState } from './types';

interface ImportStepProps {
  readonly messages: Messages;
  readonly mode: CheckMode;
  readonly loading: boolean;
  readonly progress: ProgressState;
  readonly fileSummary: FileSummary | null;
  readonly error: string | null;
  readonly onModeChange: (mode: CheckMode) => void;
  readonly onFile: (file: File) => void;
  readonly onSample: (sample: 'valid' | 'issues') => void;
  readonly onClear: () => void;
  readonly onContinue: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportStep({
  messages,
  mode,
  loading,
  progress,
  fileSummary,
  error,
  onModeChange,
  onFile,
  onSample,
  onClear,
  onContinue,
}: ImportStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <section
      className="step-page import-page"
      aria-labelledby="import-title"
      data-testid="import-page"
    >
      <div className="intro-layout">
        <div className="intro-copy">
          <h1 id="import-title">{messages.importTitle}</h1>
          <p>{messages.importIntro}</p>
        </div>
        <div className="trust-panel" aria-label={messages.privacyShort}>
          <ShieldCheck size={28} weight="duotone" aria-hidden="true" />
          <div>
            <strong data-testid="privacy-message">{messages.privacyShort}</strong>
            <p>{messages.privacyDetail}</p>
          </div>
        </div>
      </div>

      <div className="import-grid">
        <div className="import-primary">
          <fieldset className="mode-fieldset">
            <legend>{messages.modeLegend}</legend>
            <div className="mode-grid">
              <label className={`mode-card${mode === 'unpriced' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="check-mode"
                  value="unpriced"
                  checked={mode === 'unpriced'}
                  onChange={() => onModeChange('unpriced')}
                  data-testid="mode-unpriced"
                />
                <span className="mode-radio" aria-hidden="true" />
                <span className="mode-body">
                  <strong>{messages.unpricedTitle}</strong>
                  <span>{messages.unpricedDescription}</span>
                  <small>
                    {messages.modeRequired}: {messages.unpricedFields}
                  </small>
                </span>
              </label>

              <label className={`mode-card${mode === 'priced' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="check-mode"
                  value="priced"
                  checked={mode === 'priced'}
                  onChange={() => onModeChange('priced')}
                  data-testid="mode-priced"
                />
                <span className="mode-radio" aria-hidden="true" />
                <span className="mode-body">
                  <strong>{messages.pricedTitle}</strong>
                  <span>{messages.pricedDescription}</span>
                  <small>
                    {messages.modeRequired}: {messages.pricedFields}
                  </small>
                </span>
              </label>
            </div>
          </fieldset>

          {!fileSummary ? (
            <div
              className={`drop-zone${dragging ? ' is-dragging' : ''}${loading ? ' is-loading' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setDragging(false);
              }}
              onDrop={handleDrop}
              data-testid="dropzone"
            >
              <input
                ref={inputRef}
                className="visually-hidden-input"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleInput}
                data-testid="file-input"
                aria-label={messages.fileInputLabel}
                tabIndex={-1}
              />
              <span className="drop-icon" aria-hidden="true">
                {loading ? (
                  <FileArrowDown size={34} weight="duotone" />
                ) : (
                  <UploadSimple size={34} />
                )}
              </span>
              <h2>
                {loading
                  ? messages.loadingFile
                  : dragging
                    ? messages.uploadActive
                    : messages.uploadTitle}
              </h2>
              <p>{messages.uploadDescription}</p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                data-testid="choose-file"
              >
                <FileXls size={19} aria-hidden="true" />
                {messages.chooseFile}
              </button>
              <small>{messages.supportedFormat}</small>
              {loading && (
                <div className="import-progress" aria-live="polite">
                  <span>
                    {messages.phaseParsing} <strong>{Math.round(progress.percent)}%</strong>
                  </span>
                  <span
                    className="loading-bar"
                    role="progressbar"
                    aria-label={messages.phaseParsing}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress.percent)}
                    data-testid="parse-progress"
                  >
                    <span style={{ transform: `scaleX(${progress.percent / 100})` }} />
                  </span>
                  {progress.detail && <small>{progress.detail}</small>}
                </div>
              )}
            </div>
          ) : (
            <div className="file-card" data-testid="file-summary" aria-live="polite">
              <div className="file-card-heading">
                <span className="file-card-icon" aria-hidden="true">
                  <CheckCircle size={28} weight="fill" />
                </span>
                <div>
                  <h2>{messages.loadedFile}</h2>
                  <span className="source-label">
                    {fileSummary.source === 'sample'
                      ? messages.fileSourceSample
                      : messages.fileSourceLocal}
                  </span>
                </div>
              </div>
              <dl className="file-metadata">
                <div>
                  <dt>{messages.fileName}</dt>
                  <dd title={fileSummary.name}>{fileSummary.name}</dd>
                </div>
                <div>
                  <dt>{messages.fileSize}</dt>
                  <dd>{formatFileSize(fileSummary.size)}</dd>
                </div>
                <div>
                  <dt>{messages.sheetCount}</dt>
                  <dd>
                    {fileSummary.sheetCount} {messages.sheetsUnit}
                  </dd>
                </div>
              </dl>
              <div className="file-card-actions">
                <button
                  type="button"
                  className="button button-danger-quiet"
                  onClick={onClear}
                  data-testid="clear-all"
                >
                  <Trash size={18} aria-hidden="true" />
                  {messages.clearFile}
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={onContinue}
                  data-testid="continue-mapping"
                >
                  {messages.continueMapping}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-error" role="alert" data-testid="import-error">
              <WarningCircle size={22} weight="fill" aria-hidden="true" />
              <div>
                <strong>{messages.importErrorTitle}</strong>
                <p>{error}</p>
              </div>
            </div>
          )}
        </div>

        <aside className="import-aside">
          <section className="sample-section" aria-labelledby="sample-title">
            <div className="aside-icon" aria-hidden="true">
              <HardDrives size={24} weight="duotone" />
            </div>
            <h2 id="sample-title">{messages.sampleTitle}</h2>
            <p>{messages.sampleDescription}</p>
            <div className="sample-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onSample('valid')}
                disabled={loading}
                data-testid="sample-valid"
              >
                <CheckCircle size={18} aria-hidden="true" />
                {messages.sampleValid}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onSample('issues')}
                disabled={loading}
                data-testid="sample-issues"
              >
                <WarningCircle size={18} aria-hidden="true" />
                {messages.sampleIssues}
              </button>
            </div>
          </section>

          <section className="workflow-section" aria-labelledby="workflow-title">
            <h2 id="workflow-title">{messages.workflowTitle}</h2>
            <p>{messages.workflowText}</p>
          </section>
        </aside>
      </div>
    </section>
  );
}
