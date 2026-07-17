import { Check, FileXls, GearSix, Moon, Sun, Translate } from '@phosphor-icons/react';
import type { AppStep, Locale, ThemePreference } from './types';
import type { Messages } from './i18n';

interface AppHeaderProps {
  readonly locale: Locale;
  readonly theme: ThemePreference;
  readonly messages: Messages;
  readonly onLocaleChange: (locale: Locale) => void;
  readonly onThemeChange: (theme: ThemePreference) => void;
  readonly onOpenSettings: () => void;
}

export function AppHeader({
  locale,
  theme,
  messages,
  onLocaleChange,
  onThemeChange,
  onOpenSettings,
}: AppHeaderProps) {
  return (
    <header className="app-header" data-testid="app-header">
      <div className="header-inner">
        <a
          className="brand"
          href="#main-content"
          aria-label={messages.appName}
          data-testid="header-logo"
        >
          <span className="brand-mark" aria-hidden="true">
            <FileXls size={22} weight="duotone" />
          </span>
          <span className="brand-copy">
            <strong>{messages.appName}</strong>
            <span>{messages.brandDescriptor}</span>
          </span>
        </a>

        <div className="header-actions">
          <label className="compact-select theme-select">
            {theme === 'dark' ? (
              <Moon size={18} aria-hidden="true" />
            ) : (
              <Sun size={18} aria-hidden="true" />
            )}
            <span className="sr-only">{messages.theme}</span>
            <select
              aria-label={messages.theme}
              value={theme}
              onChange={(event) => onThemeChange(event.target.value as ThemePreference)}
              data-testid="theme-toggle"
            >
              <option value="auto">{messages.themeAuto}</option>
              <option value="light">{messages.themeLight}</option>
              <option value="dark">{messages.themeDark}</option>
            </select>
          </label>

          <button
            type="button"
            className="button button-quiet header-button"
            onClick={() => onLocaleChange(locale === 'zh-CN' ? 'en' : 'zh-CN')}
            aria-label={locale === 'zh-CN' ? messages.switchToEnglish : messages.switchToChinese}
            data-testid="language-toggle"
          >
            <Translate size={19} aria-hidden="true" />
            <span>{locale === 'zh-CN' ? 'EN' : '中文'}</span>
          </button>

          <button
            type="button"
            className="button button-secondary header-button settings-button"
            onClick={onOpenSettings}
            aria-label={messages.openSettings}
            data-testid="settings-button"
          >
            <GearSix size={19} aria-hidden="true" />
            <span>{messages.settingsTitle}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

interface StepIndicatorProps {
  readonly activeStep: AppStep;
  readonly messages: Messages;
}

const STEPS: readonly AppStep[] = ['import', 'mapping', 'results'];

export function StepIndicator({ activeStep, messages }: StepIndicatorProps) {
  const activeIndex = STEPS.indexOf(activeStep);
  const labels: Record<AppStep, string> = {
    import: messages.stepImport,
    mapping: messages.stepMapping,
    results: messages.stepResults,
  };

  return (
    <nav className="stepper-wrap" aria-label={messages.stepNavigation} data-testid="stepper">
      <ol className="stepper">
        {STEPS.map((step, index) => {
          const complete = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li
              key={step}
              className={`stepper-item${active ? ' is-active' : ''}${complete ? ' is-complete' : ''}`}
              aria-current={active ? 'step' : undefined}
              data-testid={`step-${step}`}
            >
              <span className="step-index" aria-hidden="true">
                {complete ? <Check size={15} weight="bold" /> : index + 1}
              </span>
              <span className="step-label">{labels[step]}</span>
              <span className="sr-only">
                {active ? messages.currentStep : complete ? messages.completedStep : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
