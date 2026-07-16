import Decimal from 'decimal.js';

import type { RuleConfig, RuleId, RuleMetadata, RuleSwitch, Severity } from './types';
import { BoqLintError, RULE_IDS } from './types';

export const RULE_METADATA: Readonly<Record<RuleId, RuleMetadata>> = {
  'REQ-001': {
    ruleId: 'REQ-001',
    name: '必需字段缺失',
    description: '检查当前模式要求的字段是否为空。',
    defaultSeverity: 'error',
    remediation: '补充缺失字段，并确认字段映射正确。',
    core: true,
  },
  'NUM-001': {
    ruleId: 'NUM-001',
    name: '无效数值',
    description: '检查工程量、综合单价和合价是否为严格有效的数值。',
    defaultSeverity: 'error',
    remediation: '改为不含文字或单位的有效数值。',
    core: true,
  },
  'QTY-001': {
    ruleId: 'QTY-001',
    name: '非正工程量',
    description: '工程量等于零或小于零。',
    defaultSeverity: 'warning',
    remediation: '核实工程量；若为调整项，请保留业务依据。',
    core: false,
  },
  'DUP-001': {
    ruleId: 'DUP-001',
    name: '完全重复明细',
    description: '同一工作表存在字段内容完全相同的明细行。',
    defaultSeverity: 'warning',
    remediation: '确认是否重复录入；必要时删除重复项。',
    core: false,
  },
  'DUP-002': {
    ruleId: 'DUP-002',
    name: '同编码内容冲突',
    description: '同一项目编码对应不同名称、单位或项目特征。',
    defaultSeverity: 'warning',
    remediation: '核对项目编码及其名称、单位和特征是否一致。',
    core: false,
  },
  'UNIT-001': {
    ruleId: 'UNIT-001',
    name: '计量单位冲突',
    description: '同一项目编码或标准化项目名称使用了不同计量单位。',
    defaultSeverity: 'warning',
    remediation: '核实并统一计量单位，或拆分确有差异的项目。',
    core: false,
  },
  'CALC-001': {
    ruleId: 'CALC-001',
    name: '合价计算不一致',
    description: '已计价模式下，表内合价与工程量乘综合单价的两位小数结果不一致。',
    defaultSeverity: 'error',
    remediation: '核对工程量、综合单价、舍入方式和表内合价。',
    core: false,
  },
  'FORMULA-001': {
    ruleId: 'FORMULA-001',
    name: '公式结果错误',
    description: '公式缓存结果为 Excel 错误值。',
    defaultSeverity: 'error',
    remediation: '在 Excel 中修复公式引用或计算错误后重新保存。',
    core: false,
  },
  'FORMULA-002': {
    ruleId: 'FORMULA-002',
    name: '公式无缓存结果',
    description: '公式存在但没有浏览器可读取的缓存结果。',
    defaultSeverity: 'info',
    remediation: '使用 Excel 重新计算并保存工作簿后再次检查。',
    core: false,
  },
  'TEXT-001': {
    ruleId: 'TEXT-001',
    name: '项目特征为空',
    description: '明细行没有填写项目特征。',
    defaultSeverity: 'warning',
    remediation: '结合设计和清单要求补充项目特征。',
    core: false,
  },
  'CODE-001': {
    ruleId: 'CODE-001',
    name: '项目编码格式可疑',
    description: '项目编码含首尾空格、换行或明显全角字符。',
    defaultSeverity: 'warning',
    remediation: '人工核对并规范编码格式；BOQLint 不会自动修改原文件。',
    core: false,
  },
  'STRUCT-001': {
    ruleId: 'STRUCT-001',
    name: '关键字段跨合并单元格',
    description: '明细数据的关键字段位于合并单元格中。',
    defaultSeverity: 'warning',
    remediation: '取消明细区域关键字段的合并并逐行填写。',
    core: false,
  },
  'STRUCT-002': {
    ruleId: 'STRUCT-002',
    name: '隐藏明细或关键列',
    description: '工作表存在隐藏明细行或隐藏的关键字段列。',
    defaultSeverity: 'info',
    remediation: '取消隐藏并确认隐藏数据是否应纳入交付。',
    core: false,
  },
  'STRUCT-003': {
    ruleId: 'STRUCT-003',
    name: '明细区域重复表头',
    description: '明细区域中再次出现表头，该行已从明细规则中排除。',
    defaultSeverity: 'info',
    remediation: '确认分页表头位置；无需将其作为清单明细处理。',
    core: false,
  },
};

