import { Transaction, CSVMappingProfile } from '../types';

/**
 * VaultFlow Local-First CSV Bank Statement Parsing Engine
 * Extensible Adapter Architecture
 */

export interface CSVAdapter {
  name: string;
  detect: (lines: string[]) => boolean;
  parse: (lines: string[]) => Partial<Transaction>[];
}

/**
 * Splits a CSV line into fields, respecting quotation marks and custom delimiters.
 */
function splitCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  result.push(currentField.trim());
  return result;
}

/**
 * Cleans raw merchant or counterparty names, removing common payment codes, card IDs,
 * processing dates, and excess whitespace to make them readable.
 */
export function cleanMerchantName(rawName: string): string {
  if (!rawName) return 'Unknown Merchant';
  
  let cleaned = rawName
    .replace(/"/g, '') // remove quotes
    .replace(/\s+/g, ' '); // collapse spaces

  cleaned = cleaned
    .replace(/^(CARD PURCHASE( AT)?|POS PURCHASE( AT)?|PURCHASE AT|DIRECT DEBIT|PAYMENT TO|TRSF FROM|TRANSFER TO)\s+/i, '')
    .replace(/\b(SEPA|DIRECT DEBIT|DEBIT CARD|CREDIT CARD|MC|VISA)\b/gi, '')
    .replace(/\b\d{4,}\b/g, '') // remove long number codes/IDs (e.g. terminal numbers)
    .replace(/\*+/g, '') // remove paypal stars
    .trim();

  return cleaned || rawName;
}

/**
 * Parses dynamic numeric values and returns the value in lowest currency denomination (e.g. cents).
 */
export function parseCSVAmount(rawAmount: string): { amount: number; type: 'expense' | 'income' } {
  let cleaned = rawAmount.replace(/[^\d\-+.,]/g, '').trim();
  if (!cleaned) return { amount: 0, type: 'expense' };

  let isNegative = cleaned.startsWith('-');
  if (isNegative || cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    const commaIndex = cleaned.indexOf(',');
    const dotIndex = cleaned.indexOf('.');
    if (commaIndex > dotIndex) {
      cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    cleaned = cleaned.replace(/,/g, '.');
  }

  const numericValue = parseFloat(cleaned);
  if (isNaN(numericValue)) return { amount: 0, type: 'expense' };

  return {
    amount: Math.round(numericValue * 100),
    type: isNegative ? 'expense' : 'income',
  };
}

/**
 * Standardizes multiple date forms into Unix millisecond timestamps.
 */
export function parseCSVDate(rawDate: string): number {
  if (!rawDate) return Date.now();

  const parts = rawDate.split(/[.\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (!isNaN(date.getTime())) return date.getTime();
    } else if (parts[2].length === 4) {
      const date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (!isNaN(date.getTime())) return date.getTime();
    }
  }

  const parsed = Date.parse(rawDate);
  if (!isNaN(parsed)) return parsed;

  return Date.now();
}

/**
 * Map external bank categories to internal VaultFlow categories
 */
function mapBankCategoryToInternal(bankCategory: string): string {
  const cat = bankCategory.toLowerCase();
  if (cat.includes('food') || cat.includes('restaurant') || cat.includes('dining')) return 'food';
  if (cat.includes('supermarket') || cat.includes('grocery')) return 'food'; // Or 'shopping' depending on preference
  if (cat.includes('transport') || cat.includes('mobility') || cat.includes('gas') || cat.includes('fuel')) return 'transport';
  if (cat.includes('utilit') || cat.includes('communication') || cat.includes('phone') || cat.includes('energy')) return 'utilities';
  if (cat.includes('shop') || cat.includes('fashion')) return 'shopping';
  if (cat.includes('leisure') || cat.includes('fun') || cat.includes('entertainment')) return 'fun';
  if (cat.includes('home') || cat.includes('residing') || cat.includes('rent')) return 'home';
  if (cat.includes('health') || cat.includes('medical') || cat.includes('pharmacy')) return 'health';
  return 'other';
}

// ==========================================
// ADAPTERS
// ==========================================

const PostFinanceAdapter: CSVAdapter = {
  name: 'PostFinance / Swiss Format',
  detect: (lines) => {
    // Detects PostFinance specific headers or preamble
    return lines.some(l => l.includes('Date from:;=') || l.includes('Credit in CHF;Debit in CHF'));
  },
  parse: (lines) => {
    const transactions: Partial<Transaction>[] = [];
    
    // Find header row index
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Type of transaction') && lines[i].includes('Notification text')) {
        headerIndex = i;
        break;
      }
    }
    
    if (headerIndex === -1) return [];

    const headers = splitCSVLine(lines[headerIndex], ';').map(h => h.toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const descIdx = headers.findIndex(h => h.includes('notification text'));
    const creditIdx = headers.findIndex(h => h.includes('credit'));
    const debitIdx = headers.findIndex(h => h.includes('debit'));
    const catIdx = headers.findIndex(h => h.includes('category'));

    for (let i = headerIndex + 1; i < lines.length; i++) {
      let line = lines[i];
      if (!line) continue;

      // Clean up PostFinance's strange full-line quoting (e.g. `"31.01.2026;Entry;..."` or `"...",`)
      if (line.startsWith('"')) {
        if (line.endsWith('",')) {
          line = line.slice(1, -2).replace(/""/g, '"');
        } else if (line.endsWith('"')) {
          line = line.slice(1, -1).replace(/""/g, '"');
        }
      }

      const fields = splitCSVLine(line, ';');
      if (fields.length < Math.max(dateIdx, descIdx, creditIdx, debitIdx)) continue;

      const dateStr = fields[dateIdx];
      const descStr = fields[descIdx];
      const creditStr = fields[creditIdx];
      const debitStr = fields[debitIdx];
      const catStr = catIdx !== -1 ? fields[catIdx] : '';

      if (!dateStr || (!creditStr && !debitStr)) continue; // Skip empty rows

      const booking_date = parseCSVDate(dateStr);
      const counterparty = cleanMerchantName(descStr);
      let category_id = catStr ? mapBankCategoryToInternal(catStr) : 'other';

      let amount = 0;
      let type: 'income' | 'expense' = 'expense';

      if (creditStr && creditStr.trim() !== '') {
        const parsed = parseCSVAmount(creditStr);
        amount = parsed.amount;
        type = 'income';
      } else if (debitStr && debitStr.trim() !== '') {
        const parsed = parseCSVAmount(debitStr);
        amount = parsed.amount;
        type = 'expense';
      }

      transactions.push({
        booking_date,
        amount,
        type,
        counterparty,
        category_id,
        raw_data: lines[i],
      });
    }

    return transactions;
  }
};

const GenericAdapter: CSVAdapter = {
  name: 'Generic Standard Format',
  detect: () => true, // Fallback adapter
  parse: (lines) => {
    if (lines.length === 0) return [];

    const headerFields = splitCSVLine(lines[0].toLowerCase(), ',');
    let dateIndex = -1;
    let amountIndex = -1;
    let descIndex = -1;

    for (let i = 0; i < headerFields.length; i++) {
      const field = headerFields[i];
      if (field.includes('date') || field.includes('giorno') || field.includes('datum')) dateIndex = i;
      else if (field.includes('amount') || field.includes('importo') || field.includes('value') || field.includes('betrag') || field.includes('sum')) amountIndex = i;
      else if (field.includes('description') || field.includes('descrizione') || field.includes('merchant') || field.includes('counterparty') || field.includes('beneficiary') || field.includes('payee') || field.includes('causale') || field.includes('subject') || field.includes('dettagli')) descIndex = i;
    }

    if (dateIndex === -1) dateIndex = 0;
    if (amountIndex === -1) amountIndex = Math.min(1, headerFields.length - 1);
    if (descIndex === -1) descIndex = Math.min(2, headerFields.length - 1);

    const transactions: Partial<Transaction>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const fields = splitCSVLine(lines[i], ',');
      if (fields.length < Math.max(dateIndex, amountIndex, descIndex) + 1) continue;

      const booking_date = parseCSVDate(fields[dateIndex]);
      const { amount, type } = parseCSVAmount(fields[amountIndex]);
      const counterparty = cleanMerchantName(fields[descIndex]);

      transactions.push({
        booking_date,
        amount,
        type,
        counterparty,
        category_id: 'other', // Will be updated by AI if enabled
        raw_data: lines[i],
      });
    }

    return transactions;
  }
};

