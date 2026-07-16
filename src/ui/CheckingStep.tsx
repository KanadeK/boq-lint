import {
  ArrowLeft,
  Check,
  Circle,
  FileMagnifyingGlass,
  WarningCircle,
} from '@phosphor-icons/react';
import type { Messages } from './i18n';
import type { ProgressState } from './types';

interface CheckingStepProps {
  readonly messages: Messages;
  readonly progress: ProgressState;
  readonly error: string | null;
  readonly onBack: () => void;
}

const PHASES: readonly ProgressState['phase'][] = ['parsing', 'mapping', 'checking', 'reporting'];

export function CheckingStep({ messages, progress, error, onBack }: CheckingStepProps) {
  const activeIndex = PHASES.indexOf(progress.phase);
  const labels: Record<ProgressState['phase'], string> = {
    parsing: messages.phaseParsing,
    mapping: messages.phaseMapping,
    checking: messages.phaseChecking,
    reporting: messages.phaseReporting,
  };

  return (
    <section
      className="step-page checking-page"
      aria-labelledby="checking-title"
      data-testid="checking-page"
    >
      {error ? (
        <div className="check-error-state" role="alert" data-testid="check-error">
          <span className="error-state-icon" aria-hidden="true">
            <WarningCircle size={36} weight="duotone" />
          </span>
          <h1>{messages.checkErrorTitle}</h1>
          <p>{error}</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={onBack}
            data-testid="check-error-back"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {messages.backToMapping}
          </button>
        </div>
      ) : (
        <div className="check-progress-card">
          <span className="check-progress-icon" aria-hidden="true">
            <FileMagnifyingGlass size={38} weight="duotone" />
          </span>
          <h1 id="checking-title">{messages.checkingTitle}</h1>
          <p>{messages.checkingIntro}</p>

          <div className="progress-readout" aria-live="polite">
            <span>{labels[progress.phase]}</span>
            <strong data-testid="progress-percent">{Math.round(progress.percent)}%</strong>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={labels[progress.phase]}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.percent)}
            data-testid="check-progress"
          >
            <span
              className="progress-fill"
              style={{ transform: `scaleX(${progress.percent / 100})` }}
            />
          </div>
          {progress.detail && <p className="progress-detail">{progress.detail}</p>}

          <ol className="phase-list">
            {PHASES.map((phase, index) => {
              const complete = index < activeIndex || progress.percent === 100;
              const active = index === activeIndex && progress.percent < 100;
              return (
                <li
                  key={phase}
                  className={`${complete ? 'is-complete' : ''}${active ? ' is-active' : ''}`}
                >
                  <span className="phase-icon" aria-hidden="true">
                    {complete ? (
                      <Check size={15} weight="bold" />
                    ) : (
                      <Circle size={12} weight={active ? 'fill' : 'regular'} />
                    )}
                  </span>
                  <span>{labels[phase]}</span>
                </li>
              );
            })}
          </ol>
          <p className="check-wait-note">{messages.cancelNotAvailable}</p>
        </div>
      )}
    </section>
  );
}
