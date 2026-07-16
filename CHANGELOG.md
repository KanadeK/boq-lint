# Changelog

All notable changes to BOQLint are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-07-15

### Added

- Local-only `.xlsx` import with explicit errors for legacy `.xls`, encrypted, corrupt, empty, or otherwise unreadable workbooks.
- Unpriced and priced BOQ modes with mode-specific required fields.
- Header detection within the first 30 rows, Chinese and English aliases, worksheet selection, manual header selection, field mapping, and row preview.
- Detail, section, subtotal/total, blank, and repeated-header row classification.
- Stable `REQ-001`, `NUM-001`, `QTY-001`, `DUP-001`, `DUP-002`, `UNIT-001`, `CALC-001`, `FORMULA-001`, `FORMULA-002`, `TEXT-001`, `CODE-001`, `STRUCT-001`, `STRUCT-002`, and `STRUCT-003` rules.
- Decimal amount checking with configurable `CALC-001` tolerance.
- Severity, rule, worksheet, and text filters; source-row context; pagination; result summaries; and rerun/reset flows.
- Local CSV, JSON, and standalone XLSX report generation without modifying the source workbook.
- Import/export of validated rule configuration and settings persistence that excludes workbook data, file names, and results.
- Simplified Chinese and English UI, light and dark themes, keyboard-friendly controls, and non-color-only status labels.
- GitHub Pages build plus a self-contained, network-free offline HTML release with SHA-256 checksum.
- Three byte-reproducible, entirely fictional ExcelJS sample workbooks covering clean Chinese/English cases and the full issue set.
- Vitest, Testing Library, and Playwright coverage for the primary import, mapping, checking, export, privacy, language, theme, and offline flows.
- GitHub Actions CI, Pages deployment, monthly Dependabot updates, issue forms, and a pull request template.

### Security

- Workbook content remains in browser memory and is never uploaded by the application.
- The application has no backend, accounts, database, telemetry, advertising, AI, or external recognition API.
- Workbook content is rendered as text and exported with spreadsheet-injection safeguards where applicable.

### Boundaries

- BOQLint is a general data-quality aid, not costing software, a compliance certification tool, or professional construction-cost advice.
- The release does not generate prices or codes, judge market-price reasonableness, apply regional coding libraries, or modify source workbooks.

[Unreleased]: https://github.com/KanadeK/boq-lint/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/KanadeK/boq-lint/releases/tag/v0.1.0
