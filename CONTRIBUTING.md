# Contributing to BOQ Lint

感谢你帮助改进 BOQ Lint / 清单校核。贡献应始终保护四项原则：工程文件本地处理、规则可解释、误报可控制、公开材料不包含真实工程数据。

## 提交 Issue 前

- 搜索现有 Issue，并阅读 [规则目录](docs/rule-catalog.md) 与 [领域假设](docs/domain-assumptions.md)。
- 使用 Bug 或 Feature Issue 表单，提供最小、完全虚构的复现。
- 禁止上传真实工程工作簿、客户或企业名称、非公开价格、投标或合同信息、个人数据、凭据、商业软件样本或受限制资料。
- 安全漏洞按 [SECURITY.md](SECURITY.md) 私密报告，不要创建公开 Issue。

## 可接受的贡献范围

- 增加不冲突的中文或英文字段别名；
- 改进行分类、合计行识别和单位规范化；
- 为 QG001–QG014 降低误报或补充边界测试；
- 改善键盘操作、ARIA、颜色对比度和移动端可读性；
- 改进本地报告互操作性与性能；
- 增加完全虚构、脚本可重复生成的示例。

涉及文件上传、后端、账号、遥测、广告、AI/LLM、市场价格判断、自动计价、ERP、标准符合性认证或受限制数据库的提案不属于核心项目范围。

## 开发环境

要求：

- Node.js 22
- pnpm 10.13.1
- Playwright Chromium（端到端测试）

```bash
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm generate:samples
pnpm dev
```

请使用 pnpm 更新依赖和锁文件。不要提交 `node_modules/`、`dist/`、覆盖率、Playwright 报告、日志、构建缓存或真实工作簿。

## 修改要求

1. 保持改动聚焦，并用确定性测试覆盖新增或修改行为。
2. 保持严格 TypeScript；不得用宽泛 `any`、关闭规则、删除断言或跳过测试掩盖问题。
3. 金额运算使用 `decimal.js`，不得直接依赖 JavaScript 浮点数。
4. 工程文件解析、检查和报告生成保持在浏览器本地，不增加上传请求。
5. 把工作簿文本、文件名、公式和导入配置视为不可信输入。
6. 用户可见状态不能只依赖颜色，交互应支持键盘并提供合理 ARIA。
7. 行为、规则、格式、隐私或边界变化必须同步更新 README、docs 和 CHANGELOG。

### 规则修改

每条规则必须包含稳定的 `id`、名称、说明、严重程度、类别、适用行类型、`check()`、修改建议和默认启用状态。

- 所有规则都可单独启用或关闭；
- 规则运行顺序固定为 QG001–QG014；
- 相同单元格、相同规则不得重复报错；
- 分部标题、合计行、备注行和空白行不套用项目必填规则；
- 每条问题可追溯到工作表、Excel 行号、字段和原值。

用户可见的规则变化必须同步 [docs/rule-catalog.md](docs/rule-catalog.md)。

### 示例修改

示例必须完全虚构、可重复生成，不得类似真实项目或价格表。

```bash
pnpm generate:samples
```

修改生成逻辑时，连续生成两次并比较哈希；确认干净示例没有 error，风险示例稳定触发预期规则。

### 界面和截图

至少检查 1440×900、1920×1080、1024 px 宽度和窄屏可读性。可见界面变化应从真实运行页面重新生成：

- `docs/assets/overview.png`
- `docs/assets/issues.png`

不得绘制概念图冒充产品截图，也不得提交空白或占位图片。

## 提交前检查

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm test:e2e
pnpm check
```

如实报告实际运行的命令和结果，不要声称未执行的检查通过。

## Pull Request

请说明：

- 解决的问题和用户影响；
- 实现方法与取舍；
- 实际运行的测试；
- 隐私、安全、可访问性和专业边界影响；
- 可见变化的真实页面截图。

参与行为受 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 约束。提交贡献即表示你有权按项目 [MIT License](LICENSE) 提供内容，且内容不含机密或受限制材料。
