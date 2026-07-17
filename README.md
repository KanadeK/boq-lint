# BOQ Lint / 清单校核

[English](README.en.md)

BOQ Lint（清单校核）是一款面向中国工程造价人员的本地工程量清单 Excel 风险检查器。它在浏览器中识别工作表、表头和字段，运行可解释的辅助检查规则，并导出可交付的问题清单；工程文件不会上传到服务器。

> **English summary:** BOQ Lint is a local-first Excel quality checker for Bill of Quantities, Quantity Surveying, Construction Cost, Cost Estimation, and Tendering workflows. It runs entirely in the browser, requires no API key, and never uploads the selected workbook.

![BOQ Lint 应用总览](docs/assets/overview.png)

另见：[问题结果截图](docs/assets/issues.png) · [规则目录](docs/rule-catalog.md) · [领域假设](docs/domain-assumptions.md) · [隐私说明](docs/privacy.md)

## 实际解决的问题

工程量清单在进入计价软件、提交复核或交付招标文件前，常见以下数据质量风险：

- 不同来源的 Excel 使用不同工作表、起始行和表头名称；
- 项目编码、项目名称、项目特征、计量单位、工程量、综合单价或合价缺失；
- 工程量、单价和合价不是有效数值，或金额计算不一致；
- 重复编码、疑似重复列项和同类项目单价离散不易人工发现；
- 项目特征过短，或仅填写“详见图纸”“同上”等占位表达；
- 公式单元格没有可读取的缓存结果；
- 隐藏行、隐藏列或明细区合并单元格影响数据读取；
- 复核问题缺少统一、可追溯、可导出的交付格式。

BOQ Lint 只负责工程量清单 Excel 的数据质量与一致性辅助检查，不修改原工作簿，也不替代计价软件或专业复核。

## 三步使用

1. **导入文件**：拖放或选择一个不超过 20 MB 的 `.xlsx`，或加载项目内置的虚构问题示例。页面会列出文件名、大小和工作表。
2. **识别与映射**：确认要检查的工作表、自动识别的表头行和字段映射；必要时手动调整，并检查前 10 条数据预览。
3. **风险检查与导出**：运行规则，按严重程度、规则、工作表或关键词筛选，定位到原始 Excel 行，并导出 XLSX、CSV 或 JSON 报告。

## 在行业工作流中的位置

```text
计价软件或内部模板导出工程量清单 .xlsx
                      ↓
        BOQ Lint 本地识别、映射与辅助检查
                      ↓
          复核人员筛选、定位并导出问题清单
                      ↓
       编制人员回到原 Excel 或计价软件修正
                      ↓
             再次导入复检，直至风险收敛
```

## 本地隐私

- 文件字节、单元格、字段映射和检查结果只存在于当前页面内存中。
- 应用没有后端、数据库、账号、云存储、遥测、广告、AI 或大模型调用。
- 刷新、关闭页面或清空当前文件后，不恢复上传文件、文件名、映射或检查结果。
- 静态托管只提供应用资源和虚构示例；用户导入的工程文件不会形成上传请求。
- CSV 导出会防护以 `=`、`+`、`-`、`@` 开头的电子表格公式注入内容。

完整说明见 [docs/privacy.md](docs/privacy.md)。

## 支持范围

| 文件或场景                   | v0.1.0 支持情况            |
| ---------------------------- | -------------------------- |
| `.xlsx`                      | 支持，默认单文件上限 20 MB |
| `.xls`                       | 不支持，请先另存为 `.xlsx` |
| `.xlsm`                      | 不支持，不执行宏           |
| PDF                          | 不支持                     |
| 加密、损坏或无法解析的工作簿 | 拒绝并显示明确错误         |
| 多工作表                     | 支持选择一张或多张工作表   |
| 本地文件上传到服务器         | 不存在                     |

浏览器不是 Excel/WPS 的公式计算引擎。公式缺少缓存结果时，BOQ Lint 只提示重新计算并保存，不猜测公式值。

## 规则概览

所有规则均为“辅助检查规则”，可单独启用或关闭，并可恢复默认设置。

