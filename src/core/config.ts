import Decimal from 'decimal.js';

import { RULE_METADATA } from './rule-definitions';
import type { RuleConfig, RuleId, RuleSwitch, Severity } from './types';
import { BoqLintError, RULE_IDS } from './types';

export { RULE_METADATA } from './rule-definitions';

const DEFAULT_RULES = Object.freeze(
  Object.fromEntries(
    RULE_IDS.map((ruleId) => [
      ruleId,
      Object.freeze({ enabled: RULE_METADATA[ruleId].enabledByDefault }),
    ]),
  ) as Record<RuleId, RuleSwitch>,
);

export const DEFAULT_RULE_CONFIG: RuleConfig = Object.freeze({
  version: 1,
  calcTolerance: '0.01',
  relativeTolerance: '0.001',
  featureMinLength: 6,
  dispersionRatio: '0.5',
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

function validNonNegativeDecimal(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return false;
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() && decimal.greaterThanOrEqualTo(0);
  } catch {
    return false;
  }
}

export function validateRuleConfig(value: unknown): ConfigValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['配置必须是 JSON 对象。'] };
  if (value.version !== 1) errors.push('version 必须为 1。');
  if (!validNonNegativeDecimal(value.calcTolerance)) {
    errors.push('calcTolerance 必须是不小于 0 的十进制字符串。');
  }
  if (!validNonNegativeDecimal(value.relativeTolerance)) {
    errors.push('relativeTolerance 必须是不小于 0 的十进制字符串。');
  }
  if (
    typeof value.featureMinLength !== 'number' ||
    !Number.isInteger(value.featureMinLength) ||
    value.featureMinLength < 1 ||
    value.featureMinLength > 1000
  ) {
    errors.push('featureMinLength 必须是 1 到 1000 之间的整数。');
  }
  if (!validNonNegativeDecimal(value.dispersionRatio)) {
    errors.push('dispersionRatio 必须是不小于 0 的十进制字符串。');
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
    config: {
      version: 1,
      calcTolerance: value.calcTolerance as string,
      relativeTolerance: value.relativeTolerance as string,
      featureMinLength: value.featureMinLength as number,
      dispersionRatio: value.dispersionRatio as string,
      rules,
    },
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
  return RULE_METADATA[ruleId].severity;
}
