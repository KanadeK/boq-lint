import type { Locale, RuleSetting, Severity, UiRuleConfig } from './types';

interface RuleCopy {
  readonly name: string;
  readonly description: string;
  readonly suggestion: string;
}

export interface RuleDefinition extends RuleSetting, RuleCopy {}

interface RuleSeed {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly core: boolean;
  readonly zh: RuleCopy;
  readonly en: RuleCopy;
}

const RULE_SEEDS: readonly RuleSeed[] = [
  {
    ruleId: 'REQ-001',
    severity: 'error',
    core: true,
    zh: {
      name: '必需字段缺失',
      description: '明细行缺少当前检查模式要求的字段。',
      suggestion: '补充缺失字段，或确认表头和字段映射是否正确。',
    },
    en: {
      name: 'Required field missing',
      description: 'A detail row is missing a field required by the selected mode.',
      suggestion: 'Add the missing value or confirm the header and field mapping.',
    },
  },
  {
    ruleId: 'NUM-001',
    severity: 'error',
    core: true,
    zh: {
      name: '数值无效',
      description: '工程量、综合单价或合价不是可识别的有效数值。',
      suggestion: '改为纯数值，并移除无法识别的文字或符号。',
    },
    en: {
      name: 'Invalid numeric value',
      description: 'Quantity, unit price, or total price is not a recognized number.',
      suggestion: 'Use a numeric value and remove unrecognized text or symbols.',
    },
  },
  {
    ruleId: 'QTY-001',
    severity: 'warning',
    core: false,
    zh: {
      name: '工程量非正数',
      description: '工程量等于零或小于零。负数在调整场景中可能有效。',
      suggestion: '复核工程量及其业务含义，不要仅因负数自动改值。',
    },
    en: {
      name: 'Non-positive quantity',
      description: 'Quantity is zero or negative. Negative values may be valid for adjustments.',
      suggestion: 'Review the quantity and its purpose before changing it.',
    },
  },
  {
    ruleId: 'DUP-001',
    severity: 'warning',
    core: false,
    zh: {
      name: '完全重复明细',
      description: '同一工作表中出现字段内容完全相同的明细行。',
      suggestion: '对照相关行，确认是否为误复制或确需保留。',
    },
    en: {
      name: 'Exact duplicate detail',
      description: 'A worksheet contains detail rows with identical mapped values.',
      suggestion: 'Compare the related rows and confirm whether the duplicate is intentional.',
    },
  },
  {
    ruleId: 'DUP-002',
    severity: 'warning',
    core: false,
    zh: {
      name: '同编码内容冲突',
      description: '同一项目编码对应不同名称、单位或项目特征。',
      suggestion: '核对编码及其对应的名称、单位和特征描述。',
    },
    en: {
      name: 'Conflicting values for one code',
      description: 'The same item code has different names, units, or item features.',
      suggestion: 'Verify the code and its related name, unit, and feature description.',
    },
  },
  {
    ruleId: 'UNIT-001',
    severity: 'warning',
    core: false,
    zh: {
      name: '计量单位冲突',
      description: '同一编码或标准化项目名称出现不同计量单位。',
      suggestion: '核对计量口径，确认单位差异是否合理。',
    },
    en: {
      name: 'Unit conflict',
      description: 'The same code or normalized item name uses different units.',
      suggestion: 'Review the measurement basis and confirm whether the unit difference is valid.',
    },
  },
  {
    ruleId: 'CALC-001',
    severity: 'error',
    core: false,
    zh: {
      name: '合价计算不一致',
      description: '合价与工程量乘综合单价的两位小数结果超出允许误差。',
      suggestion: '复核数量、单价、合价和公式，并确认舍入规则。',
    },
    en: {
      name: 'Total calculation mismatch',
      description: 'The total differs from quantity multiplied by unit price beyond the tolerance.',
      suggestion: 'Review quantity, unit price, total, formulas, and rounding rules.',
    },
  },
  {
    ruleId: 'FORMULA-001',
    severity: 'error',
    core: false,
    zh: {
      name: '公式结果错误',
      description: '公式缓存结果包含引用、数值、除零或名称等错误。',
      suggestion: '在表格软件中修复公式引用或参与计算的数据。',
    },
    en: {
      name: 'Formula result error',
      description: 'A cached formula result contains a reference, value, division, or name error.',
      suggestion: 'Repair the formula reference or source data in a spreadsheet app.',
    },
  },
  {
    ruleId: 'FORMULA-002',
    severity: 'info',
    core: false,
    zh: {
      name: '公式无缓存结果',
      description: '单元格包含公式，但浏览器无法读取其缓存结果。',
      suggestion: '用表格软件重新计算并保存工作簿后再检查。',
    },
    en: {
      name: 'Formula has no cached result',
      description: 'A cell contains a formula but its cached result cannot be read in the browser.',
      suggestion: 'Recalculate and save the workbook in a spreadsheet app, then check again.',
    },
  },
  {
    ruleId: 'TEXT-001',
    severity: 'warning',
    core: false,
    zh: {
      name: '项目特征为空',
      description: '明细行未填写项目特征。',
      suggestion: '按项目实际内容补充特征描述，或确认该项是否确实不适用。',
    },
    en: {
      name: 'Item feature is empty',
      description: 'A detail row does not include an item feature description.',
      suggestion: 'Add an appropriate feature description or confirm that it is not applicable.',
    },
  },
  {
    ruleId: 'CODE-001',
    severity: 'warning',
    core: false,
    zh: {
      name: '项目编码格式异常',
      description: '编码包含首尾空格、换行或明显的全角字符。',
      suggestion: '人工核对并规范编码格式，不会自动修改原值。',
    },
    en: {
      name: 'Unusual item code format',
      description: 'The code includes outer spaces, line breaks, or obvious full-width characters.',
      suggestion: 'Review and normalize the code manually. The original value is never changed.',
    },
  },
  {
    ruleId: 'STRUCT-001',
    severity: 'warning',
    core: false,
    zh: {
      name: '关键字段跨合并单元格',
      description: '明细数据的关键字段位于合并单元格中。',
      suggestion: '取消明细区域的关键字段合并，并为每行保留明确值。',
    },
    en: {
      name: 'Key field uses merged cells',
      description: 'A key field in a detail row crosses merged cells.',
      suggestion: 'Unmerge key fields in the detail area and keep an explicit value on each row.',
    },
  },
  {
    ruleId: 'STRUCT-002',
    severity: 'info',
    core: false,
    zh: {
      name: '隐藏明细行或关键列',
      description: '工作表包含隐藏的明细行或关键字段列。',
      suggestion: '取消隐藏后复核，确认隐藏内容是否应纳入交付。',
    },
    en: {
      name: 'Hidden detail row or key column',
      description: 'The worksheet contains a hidden detail row or key-field column.',
      suggestion: 'Unhide and review the content to confirm whether it belongs in the delivery.',
    },
  },
  {
    ruleId: 'STRUCT-003',
    severity: 'info',
    core: false,
    zh: {
      name: '明细区域重复表头',
      description: '明细区域发现重复表头，该行已从普通明细检查中排除。',
      suggestion: '确认分页或拼接产生的重复表头是否需要清理。',
    },
    en: {
      name: 'Repeated header in detail area',
      description: 'A repeated header was found and excluded from normal detail checks.',
      suggestion: 'Review repeated headers created by pagination or worksheet concatenation.',
    },
  },
];

