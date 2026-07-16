# Contributing to BOQLint

Thank you for helping improve BOQLint / 清单体检. Contributions should preserve four principles: local-only processing, explainable rules, low false-positive rates, and strict protection of engineering data.

## Before opening an issue

- Search existing issues and the [rule reference](docs/rules.md).
- Use the bug or feature issue form and provide the smallest useful reproduction.
- Never upload a real project workbook, client name, company name, bid price, contract information, personal data, credentials, or proprietary software export.
- Create a minimal fictional workbook or extend `scripts/generate-samples.ts` with clearly fictional data.
- Report potential vulnerabilities privately under [SECURITY.md](SECURITY.md), not in a public issue.

## Scope

Good contributions include:

- additional non-conflicting Chinese or English header aliases;
- better mapping and row-classification edge cases;
- precise, explainable, low-noise checks within the documented rule set;
- accessibility, responsive-layout, and bilingual-copy improvements;
- performance work for large local workbooks;
- report interoperability and test coverage; and
- entirely fictional, script-generated sample cases.

Please discuss proposals that materially change the product boundary before implementation. BOQLint does not accept features for cloud upload, accounts, telemetry, advertising, AI/LLM review, market-price judgment, automatic coding, costing, ERP, or final-account audit.

Do not copy substantial tables, code libraries, or text from standards, proprietary costing products, price databases, or restricted sources.

## Development setup

Requirements:

- Node.js 20 or later
- npm
- Chromium installed through Playwright for end-to-end tests

```bash
npm ci
npx playwright install chromium
npm run samples
npm run dev
```

Do not use another package manager to update the lockfile. Do not commit `node_modules/`, build output, Playwright reports, local logs, or real workbooks.

## Making a change

1. Keep the change focused and update tests with the implementation.
2. Preserve TypeScript strictness; do not hide errors with broad `any`, disabled lint rules, or skipped tests.
3. Use `decimal.js` for monetary comparisons instead of binary floating-point arithmetic.
4. Keep workbook processing and report generation in the browser. Do not add upload requests.
5. Render workbook content as text. Treat cell values, formulas, file names, and imported JSON configuration as untrusted input.
6. Add every user-facing string in Simplified Chinese and English.
7. Ensure status remains understandable without color and controls remain keyboard accessible.
8. Update documentation when behavior, configuration, rules, file support, or privacy boundaries change.

### Rule changes

Every rule must have a stable ID, default severity, explanation, remediation, applicability, and deterministic tests. Preserve these behavior requirements:

- `REQ-001` and `NUM-001` cannot be disabled in their applicable mode.
- Sections, subtotals/totals, blank rows, and repeated headers are not ordinary detail rows.
- Negative quantity is a warning because adjustment scenarios may be valid.
- A missing formula cache is informational and must not be reported as a definite amount error.
- Regional coding, pricing, and professional-compliance conclusions remain out of scope.

Update [docs/rules.md](docs/rules.md) and [CHANGELOG.md](CHANGELOG.md) with user-visible rule changes.

### Sample changes

All sample data must state that it is fictional and must not resemble a real project or price schedule. Generate samples with:

```bash
npm run samples
```

The generator must be deterministic. Re-run it twice and compare hashes when changing workbook generation. Confirm valid samples remain clean in their supported modes and the issue sample still covers every documented case.

### UI changes

Check at least desktop (`1440×900`), tablet, and narrow mobile widths. If the results or social-preview layout changes, regenerate `docs/preview.png` and `docs/social-preview.png` with `scripts/capture-docs.ts`; do not draw or fabricate placeholder images.

## Required checks

Run the relevant focused tests while developing, then run the full gate before submitting:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run build
npm run build:offline
npm run package
```

Report exactly which commands ran and their results. Do not claim checks that were not executed.

## Pull requests

Use a short imperative title and explain:

- the problem and user impact;
- the chosen approach and trade-offs;
- tests actually run;
- privacy, security, accessibility, and boundary impact; and
- screenshots for visible UI changes.

Keep commits understandable and do not rewrite unrelated user work. By contributing, you confirm that you have the right to provide the contribution under the project's [MIT License](LICENSE) and that it contains no confidential or restricted material.

## Community

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Technical disagreement is welcome; harassment, data exposure, and personal attacks are not.