// Registered Adapters (Order matters: generic fallback should be last)
const ADAPTERS: CSVAdapter[] = [
  PostFinanceAdapter,
  GenericAdapter
];

// ==========================================
// MAIN ENTRY
// ==========================================

export function parseCSVStatement(fileContent: string): Partial<Transaction>[] {
  if (!fileContent) return [];

  const lines = fileContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) return [];

  // Find the first adapter that matches
  const adapter = ADAPTERS.find(a => a.detect(lines));
  
  if (adapter) {
    console.log(`Using CSV Adapter: ${adapter.name}`);
    return adapter.parse(lines);
  }

  return [];
}

/**
 * Detects the most likely CSV delimiter based on character counts in the header row.
 */
export function detectCSVDelimiter(firstLine: string): string {
  const delimiters = [',', ';', '\t'];
  let bestDelimiter = ',';
  let maxCount = -1;
  for (const d of delimiters) {
    const count = firstLine.split(d).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = d;
    }
  }
  return bestDelimiter;
}

/**
 * Parses headers and up to 3 sample rows from the CSV content to provide a UI preview.
 */
export function parseCSVPreview(fileContent: string): { headers: string[]; previewRows: string[][]; delimiter: string } {
  if (!fileContent) return { headers: [], previewRows: [], delimiter: ',' };
  const lines = fileContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (lines.length === 0) return { headers: [], previewRows: [], delimiter: ',' };
  
  const delimiter = detectCSVDelimiter(lines[0]);
  const headers = splitCSVLine(lines[0], delimiter);
  
  const previewRows: string[][] = [];
  const maxPreview = Math.min(lines.length, 4); // Headers + up to 3 data rows
  for (let i = 1; i < maxPreview; i++) {
    previewRows.push(splitCSVLine(lines[i], delimiter));
  }
  
  return { headers, previewRows, delimiter };
}

