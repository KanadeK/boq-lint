# Security Policy

BOQLint processes untrusted `.xlsx` files in the browser. Local-only processing removes a server upload path, but malformed workbooks, unsafe rendering, spreadsheet injection, dependency compromise, and resource exhaustion still require careful handling.

## Supported versions

| Version                                               | Security fixes |
| ----------------------------------------------------- | -------------- |
| Latest `0.1.x`                                        | Supported      |
| Development snapshots and versions older than `0.1.0` | Not supported  |

Only the latest patch release receives security fixes during the `0.x` phase.

## Report a vulnerability privately

Do not open a public issue for an unpatched vulnerability. Do not attach a real project workbook, client data, credentials, or exploit details to an issue, discussion, or pull request.

1. Prefer GitHub's **Security → Report a vulnerability** form when private vulnerability reporting is enabled for the repository.
2. If that form is unavailable, contact the maintainer through a private method published on the repository owner's GitHub profile.
3. Use an entirely fictional, minimal `.xlsx` reproduction whenever possible. If sensitive evidence is unavoidable, ask the maintainer to agree on a transfer method before sending it.

A useful report includes:

- affected version or commit;
- browser, operating system, and reproduction environment;
- expected and actual behavior;
- security impact and likely attack preconditions;
- minimal reproduction steps or a fictional generated workbook;
- sanitized console/network evidence; and
- any known mitigation.

Maintainers will acknowledge reports when possible, validate impact, coordinate a fix and disclosure plan, and credit reporters who want attribution. Please allow time for investigation before public disclosure.

## High-priority findings

Please report issues such as:

- workbook content, file names, mappings, or results sent to a network endpoint without explicit user action;
- script or HTML injection through cell values, sheet names, file names, configuration, or report content;
- CSV/XLSX formula injection that executes when a report is opened;
- crafted `.xlsx` input causing uncontrolled memory/CPU use, browser crashes, or parser bypass;
- unexpected execution of workbook macros, formulas, external links, or embedded content;
- persistence of workbook data or results in `localStorage`, IndexedDB, cookies, logs, or telemetry;
- path traversal or unsafe file handling in development/release scripts;
- offline HTML making network requests during import, checking, or export;
- dependency or build-chain compromise with a practical impact on distributed artifacts; or
- GitHub Actions permissions or artifact provenance that enable unauthorized Pages/release changes.

Normal parsing errors, rule false positives, copy issues, and feature requests can use the public issue forms, provided they contain only fictional data.

## Security design

- The application supports `.xlsx` only in v0.1.0 and rejects legacy, encrypted, corrupt, or unsupported files with explicit messages.
- Workbook bytes and parsed content stay in browser memory; there is no backend, upload API, account, database, cloud storage, telemetry, advertising, or AI integration.
- Workbook content is rendered as text and is never inserted as trusted HTML.
- The browser does not execute workbook formulas or macros. Cached results are read as data; missing caches and formula errors are reported.
- CSV and spreadsheet exports must neutralize values that a spreadsheet program could interpret as injected formulas.
- Reports are generated locally only after a user action and never overwrite the source workbook.
- `localStorage` is limited to language, theme, and validated rule configuration; it must not contain workbook content, file names, or results.
- The offline release is self-contained, has a SHA-256 checksum, and must not depend on CDN or runtime network access.

More detail is available in [docs/privacy.md](docs/privacy.md) and [docs/architecture.md](docs/architecture.md).

## Safe testing

Keep tests and proof-of-concept files small, deterministic, and fictional. Do not test denial-of-service cases against the public GitHub Pages deployment or another person's system. Run potentially resource-intensive experiments only in an isolated local environment you control.