const DEFAULT_RULES = Object.freeze(
  Object.fromEntries(
    RULE_IDS.map((ruleId) => [ruleId, Object.freeze({ enabled: true })]),
  ) as Record<RuleId, RuleSwitch>,
);

export const DEFAULT_RULE_CONFIG: RuleConfig = Object.freeze({
  version: 1,
  calcTolerance: '0.01',
  rules: DEFAULT_RULES,
});

export interface ConfigValidationSuccess {
  readonly valid: true;
  readonly config: RuleConfig;
}

export interface ConfigValidationFailure {
  readonly valid: false;
  readonly errors: readonly string[];
}

export type ConfigValidationResult = ConfigValidationSuccess | ConfigValidationFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validTolerance(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return false;
  try {
    const tolerance = new Decimal(value);
    return tolerance.isFinite() && tolerance.greaterThanOrEqualTo(0);
  } catch {
    return false;
  }
}

export function validateRuleConfig(value: unknown): ConfigValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['配置必须是 JSON 对象。'] };
  if (value.version !== 1) errors.push('version 必须为 1。');
  if (!validTolerance(value.calcTolerance)) {
    errors.push('calcTolerance 必须是不小于 0 的十进制字符串。');
  }
  if (!isRecord(value.rules)) {
    errors.push('rules 必须是规则设置对象。');
  } else {
    const unknownRules = Object.keys(value.rules).filter(
      (ruleId) => !RULE_IDS.includes(ruleId as RuleId),
    );
    if (unknownRules.length > 0) errors.push(`包含未知规则：${unknownRules.join('、')}。`);
    for (const ruleId of RULE_IDS) {
      const setting = value.rules[ruleId];
      if (!isRecord(setting) || typeof setting.enabled !== 'boolean') {
        errors.push(`${ruleId}.enabled 必须是布尔值。`);
      } else if (RULE_METADATA[ruleId].core && !setting.enabled) {
        errors.push(`${ruleId} 是核心规则，不能关闭。`);
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  const rules = Object.fromEntries(
    RULE_IDS.map((ruleId) => [
      ruleId,
      { enabled: (value.rules as Record<string, RuleSwitch>)[ruleId]!.enabled },
    ]),
  ) as Record<RuleId, RuleSwitch>;
  return {
    valid: true,
    config: { version: 1, calcTolerance: value.calcTolerance as string, rules },
  };
}

export function importRuleConfig(json: string): RuleConfig {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new BoqLintError('INVALID_CONFIG', 'JSON 格式不正确。');
  }
  const result = validateRuleConfig(value);
  if (!result.valid) throw new BoqLintError('INVALID_CONFIG', result.errors.join(' '));
  return result.config;
}

export function exportRuleConfig(config: RuleConfig = DEFAULT_RULE_CONFIG): string {
  const validation = validateRuleConfig(config);
  if (!validation.valid) throw new BoqLintError('INVALID_CONFIG', validation.errors.join(' '));
  return JSON.stringify(validation.config, null, 2);
}

export const RULE_CONFIG_STORAGE_KEY = 'boq-lint:rule-config:v1';

export function saveRuleConfig(config: RuleConfig, storage: Storage = localStorage): void {
  storage.setItem(RULE_CONFIG_STORAGE_KEY, exportRuleConfig(config));
}

export function loadRuleConfig(storage: Storage = localStorage): RuleConfig {
  const saved = storage.getItem(RULE_CONFIG_STORAGE_KEY);
  if (saved === null) return DEFAULT_RULE_CONFIG;
  try {
    return importRuleConfig(saved);
  } catch {
    storage.removeItem(RULE_CONFIG_STORAGE_KEY);
    return DEFAULT_RULE_CONFIG;
  }
}

export function severityFor(ruleId: RuleId): Severity {
  return RULE_METADATA[ruleId].defaultSeverity;
}
