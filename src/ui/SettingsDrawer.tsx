import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowCounterClockwise,
  CheckCircle,
  DownloadSimple,
  Info,
  UploadSimple,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import type { Messages } from './i18n';
import { getRuleDefinitions } from './rules';
import type { Locale, UiRuleConfig } from './types';

interface SettingsDrawerProps {
  readonly open: boolean;
  readonly locale: Locale;
  readonly messages: Messages;
  readonly config: UiRuleConfig;
  readonly status: 'imported' | 'restored' | null;
  readonly error: boolean;
  readonly onClose: () => void;
  readonly onThresholdChange: (
    field: 'calcTolerance' | 'relativeTolerance' | 'dispersionRatio' | 'featureMinLength',
    value: string,
  ) => void;
  readonly onRuleToggle: (ruleId: string, enabled: boolean) => void;
  readonly onRestore: () => UiRuleConfig;
  readonly onImport: (text: string) => UiRuleConfig | null;
  readonly onExport: () => void;
}

type ThresholdField =
  'calcTolerance' | 'relativeTolerance' | 'dispersionRatio' | 'featureMinLength';

type ThresholdDrafts = Readonly<Record<ThresholdField, string>>;

function thresholdDrafts(config: UiRuleConfig): ThresholdDrafts {
  return {
    calcTolerance: config.calcTolerance,
    relativeTolerance: config.relativeTolerance,
    dispersionRatio: config.dispersionRatio,
    featureMinLength: String(config.featureMinLength),
  };
}

