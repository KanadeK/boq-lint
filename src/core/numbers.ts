import Decimal from 'decimal.js';

export interface NumberParseResult {
  readonly valid: boolean;
  readonly decimal?: Decimal;
  readonly normalized?: string;
}

/**
 * Strictly parses spreadsheet numbers. Group separators must be valid thousands
 * separators and arbitrary prose, units, currency symbols and percentages are rejected.
 */
export function parseLocaleNumber(value: unknown): NumberParseResult {
  if (value instanceof Decimal) {
    return value.isFinite()
      ? { valid: true, decimal: new Decimal(value), normalized: value.toString() }
      : { valid: false };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { valid: false };
    const decimal = new Decimal(value);
    return { valid: true, decimal, normalized: decimal.toString() };
  }
  if (typeof value === 'bigint') {
    const decimal = new Decimal(value.toString());
    return { valid: true, decimal, normalized: decimal.toString() };
  }
  if (typeof value !== 'string') return { valid: false };

  let source = value.normalize('NFKC').trim().replace(/[−–—]/gu, '-');
  if (source.length === 0) return { valid: false };

  let negative = false;
  const accountingMatch = source.match(/^\((.*)\)$/u);
  if (accountingMatch !== null) {
    negative = true;
    source = accountingMatch[1]?.trim() ?? '';
  }

  const grouped = /^[+-]?(?:\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/u;
  const plain = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/u;
  if (grouped.test(source)) source = source.replace(/,/gu, '');
  else if (!plain.test(source)) return { valid: false };

  if (negative) {
    if (source.startsWith('-')) return { valid: false };
    source = `-${source.replace(/^\+/u, '')}`;
  }

  try {
    const decimal = new Decimal(source);
    return decimal.isFinite()
      ? { valid: true, decimal, normalized: decimal.toString() }
      : { valid: false };
  } catch {
    return { valid: false };
  }
}

export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function calculateTotal(quantity: unknown, unitPrice: unknown): Decimal | null {
  const parsedQuantity = parseLocaleNumber(quantity);
  const parsedUnitPrice = parseLocaleNumber(unitPrice);
  if (!parsedQuantity.valid || !parsedUnitPrice.valid) return null;
  return roundMoney(parsedQuantity.decimal!.times(parsedUnitPrice.decimal!));
}