/**
 * Parses the CSV file using a custom mapping configuration profile.
 */
export function parseCSVWithProfile(fileContent: string, profile: CSVMappingProfile): Partial<Transaction>[] {
  if (!fileContent) return [];
  
  const lines = fileContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
    
  if (lines.length <= 1) return [];
  
  const headers = splitCSVLine(lines[0], profile.delimiter).map(h => h.toLowerCase());
  
  // Find index of each mapped column
  const dateIdx = headers.indexOf(profile.dateHeader.toLowerCase());
  const descIdx = headers.indexOf(profile.counterpartyHeader.toLowerCase());
  
  let amountIdx = -1;
  let debitIdx = -1;
  let creditIdx = -1;
  
  if (profile.amountType === 'single') {
    amountIdx = headers.indexOf((profile.amountHeader || '').toLowerCase());
  } else {
    debitIdx = headers.indexOf((profile.debitHeader || '').toLowerCase());
    creditIdx = headers.indexOf((profile.creditHeader || '').toLowerCase());
  }
  
  const transactions: Partial<Transaction>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const fields = splitCSVLine(line, profile.delimiter);
    if (fields.length < Math.max(dateIdx, descIdx, amountIdx, debitIdx, creditIdx) + 1) continue;
    
    const rawDate = fields[dateIdx];
    const rawDesc = fields[descIdx];
    
    const booking_date = parseCSVDate(rawDate);
    const counterparty = cleanMerchantName(rawDesc);
    
    let amount = 0;
    let type: 'income' | 'expense' = 'expense';
    
    if (profile.amountType === 'single') {
      const rawAmount = fields[amountIdx];
      const parsed = parseCSVAmount(rawAmount);
      amount = parsed.amount;
      type = parsed.type;
    } else {
      const rawDebit = fields[debitIdx];
      const rawCredit = fields[creditIdx];
      
      // In split debit/credit, one is typically present and the other is empty or zero
      if (rawCredit && rawCredit.trim() !== '' && rawCredit.trim() !== '0' && rawCredit.trim() !== '0.00') {
        const parsed = parseCSVAmount(rawCredit);
        amount = parsed.amount;
        type = 'income';
      } else if (rawDebit && rawDebit.trim() !== '' && rawDebit.trim() !== '0' && rawDebit.trim() !== '0.00') {
        const parsed = parseCSVAmount(rawDebit);
        amount = parsed.amount;
        type = 'expense';
      }
    }
    
    transactions.push({
      booking_date,
      amount,
      type,
      counterparty,
      category_id: 'other', // Will be classified by AI if enabled
      raw_data: line,
    });
  }
  
  return transactions;
}