export function SettingsDrawer({
  open,
  locale,
  messages,
  config,
  status,
  error,
  onClose,
  onThresholdChange,
  onRuleToggle,
  onRestore,
  onImport,
  onExport,
}: SettingsDrawerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [drafts, setDrafts] = useState<ThresholdDrafts>(() => thresholdDrafts(config));
  const rules = getRuleDefinitions(locale, config);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || dialogRef.current === null) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button, input, select, [tabindex]:not([tabindex="-1"])',
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
    dialogRef.current?.querySelector<HTMLElement>('[data-testid="close-settings"]')?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = onImport(await file.text());
      if (imported !== null) setDrafts(thresholdDrafts(imported));
    } catch {
      onImport('');
    }
  };

  const updateDraft = (field: ThresholdField, value: string) => {
    setDrafts((current) => ({ ...current, [field]: value }));
  };

  const commitDraft = (field: ThresholdField) => {
    const value = drafts[field];
    const numeric = Number(value);
    const invalid =
      value.trim() !== value ||
      value.length === 0 ||
      !Number.isFinite(numeric) ||
      numeric < 0 ||
      (field === 'featureMinLength' && (!Number.isInteger(numeric) || numeric < 1));
    if (invalid) {
      setDrafts(thresholdDrafts(config));
      return;
    }
    onThresholdChange(field, value);
  };

  return (
    <div className="drawer-layer" data-testid="settings-drawer">
      <button
        className="drawer-backdrop"
        type="button"
        onClick={onClose}
        aria-label={messages.closeSettings}
      />
      <aside
        ref={dialogRef}
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="drawer-header settings-header">
          <div>
            <h2 id="settings-title">{messages.settingsTitle}</h2>
            <p>{messages.settingsIntro}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={messages.closeSettings}
            data-testid="close-settings"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="settings-content">
          <section className="tolerance-section" aria-labelledby="tolerance-title">
            <label className="field-control tolerance-control">
              <span id="tolerance-title">{messages.toleranceLabel}</span>
              <span className="input-with-suffix">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={drafts.calcTolerance}
                  onChange={(event) => updateDraft('calcTolerance', event.target.value)}
                  onBlur={() => commitDraft('calcTolerance')}
                  aria-describedby="tolerance-hint"
                  data-testid="calc-tolerance"
                />
                <span>{messages.toleranceUnit}</span>
              </span>
              <small id="tolerance-hint">{messages.toleranceHint}</small>
            </label>
            <label className="field-control tolerance-control">
              <span>{messages.relativeToleranceLabel}</span>
              <span className="input-with-suffix">
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  inputMode="decimal"
                  value={drafts.relativeTolerance}
                  onChange={(event) => updateDraft('relativeTolerance', event.target.value)}
                  onBlur={() => commitDraft('relativeTolerance')}
                  aria-describedby="relative-tolerance-hint"
                  data-testid="relative-tolerance"
                />
                <span>{messages.ratioUnit}</span>
              </span>
              <small id="relative-tolerance-hint">{messages.relativeToleranceHint}</small>
            </label>
            <label className="field-control tolerance-control">
              <span>{messages.dispersionRatioLabel}</span>
              <span className="input-with-suffix">
                <input
                  type="number"
                  min="0"
                  step="0.05"
                  inputMode="decimal"
                  value={drafts.dispersionRatio}
                  onChange={(event) => updateDraft('dispersionRatio', event.target.value)}
                  onBlur={() => commitDraft('dispersionRatio')}
                  aria-describedby="dispersion-ratio-hint"
                  data-testid="dispersion-ratio"
                />
                <span>{messages.ratioUnit}</span>
              </span>
              <small id="dispersion-ratio-hint">{messages.dispersionRatioHint}</small>
            </label>
            <label className="field-control tolerance-control">
              <span>{messages.featureMinLengthLabel}</span>
              <span className="input-with-suffix">
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={drafts.featureMinLength}
                  onChange={(event) => updateDraft('featureMinLength', event.target.value)}
                  onBlur={() => commitDraft('featureMinLength')}
                  aria-describedby="feature-min-length-hint"
                  data-testid="feature-min-length"
                />
                <span>{messages.characterUnit}</span>
              </span>
              <small id="feature-min-length-hint">{messages.featureMinLengthHint}</small>
            </label>
          </section>

          <section className="rule-settings" aria-labelledby="rules-title">
            <div className="settings-section-heading">
              <h3 id="rules-title">{messages.ruleDescription}</h3>
              <span>
                {rules.filter((rule) => rule.enabled).length} / {rules.length}
              </span>
            </div>
            <div className="rule-list">
              {rules.map((rule) => (
                <article className="rule-setting" key={rule.ruleId}>
                  <div className="rule-setting-heading">
                    <span className={`severity-badge severity-${rule.severity}`}>
                      <code>{rule.ruleId}</code>
                    </span>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        aria-label={`${rule.ruleId} ${rule.name}: ${messages.ruleEnabled}`}
                        onChange={(event) => onRuleToggle(rule.ruleId, event.target.checked)}
                        data-testid={`rule-toggle-${rule.ruleId}`}
                      />
                      <span className="switch-track" aria-hidden="true">
                        <span />
                      </span>
                      <span>{messages.ruleEnabled}</span>
                    </label>
                  </div>
                  <h4>{rule.name}</h4>
                  <p>{rule.description}</p>
                  <small>
                    <Info size={14} aria-hidden="true" />
                    {rule.suggestion}
                  </small>
                </article>
              ))}
            </div>
          </section>

          <section className="config-section">
            <input
              ref={inputRef}
              className="visually-hidden-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleImport(event)}
              tabIndex={-1}
              data-testid="config-file-input"
            />
            <div className="config-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => inputRef.current?.click()}
                data-testid="config-import"
              >
                <UploadSimple size={18} aria-hidden="true" />
                {messages.importConfig}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={onExport}
                data-testid="config-export"
              >
                <DownloadSimple size={18} aria-hidden="true" />
                {messages.exportConfig}
              </button>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setDrafts(thresholdDrafts(onRestore()))}
                data-testid="restore-defaults"
              >
                <ArrowCounterClockwise size={18} aria-hidden="true" />
                {messages.restoreDefaults}
              </button>
            </div>
            <p className="settings-storage-note">{messages.settingsSaved}</p>
            {error && (
              <div className="alert alert-error" role="alert" data-testid="config-error">
                <WarningCircle size={19} weight="fill" aria-hidden="true" />
                <p>{messages.configError}</p>
              </div>
            )}
            {status && !error && (
              <div className="alert alert-success" role="status">
                <CheckCircle size={19} weight="fill" aria-hidden="true" />
                <p>{status === 'imported' ? messages.configImported : messages.defaultRestored}</p>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