| 规则    | 严重程度 | 检查内容                                     |
| ------- | -------- | -------------------------------------------- |
| `QG001` | error    | 项目名称缺失                                 |
| `QG002` | error    | 计量单位缺失                                 |
| `QG003` | error    | 工程量不是有限数值或小于零                   |
| `QG004` | warning  | 工程量等于零                                 |
| `QG005` | warning  | 项目编码缺失                                 |
| `QG006` | info     | 编码去除空格后不是常见的 12 位数字格式       |
| `QG007` | warning  | 同一工作表内出现重复非空项目编码             |
| `QG008` | warning  | 名称、特征与单位指纹完全相同的疑似重复项     |
| `QG009` | warning  | 项目特征为空、过短或使用占位表达             |
| `QG010` | error    | 工程量 × 综合单价与合价超过允许误差          |
| `QG011` | warning  | 综合单价等于零或小于零                       |
| `QG012` | info     | 同类项目综合单价相对中位数离散过大           |
| `QG013` | warning  | 公式存在但没有可用缓存结果                   |
| `QG014` | info     | 隐藏行、隐藏列或明细区合并单元格造成结构风险 |

`QG010` 使用 `decimal.js` 计算，默认允许误差为 `max(0.01 元, |合价| × 0.1%)`。完整触发条件、降噪边界和修改建议见 [docs/rule-catalog.md](docs/rule-catalog.md)。

## 行识别

应用会区分清单项目行、分部或章节标题行、小计/合计/总计行、备注行和空白行。只有适用的清单项目行才运行项目必填规则；每一行都保留 `rowType` 和可解释的判定原因。

## 报告导出

- **XLSX**：生成独立问题工作簿，不修改原文件。
- **CSV**：UTF-8 编码，并对公式注入前缀进行防护。
- **JSON**：包含版本、文件基础信息、映射、规则参数、汇总和问题列表。

每条问题可追溯到工作表、Excel 行号、字段、原值、问题说明和修改建议。

## 项目边界

- 仅凭一份清单 Excel 无法判断图纸中是否存在真正漏项。
- 编码格式因地区、行业和企业模板而异，只能提示复核，不能武断认定违规。
- 负单价、零单价可能对应赠送、抵扣、调整或暂不计价等业务场景。
- 同名同单位项目的价格差异只表示需要复核，不代表价格错误。
- 本项目不内置标准正文、定额库、价格库或商业软件样本。
- 本项目不宣称“完全符合 GB/T 50500-2024”，也不替代注册造价工程师审核。

更完整的行业假设见 [docs/domain-assumptions.md](docs/domain-assumptions.md)。

> BOQ Lint 仅用于工程量清单 Excel 数据质量辅助检查，不构成造价审核结论，也不能替代图纸、合同、计量规则及专业人员复核。

## 本地开发

要求：

- Node.js 22
- pnpm 10.13.1
- Playwright Chromium（仅端到端测试需要）

```bash
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
pnpm generate:samples
pnpm dev
```

常用命令：

```bash
pnpm dev
pnpm build
pnpm preview
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm exec playwright install chromium
pnpm test:e2e
pnpm generate:samples
pnpm check
```

`pnpm check` 依次执行 lint、format check、typecheck、单元测试和生产构建。

## GitHub Pages 部署

Vite 使用 `base: './'` 生成相对资源路径，可部署到 GitHub Pages 仓库子目录。

`.github/workflows/deploy-pages.yml` 在 `main` 分支推送或手动触发时：

1. 使用 Node.js 22 和 pnpm 10.13.1 冻结安装依赖；
2. 执行 `pnpm build`；
3. 通过 `actions/configure-pages` 和 `actions/upload-pages-artifact` 上传 `dist/`；
4. 通过 `actions/deploy-pages` 部署，不向源码分支提交构建产物。

仓库 Settings → Pages 的 Source 应选择 **GitHub Actions**。工作流不需要自定义 Secret，也不依赖后端。

## 示例文件

项目脚本生成两个完全虚构、可重复生成的验收示例：

- `examples/boq-clean-sample.xlsx`
- `examples/boq-risk-sample.xlsx`

这些文件不包含真实工程、企业、客户、定额或商业软件数据。

## 贡献

欢迎提交表头别名、单位规范化、行分类、无障碍、英文界面、测试和虚构示例改进。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私密报告，禁止在公开 Issue 上传真实工程文件。

## 路线图

v0.1.0 只实现 Excel 本地检查。v0.2.0 至 v0.5.0 的规划、建议仓库 Topics 和适合 `good first issue` 的任务见 [docs/roadmap.md](docs/roadmap.md)。

## License

[MIT](LICENSE) © BOQ Lint contributors