export const DEFAULT_RULE_CONFIG: UiRuleConfig = {
  calcTolerance: '0.01',
  rules: RULE_SEEDS.map(({ ruleId, severity, core }) => ({
    ruleId,
    severity,
    core,
    enabled: true,
  })),
};

export function getRuleDefinitions(
  locale: Locale,
  config: UiRuleConfig,
): readonly RuleDefinition[] {
  const byId = new Map(config.rules.map((rule) => [rule.ruleId, rule]));
  return RULE_SEEDS.map((seed) => ({
    ruleId: seed.ruleId,
    severity: seed.severity,
    core: seed.core,
    enabled: byId.get(seed.ruleId)?.enabled ?? true,
    ...(locale === 'zh-CN' ? seed.zh : seed.en),
  }));
}

export function parseRuleConfig(value: unknown): UiRuleConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.calcTolerance !== 'string') return null;
  const tolerance = Number(candidate.calcTolerance);
  if (!Number.isFinite(tolerance) || tolerance < 0) return null;
  if (!Array.isArray(candidate.rules)) return null;

  const incoming = new Map<string, boolean>();
  for (const valueRule of candidate.rules) {
    if (typeof valueRule !== 'object' || valueRule === null) return null;
    const record = valueRule as Record<string, unknown>;
    if (typeof record.ruleId !== 'string' || typeof record.enabled !== 'boolean') return null;
    incoming.set(record.ruleId, record.enabled);
  }

  const rules = DEFAULT_RULE_CONFIG.rules.map((rule) => ({
    ...rule,
    enabled: rule.core ? true : (incoming.get(rule.ruleId) ?? rule.enabled),
  }));
  return { calcTolerance: candidate.calcTolerance, rules };
}

export function serializeRuleConfig(config: UiRuleConfig): string {
  return JSON.stringify(
    {
      version: 1,
      calcTolerance: config.calcTolerance,
      rules: config.rules.map(({ ruleId, enabled }) => ({ ruleId, enabled })),
    },
    null,
    2,
  );
}
