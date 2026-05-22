/**
 * VaultFlow Formatting Utilities
 * Handles dynamic number separators and date display formatting
 */

/**
 * Formats a currency amount (in cents) using the specified separator configuration.
 * 
 * @param cents Amount in lowest denomination
 * @param currencySymbol Currency symbol (e.g. '$', '€', 'CHF')
 * @param separator Thousands separator (',', '.', "'", ' ', or '')
 * @param showDecimals Whether to display decimal fraction
 */
export function formatAmount(
  cents: number,
  currencySymbol: string,
  separator: string,
  showDecimals: boolean = true
): string {
  const amount = cents / 100;
  // If separator is dot or space, decimal separator is comma. Otherwise, it is dot.
  const decimalSeparator = (separator === '.' || separator === ' ') ? ',' : '.';
  
  const parts = Math.abs(amount).toFixed(showDecimals ? 2 : 0).split('.');
  let integerPart = parts[0];
  const decimalPart = parts[1];

  if (separator) {
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  }

  const formattedValue = showDecimals && decimalPart
    ? `${integerPart}${decimalSeparator}${decimalPart}`
    : integerPart;

  const sign = amount < 0 ? '-' : '';
  return `${sign}${currencySymbol}${formattedValue}`;
}

/**
 * Formats a timestamp (in ms) using the specified Date Format string and target timezone.
 * Supporting formats:
 * - 'MMM DD, YYYY' -> May 19, 2026
 * - 'DD.MM.YYYY'   -> 19.05.2026
 * - 'DD/MM/YYYY'   -> 19/05/2026
 * - 'YYYY-MM-DD'   -> 2026-05-19
 * - 'MM/DD/YYYY'   -> 05/19/2026
 */
export function formatDate(timestamp: number, format: string, timezone?: string): string {
  if (!timestamp) return '';
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = getTimezoneDateParts(timestamp, tz);

  const day = String(parts.day).padStart(2, '0');
  const monthNumeric = String(parts.month).padStart(2, '0');
  const year = parts.year;
  
  const monthsAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthAbbr = monthsAbbr[parts.month - 1] || '';

  switch (format) {
    case 'MMM DD, YYYY':
      return `${monthAbbr} ${parts.day}, ${year}`;
    case 'DD.MM.YYYY':
      return `${day}.${monthNumeric}.${year}`;
    case 'DD/MM/YYYY':
      return `${day}/${monthNumeric}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${monthNumeric}-${day}`;
    case 'MM/DD/YYYY':
      return `${monthNumeric}/${day}/${year}`;
    default:
      return `${monthAbbr} ${parts.day}, ${year}`;
  }
}

/**
 * Extracts date parts (year, month, day, hour, minute, second) for a timestamp in a given timezone.
 */
export function getTimezoneDateParts(timestamp: number, timezone: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date(timestamp));
    const partMap: Record<string, string> = {};
    for (const p of parts) {
      partMap[p.type] = p.value;
    }
    const hour = parseInt(partMap.hour);
    return {
      year: parseInt(partMap.year),
      month: parseInt(partMap.month), // 1-indexed
      day: parseInt(partMap.day),
      hour: hour === 24 ? 0 : hour,
      minute: parseInt(partMap.minute),
      second: parseInt(partMap.second)
    };
  } catch (e) {
    const date = new Date(timestamp);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds()
    };
  }
}

/**
 * Returns a Unix timestamp (in ms) from localized date parts in a given timezone.
 */
export function getTimestampFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string
): number {
  const utcEstimate = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = utcEstimate;
  for (let i = 0; i < 3; i++) {
    const parts = getTimezoneDateParts(candidate, timezone);
    const partsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const diff = candidate - partsUtc;
    if (diff === 0) {
      return candidate;
    }
    candidate += diff;
  }
  return candidate;
}

/**
 * Formats time from a timestamp in a given timezone.
 */
export function formatTime(timestamp: number, timezone?: string, showSeconds: boolean = false): string {
  if (!timestamp) return '';
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = getTimezoneDateParts(timestamp, tz);
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');
  if (showSeconds) {
    const second = String(parts.second).padStart(2, '0');
    return `${hour}:${minute}:${second}`;
  }
  return `${hour}:${minute}`;
}
