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
  readonly zh: RuleCopy;
  readonly en: RuleCopy;
}

const RULE_SEEDS: readonly RuleSeed[] = [
  {
    ruleId: 'QG001',
    severity: 'error',
    zh: {
      name: '项目名称缺失',
      description: '清单项目行没有项目名称。',
      suggestion: '补充项目名称，并确认表头和字段映射是否正确。',
    },
    en: {
      name: 'Missing item name',
      description: 'A BOQ item row has no item name.',
      suggestion: 'Add the item name and confirm the header and field mapping.',
    },
  },
  {
    ruleId: 'QG002',
    severity: 'error',
    zh: {
      name: '计量单位缺失',
      description: '清单项目行没有计量单位。',
      suggestion: '依据项目计量口径补充单位，并由专业人员复核。',
    },
    en: {
      name: 'Missing unit',
      description: 'A BOQ item row has no measurement unit.',
      suggestion: 'Add the unit based on the measurement basis and review it professionally.',
    },
  },
  {
    ruleId: 'QG003',
    severity: 'error',
    zh: {
      name: '工程量无效',
      description: '工程量不是有限数值或小于零；零工程量由 QG004 单独提示。',
      suggestion: '核对工程量原值、公式结果和业务含义，改为可识别的非负数值。',
    },
    en: {
      name: 'Invalid quantity',
      description: 'Quantity is not finite or is below zero. Zero quantity is handled by QG004.',
      suggestion:
        'Review the source value, formula result, and business meaning, then use a valid non-negative number.',
    },
  },
  {
    ruleId: 'QG004',
    severity: 'warning',
    zh: {
      name: '零工程量',
      description: '清单项目的工程量等于零。',
      suggestion: '确认该项目是否应保留，以及工程量是否尚未填写或确实为零。',
    },
    en: {
      name: 'Zero quantity',
      description: 'A BOQ item has a quantity of zero.',
      suggestion:
        'Confirm whether the item should remain and whether the quantity is pending or intentionally zero.',
    },
  },
  {
    ruleId: 'QG005',
    severity: 'warning',
    zh: {
      name: '项目编码缺失',
      description: '清单项目行没有项目编码；补充项目和企业模板可能采用不同做法。',
      suggestion: '结合地区、行业和企业模板人工确认是否需要补充编码。',
    },
    en: {
      name: 'Missing item code',
      description: 'A BOQ item has no code. Supplementary items and company templates may differ.',
      suggestion:
        'Confirm whether a code is required for the applicable regional, industry, or company template.',
    },
  },
  {
    ruleId: 'QG006',
    severity: 'info',
    zh: {
      name: '编码格式可疑',
      description: '编码去除空格后不是常见的 12 位数字格式；其他地区、行业或企业格式也可能有效。',
      suggestion: '按本项目适用的编码规则人工复核，不要仅凭此提示自动改值。',
    },
    en: {
      name: 'Unusual code format',
      description:
        'The code is not the common 12-digit format after spaces are removed. Other formats may still be valid.',
      suggestion:
        'Review it against the project-specific coding rules instead of changing it automatically.',
    },
  },
  {
    ruleId: 'QG007',
    severity: 'warning',
    zh: {
      name: '重复项目编码',
      description: '同一工作表内有多个清单项目使用相同的非空编码。',
      suggestion: '对照提示中的全部相关行，确认是重复编码还是允许的拆分列项。',
    },
    en: {
      name: 'Duplicate item code',
      description: 'Multiple BOQ items in one worksheet use the same non-empty code.',
      suggestion:
        'Review every related row and confirm whether it is a duplicate or an intentional split item.',
    },
  },
  {
    ruleId: 'QG008',
    severity: 'warning',
    zh: {
      name: '疑似重复清单项',
      description: '规范化项目名称、项目特征和单位组成的指纹完全相同。',
      suggestion: '人工复核相关行；此提示不会自动认定为重复列项。',
    },
    en: {
      name: 'Possible duplicate BOQ item',
      description: 'The normalized item name, feature, and unit fingerprint is identical.',
      suggestion:
        'Review the related rows manually. This notice does not automatically classify them as duplicates.',
    },
  },
  {
    ruleId: 'QG009',
    severity: 'warning',
    zh: {
      name: '项目特征描述不足',
      description: '项目特征为空、去除空白和标点后过短，或主要是“详见图纸、同上”等占位表达。',
      suggestion: '依据项目实际内容补充可供计量和复核的特征描述。',
    },
    en: {
      name: 'Insufficient item feature',
      description:
        'The feature is empty, too short after normalization, or mainly contains a placeholder such as “see drawings”.',
      suggestion: 'Add a feature description suitable for measurement and professional review.',
    },
  },
  {
    ruleId: 'QG010',
    severity: 'error',
    zh: {
      name: '合价计算不一致',
      description: '合价与工程量乘综合单价的 Decimal 精确计算结果超出允许误差。',
      suggestion: '复核工程量、综合单价、合价、公式和项目采用的舍入规则。',
    },
    en: {
      name: 'Total calculation mismatch',
      description:
        'The total differs from the Decimal calculation of quantity multiplied by unit price beyond the allowed tolerance.',
      suggestion: 'Review quantity, unit price, total, formulas, and the project rounding rules.',
    },
  },
  {
    ruleId: 'QG011',
    severity: 'warning',
    zh: {
      name: '单价异常',
      description: '综合单价小于或等于零；赠送项、抵扣项或暂不计价项可能具有业务含义。',
      suggestion: '结合合同和计价口径人工复核，不要仅因零价或负价自动修改。',
    },
    en: {
      name: 'Unusual unit price',
      description:
        'Unit price is zero or negative. Free, offset, or temporarily unpriced items may be intentional.',
      suggestion:
        'Review it against the contract and pricing basis instead of changing it automatically.',
    },
  },
  {
    ruleId: 'QG012',
    severity: 'info',
    zh: {
      name: '同类项目单价离散',
      description: '同一规范化名称和单位至少有 4 项，且某项单价偏离非零中位数超过设定比例。',
      suggestion: '核对项目特征、工作内容、价格来源和是否存在合理差异。',
    },
    en: {
      name: 'Price dispersion among similar items',
      description:
        'At least four items share a normalized name and unit, and one price differs from the non-zero median beyond the configured ratio.',
      suggestion:
        'Review item features, work scope, price sources, and whether the difference is justified.',
    },
  },
  {
    ruleId: 'QG013',
    severity: 'warning',
    zh: {
      name: '公式缺少缓存结果',
      description: 'Excel 单元格包含公式，但没有可供浏览器读取的缓存结果。',
      suggestion: '使用 Excel 或 WPS 重新计算并保存工作簿后再次检查。',
    },
    en: {
      name: 'Formula has no cached result',
      description:
        'An Excel cell contains a formula but no cached result is available to the browser.',
      suggestion: 'Recalculate and save the workbook in Excel or WPS, then check it again.',
    },
  },
  {
    ruleId: 'QG014',
    severity: 'info',
    zh: {
      name: '导入结构风险',
      description: '项目数据区域存在隐藏行、隐藏列或可能影响字段读取的合并单元格。',
      suggestion: '取消隐藏或合并后复核数据区域；普通表头合并不代表问题。',
    },
    en: {
      name: 'Import structure risk',
      description:
        'The item data region contains hidden rows, hidden columns, or merged cells that may affect field reading.',
      suggestion:
        'Review the data region after unhiding or unmerging it. Ordinary merged headers are not inherently an issue.',
    },
  },
];

export const DEFAULT_RULE_CONFIG: UiRuleConfig = {
  calcTolerance: '0.01',
  relativeTolerance: '0.001',
  dispersionRatio: '0.5',
  featureMinLength: 6,
  rules: RULE_SEEDS.map(({ ruleId, severity }) => ({
    ruleId,
    severity,
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
    enabled: byId.get(seed.ruleId)?.enabled ?? true,
    ...(locale === 'zh-CN' ? seed.zh : seed.en),
  }));
}
