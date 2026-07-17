import Decimal from 'decimal.js';

export interface NumberParseResult {
  readonly valid: boolean;
  readonly decimal?: Decimal;
  readonly normalized?: string;
}

const CHINESE_DIGITS: Readonly<Record<string, number>> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const SMALL_CHINESE_UNITS: Readonly<Record<string, number>> = {
  十: 10,
  百: 100,
  千: 1000,
};

const LARGE_CHINESE_UNITS: Readonly<Record<string, number>> = {
  万: 10_000,
  亿: 100_000_000,
};

function parseChineseInteger(source: string): string | undefined {
  if (source.length === 0) return '0';
  let total = new Decimal(0);
  let section = new Decimal(0);
  let digit: number | undefined;

  for (const character of source) {
    const nextDigit = CHINESE_DIGITS[character];
    if (nextDigit !== undefined) {
      digit = nextDigit;
      continue;
    }

    const smallUnit = SMALL_CHINESE_UNITS[character];
    if (smallUnit !== undefined) {
      section = section.plus(new Decimal(digit ?? 1).times(smallUnit));
      digit = undefined;
      continue;
    }

    const largeUnit = LARGE_CHINESE_UNITS[character];
    if (largeUnit !== undefined) {
      section = section.plus(digit ?? 0);
      total = total.plus(section.times(largeUnit));
      section = new Decimal(0);
      digit = undefined;
      continue;
    }
    return undefined;
  }

  return total
    .plus(section)
    .plus(digit ?? 0)
    .toString();
}

function parseChineseNumber(source: string): string | undefined {
  const match =
    /^([负正]?)([零〇一二两三四五六七八九十百千万亿]+)(?:点([零〇一二两三四五六七八九]+))?$/u.exec(
      source,
    );
  if (match === null) return undefined;
  const integer = parseChineseInteger(match[2] ?? '');
  if (integer === undefined) return undefined;
  const fractionSource = match[3] ?? '';
  const fraction = [...fractionSource]
    .map((character) => CHINESE_DIGITS[character])
    .map((value) => (value === undefined ? '' : String(value)))
    .join('');
  if (fraction.length !== fractionSource.length) return undefined;
  const sign = match[1] === '负' ? '-' : '';
  return `${sign}${integer}${fraction.length > 0 ? `.${fraction}` : ''}`;
}

/**
 * Strictly parses spreadsheet numbers. It accepts normal/full-width digits,
 * valid comma grouping, accounting negatives and plain Chinese numerals, while
 * rejecting prose, units, currency symbols and percentages.
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

  const chinese = parseChineseNumber(source);
  if (chinese !== undefined) source = chinese;

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
