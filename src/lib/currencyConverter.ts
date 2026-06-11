/**
 * ═══════════════════════════════════════════════════════════════
 * SplitX — Currency Converter
 *
 * Handles multi-currency conversion for the CSV import.
 * Uses static exchange rates (documented in DECISIONS.md).
 *
 * Design decision: Static rates instead of live API because:
 * 1. The trip was in March 2025 — historical rates are fixed
 * 2. No external API dependency = more reliable import
 * 3. Rates are configurable and documented
 * ═══════════════════════════════════════════════════════════════
 */

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  source: string;
  asOf: string;
}

/**
 * Static exchange rates (to INR).
 * These represent approximate rates for March 2025.
 */
export const EXCHANGE_RATES: Record<string, ExchangeRate> = {
  USD: {
    from: 'USD',
    to: 'INR',
    rate: 83.5,
    source: 'Static (approximate March 2025 rate)',
    asOf: '2025-03-01',
  },
  EUR: {
    from: 'EUR',
    to: 'INR',
    rate: 90.0,
    source: 'Static (approximate March 2025 rate)',
    asOf: '2025-03-01',
  },
  GBP: {
    from: 'GBP',
    to: 'INR',
    rate: 105.0,
    source: 'Static (approximate March 2025 rate)',
    asOf: '2025-03-01',
  },
};

/**
 * Convert an amount from a foreign currency to INR (paise).
 *
 * @param amountPaise - Amount in the source currency's smallest unit (e.g., cents for USD)
 * @param currency - Source currency code (e.g., 'USD')
 * @returns Converted amount in INR paise, or original if currency is INR
 */
export function convertToINRPaise(amountPaise: number, currency: string): {
  convertedPaise: number;
  exchangeRate: number | null;
  originalPaise: number;
} {
  if (currency === 'INR') {
    return { convertedPaise: amountPaise, exchangeRate: null, originalPaise: amountPaise };
  }

  const rateInfo = EXCHANGE_RATES[currency];
  if (!rateInfo) {
    // Unknown currency — treat as INR with warning
    return { convertedPaise: amountPaise, exchangeRate: null, originalPaise: amountPaise };
  }

  return {
    convertedPaise: Math.round(amountPaise * rateInfo.rate),
    exchangeRate: rateInfo.rate,
    originalPaise: amountPaise,
  };
}

/**
 * Format a currency amount for display.
 * Shows both original and converted amounts for foreign currencies.
 */
export function formatCurrencyDisplay(
  amountPaise: number,
  currency: string,
  originalPaise?: number
): string {
  if (currency === 'INR' || !originalPaise) {
    return `₹${(amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }

  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
  const symbol = symbols[currency] || currency;

  return `₹${(amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (was ${symbol}${(originalPaise / 100).toFixed(2)})`;
}

/**
 * Get all supported currencies with their rates
 */
export function getSupportedCurrencies(): { code: string; symbol: string; rate: number }[] {
  return [
    { code: 'INR', symbol: '₹', rate: 1 },
    ...Object.values(EXCHANGE_RATES).map((r) => ({
      code: r.from,
      symbol: r.from === 'USD' ? '$' : r.from === 'EUR' ? '€' : r.from === 'GBP' ? '£' : r.from,
      rate: r.rate,
    })),
  ];
}
