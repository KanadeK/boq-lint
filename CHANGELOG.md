# Changelog

BOQ Lint 的重要变更记录在此。格式参考 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本遵循 [Semantic Versioning](https://semver.org/)。

## [Unreleased]

## [0.1.0] - 2026-07-16

### Added

- 浏览器本地 `.xlsx` 导入，包含 20 MB 上限和不支持格式、损坏文件的明确错误。
- 每张工作表前 50 行表头识别、字段别名评分、多工作表选择、手动表头和字段映射。
- 清单项目、章节标题、合计、备注和空白行分类，以及可解释的判定原因。
- QG001–QG014 固定顺序辅助检查规则、单独开关和默认恢复。
- 使用 `decimal.js` 的绝对与相对金额误差检查。
- 严重程度、规则、工作表和文本筛选，以及原始 Excel 行定位。
- XLSX、CSV 和 JSON 本地报告导出，包含 CSV 公式注入防护。
- 完全虚构、脚本可重复生成的干净与风险示例。
- Vitest、Testing Library 与 Playwright 自动化测试。
- Node.js 22、pnpm 10.13.1、GitHub Actions CI 和官方 artifact GitHub Pages 部署。
- 中文主文档、英文摘要、领域假设、规则目录、隐私说明和持续路线图。

### Boundaries

- BOQ Lint 是工程量清单 Excel 数据质量辅助工具，不判断真正漏项或价格正确性。
- 不宣称完整符合 GB/T 50500-2024，不替代专业造价审核。
- 不使用后端、上传、数据库、账号、遥测、广告、AI 或大模型。
- 不内置受限制的标准正文、定额库、价格库或真实商业软件样本。

[Unreleased]: https://github.com/KanadeK/boq-lint/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/KanadeK/boq-lint/releases/tag/v0.1.0
