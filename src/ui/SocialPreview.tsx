import {
  CheckCircle,
  FileXls,
  Info,
  ShieldCheck,
  Warning,
  WarningOctagon,
} from '@phosphor-icons/react';
import type { Messages } from './i18n';

export function SocialPreview({ messages }: { readonly messages: Messages }) {
  return (
    <main className="social-preview" data-testid="social-preview">
      <section className="social-copy">
        <div className="social-brand">
          <span className="social-brand-mark" aria-hidden="true">
            <FileXls size={30} weight="duotone" />
          </span>
          <span>
            <strong>{messages.appName}</strong>
            <small>{messages.brandDescriptor}</small>
          </span>
        </div>
        <h1>{messages.socialTitle}</h1>
        <p>{messages.socialSubtitle}</p>
        <div className="social-features">
          <span>
            <ShieldCheck size={18} weight="fill" aria-hidden="true" />
            {messages.socialPrivacy}
          </span>
          <span>
            <CheckCircle size={18} weight="fill" aria-hidden="true" />
            {messages.socialExport}
          </span>
        </div>
      </section>

      <section className="social-result" aria-label={messages.socialIssues}>
        <div className="social-result-heading">
          <div>
            <small>{messages.socialIssues}</small>
            <strong>{messages.resultTitle}</strong>
          </div>
          <span>
            <CheckCircle size={16} weight="fill" aria-hidden="true" />
            {messages.progressComplete}
          </span>
        </div>
        <div className="social-summary">
          <div className="is-error">
            <WarningOctagon size={18} weight="fill" />
            <span>{messages.errors}</span>
            <strong>4</strong>
          </div>
          <div className="is-warning">
            <Warning size={18} weight="fill" />
            <span>{messages.warnings}</span>
            <strong>6</strong>
          </div>
          <div className="is-info">
            <Info size={18} weight="fill" />
            <span>{messages.infos}</span>
            <strong>2</strong>
          </div>
        </div>
        <div className="social-table">
          <div className="social-table-head">
            <span>{messages.severity}</span>
            <span>{messages.ruleId}</span>
            <span>{messages.excelRow}</span>
            <span>{messages.issueDescription}</span>
          </div>
          <div className="social-table-row">
            <span className="severity-error">
              <WarningOctagon size={15} weight="fill" />
              {messages.errors}
            </span>
            <code>QG010</code>
            <strong>18</strong>
            <span>{messages.field_total_price}</span>
          </div>
          <div className="social-table-row">
            <span className="severity-warning">
              <Warning size={15} weight="fill" />
              {messages.warnings}
            </span>
            <code>QG009</code>
            <strong>24</strong>
            <span>{messages.field_unit}</span>
          </div>
          <div className="social-table-row">
            <span className="severity-info">
              <Info size={15} weight="fill" />
              {messages.infos}
            </span>
            <code>QG014</code>
            <strong>31</strong>
            <span>{messages.headerDetected}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
