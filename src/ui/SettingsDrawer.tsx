import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowCounterClockwise,
  CheckCircle,
  DownloadSimple,
  Info,
  LockKey,
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
  readonly onToleranceChange: (value: string) => void;
  readonly onRuleToggle: (ruleId: string, enabled: boolean) => void;
  readonly onRestore: () => string;
  readonly onImport: (text: string) => string | null;
  readonly onExport: () => void;
}

export function SettingsDrawer({
  open,
  locale,
  messages,
  config,
  status,
  error,
  onClose,
  onToleranceChange,
  onRuleToggle,
  onRestore,
  onImport,
  onExport,
}: SettingsDrawerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [toleranceDraft, setToleranceDraft] = useState(config.calcTolerance);
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
      const importedTolerance = onImport(await file.text());
      if (importedTolerance !== null) setToleranceDraft(importedTolerance);
    } catch {
      onImport('');
    }
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
                  value={toleranceDraft}
                  onChange={(event) => setToleranceDraft(event.target.value)}
                  onBlur={() => {
                    const numeric = Number(toleranceDraft);
                    if (
                      toleranceDraft.trim() !== toleranceDraft ||
                      toleranceDraft.length === 0 ||
                      !Number.isFinite(numeric) ||
                      numeric < 0
                    ) {
                      setToleranceDraft(config.calcTolerance);
                    } else {
                      onToleranceChange(toleranceDraft);
                    }
                  }}
                  aria-describedby="tolerance-hint"
                  data-testid="calc-tolerance"
                />
                <span>{messages.toleranceUnit}</span>
              </span>
              <small id="tolerance-hint">{messages.toleranceHint}</small>
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
                    <label className={`switch-control${rule.core ? ' is-locked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        disabled={rule.core}
                        aria-label={`${rule.ruleId} ${rule.name}: ${rule.core ? messages.coreRule : messages.ruleEnabled}`}
                        onChange={(event) => onRuleToggle(rule.ruleId, event.target.checked)}
                        data-testid={`rule-toggle-${rule.ruleId}`}
                      />
                      <span className="switch-track" aria-hidden="true">
                        <span />
                      </span>
                      <span>{rule.core ? messages.coreRule : messages.ruleEnabled}</span>
                      {rule.core && <LockKey size={14} aria-hidden="true" />}
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
                onClick={() => setToleranceDraft(onRestore())}
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
