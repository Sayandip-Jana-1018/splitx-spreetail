/**
 * ═══════════════════════════════════════════════════════════════
 * SplitX — CSV Parser & Anomaly Detection Engine
 *
 * Ingests a raw CSV export of shared expenses,
 * detects data quality issues, and prepares clean rows for import.
 *
 * Designed for the Spreetail assignment:
 * - 15+ anomaly types detected
 * - Every problem surfaced to the user
 * - Explicit policy per anomaly type
 * ═══════════════════════════════════════════════════════════════
 */

// ── Types ──────────────────────────────────────────────────────

export interface RawCSVRow {
  rowNumber: number;
  date: string;
  description: string;
  amount: string;
  currency: string;
  paidBy: string;
  splitAmong: string;
  category: string;
  notes: string;
}

export interface ParsedExpense {
  rowNumber: number;
  date: Date;
  description: string;
  amount: number; // always in paise (INR)
  originalAmount: number; // original paise (before conversion)
  currency: string; // original currency
  exchangeRate: number | null;
  paidBy: string;
  splitAmong: string[];
  category: string;
  notes: string;
  isSettlement: boolean;
  settlementTo?: string; // if isSettlement, who receives
}

export type AnomalyType =
  | 'DUPLICATE_ENTRY'
  | 'DUPLICATE_EXACT'
  | 'NEGATIVE_AMOUNT'
  | 'SETTLEMENT_AS_EXPENSE'
  | 'INCONSISTENT_DATE_FORMAT'
  | 'AMBIGUOUS_DATE'
  | 'MISSING_CURRENCY'
  | 'FOREIGN_CURRENCY'
  | 'POST_DEPARTURE_MEMBER'
  | 'PRE_JOIN_MEMBER'
  | 'NAME_INCONSISTENCY'
  | 'WHITESPACE_IN_NAME'
  | 'MISSING_AMOUNT'
  | 'ZERO_AMOUNT'
  | 'MISSING_PAYER'
  | 'MEMBER_IN_WRONG_TRIP'
  | 'SPLITS_DONT_SUM';

export type AnomalyAction =
  | 'AUTO_FIXED'
  | 'NEEDS_USER_REVIEW'
  | 'SKIPPED'
  | 'KEPT_AS_IS';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: 'error' | 'warning' | 'info';
  rowNumbers: number[];
  description: string;
  details: string;
  proposedAction: string;
  action: AnomalyAction;
  userDecision?: 'approve' | 'reject' | 'modify';
  relatedData?: Record<string, unknown>;
}

export interface ImportResult {
  fileName: string;
  totalRows: number;
  parsedRows: ParsedExpense[];
  anomalies: Anomaly[];
  members: MemberTimeline;
  skippedRows: number[];
  stats: {
    expenses: number;
    settlements: number;
    totalAmountINR: number;
    uniqueMembers: number;
    foreignCurrencyRows: number;
    anomalyCount: number;
  };
}

// Member join/leave tracking for temporal validation
export interface MemberTimeline {
  [name: string]: {
    normalizedName: string;
    firstSeen: Date;
    lastSeen: Date;
    joinedAt: Date | null; // explicit join date if known
    leftAt: Date | null; // explicit leave date if known
  };
}

// ── Constants ──────────────────────────────────────────────────

/** Known members from the assignment context */
const KNOWN_MEMBERS_CONTEXT: Record<string, { joinedAt: string | null; leftAt: string | null }> = {
  'Aisha': { joinedAt: '2025-02-01', leftAt: null },
  'Rohan': { joinedAt: '2025-02-01', leftAt: null },
  'Priya': { joinedAt: '2025-02-01', leftAt: null },
  'Meera': { joinedAt: '2025-02-01', leftAt: '2025-03-31' },
  'Dev': { joinedAt: '2025-03-10', leftAt: '2025-03-12' }, // trip only
  'Sam': { joinedAt: '2025-04-15', leftAt: null },
};

/** Exchange rates (configurable — documented in DECISIONS.md) */
const EXCHANGE_RATES: Record<string, number> = {
  USD: 83.5,
  EUR: 90.0,
  GBP: 105.0,
};

/** Keywords that signal a settlement, not an expense */
const SETTLEMENT_KEYWORDS = [
  'paid', 'settled', 'settlement', 'repaid', 'returned money',
  'gave back', 'transferred', 'sent money', 'reimbursed',
];

// ── Core Parser ────────────────────────────────────────────────

/**
 * Parse raw CSV text into structured rows.
 * Handles quoted fields, commas inside quotes, and newlines.
 */
export function parseCSVText(text: string): RawCSVRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map((h) => h.trim().toLowerCase());

  const colMap = {
    date: findColumn(headers, ['date']),
    description: findColumn(headers, ['description', 'desc', 'title', 'item']),
    amount: findColumn(headers, ['amount', 'total', 'cost', 'price']),
    currency: findColumn(headers, ['currency', 'cur', 'curr']),
    paidBy: findColumn(headers, ['paid by', 'payer', 'paid_by', 'who paid']),
    splitAmong: findColumn(headers, ['split among', 'split_among', 'shared with', 'split between', 'members']),
    category: findColumn(headers, ['category', 'cat', 'type']),
    notes: findColumn(headers, ['notes', 'note', 'comment', 'remarks']),
  };

  const rows: RawCSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);

    rows.push({
      rowNumber: i + 1, // 1-indexed, including header
      date: getField(fields, colMap.date),
      description: getField(fields, colMap.description),
      amount: getField(fields, colMap.amount),
      currency: getField(fields, colMap.currency),
      paidBy: getField(fields, colMap.paidBy),
      splitAmong: getField(fields, colMap.splitAmong),
      category: getField(fields, colMap.category),
      notes: getField(fields, colMap.notes),
    });
  }

  return rows;
}

/** Parse a single CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function findColumn(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function getField(fields: string[], index: number): string {
  if (index < 0 || index >= fields.length) return '';
  return fields[index] || '';
}

// ── Anomaly Detection Pipeline ─────────────────────────────────

/**
 * Run full anomaly detection on parsed CSV rows.
 * Returns structured anomalies and cleaned expenses.
 */
export function detectAnomalies(rawRows: RawCSVRow[]): ImportResult {
  const anomalies: Anomaly[] = [];
  const members: MemberTimeline = {};
  const skippedRows: number[] = [];
  let anomalyCounter = 0;

  const makeId = () => `anomaly-${++anomalyCounter}`;

  // ── Pass 1: Name normalization & whitespace detection ─────
  const nameMap = new Map<string, string>(); // lowercase → canonical
  const allNames = new Set<string>();

  for (const row of rawRows) {
    // Check paidBy
    const rawPayer = row.paidBy;
    if (rawPayer && rawPayer !== rawPayer.trim()) {
      anomalies.push({
        id: makeId(),
        type: 'WHITESPACE_IN_NAME',
        severity: 'info',
        rowNumbers: [row.rowNumber],
        description: `Name "${rawPayer}" has leading/trailing whitespace`,
        details: `Payer name has extra spaces. Original: "${rawPayer}", Cleaned: "${rawPayer.trim()}"`,
        proposedAction: 'Auto-trim whitespace',
        action: 'AUTO_FIXED',
      });
    }

    // Check splitAmong for whitespace and case issues
    const splitNames = row.splitAmong.split(',').map((n) => n.trim()).filter(Boolean);
    for (const name of splitNames) {
      if (name !== name.trim()) {
        anomalies.push({
          id: makeId(),
          type: 'WHITESPACE_IN_NAME',
          severity: 'info',
          rowNumbers: [row.rowNumber],
          description: `Name "${name}" in split has whitespace`,
          details: `Split member name has extra spaces.`,
          proposedAction: 'Auto-trim whitespace',
          action: 'AUTO_FIXED',
        });
      }

      const trimmed = name.trim();
      const lower = trimmed.toLowerCase();
      allNames.add(trimmed);

      if (nameMap.has(lower)) {
        const canonical = nameMap.get(lower)!;
        if (canonical !== trimmed) {
          anomalies.push({
            id: makeId(),
            type: 'NAME_INCONSISTENCY',
            severity: 'warning',
            rowNumbers: [row.rowNumber],
            description: `Name case mismatch: "${trimmed}" vs "${canonical}"`,
            details: `Same person appears with different capitalization. "${trimmed}" will be normalized to "${canonical}".`,
            proposedAction: `Normalize to "${canonical}"`,
            action: 'AUTO_FIXED',
            relatedData: { original: trimmed, canonical },
          });
        }
      } else {
        // First occurrence — use Title Case as canonical
        const titleCase = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
        nameMap.set(lower, titleCase);
      }
    }

    // Also normalize paidBy
    if (rawPayer) {
      const pTrimmed = rawPayer.trim();
      const pLower = pTrimmed.toLowerCase();
      if (!nameMap.has(pLower)) {
        nameMap.set(pLower, pTrimmed.charAt(0).toUpperCase() + pTrimmed.slice(1).toLowerCase());
      }
    }
  }

  // ── Pass 2: Parse each row, detect per-row anomalies ──────
  const parsedRows: ParsedExpense[] = [];

  for (const row of rawRows) {
    // --- Missing amount ---
    if (!row.amount || row.amount.trim() === '') {
      anomalies.push({
        id: makeId(),
        type: 'MISSING_AMOUNT',
        severity: 'error',
        rowNumbers: [row.rowNumber],
        description: `Row ${row.rowNumber}: "${row.description}" has no amount`,
        details: `The amount field is empty. This row cannot be imported without a valid amount.`,
        proposedAction: 'Skip this row (user can manually add later)',
        action: 'NEEDS_USER_REVIEW',
      });
      skippedRows.push(row.rowNumber);
      continue;
    }

    // --- Missing payer ---
    if (!row.paidBy || row.paidBy.trim() === '') {
      anomalies.push({
        id: makeId(),
        type: 'MISSING_PAYER',
        severity: 'error',
        rowNumbers: [row.rowNumber],
        description: `Row ${row.rowNumber}: "${row.description}" has no payer`,
        details: `The "Paid By" field is empty. Cannot determine who paid.`,
        proposedAction: 'Skip this row (user can assign payer manually)',
        action: 'NEEDS_USER_REVIEW',
      });
      skippedRows.push(row.rowNumber);
      continue;
    }

    // --- Parse amount ---
    const cleanAmount = row.amount.replace(/[₹$,\s]/g, '').trim();
    const numericAmount = parseFloat(cleanAmount);

    if (isNaN(numericAmount)) {
      anomalies.push({
        id: makeId(),
        type: 'MISSING_AMOUNT',
        severity: 'error',
        rowNumbers: [row.rowNumber],
        description: `Row ${row.rowNumber}: Amount "${row.amount}" is not a valid number`,
        details: `Could not parse "${row.amount}" as a number.`,
        proposedAction: 'Skip this row',
        action: 'NEEDS_USER_REVIEW',
      });
      skippedRows.push(row.rowNumber);
      continue;
    }

    // --- Zero amount ---
    if (numericAmount === 0) {
      anomalies.push({
        id: makeId(),
        type: 'ZERO_AMOUNT',
        severity: 'warning',
        rowNumbers: [row.rowNumber],
        description: `Row ${row.rowNumber}: "${row.description}" has zero amount`,
        details: `An expense with ₹0 is suspicious — likely a data entry error or placeholder.`,
        proposedAction: 'Skip this row (zero-amount expenses have no financial effect)',
        action: 'NEEDS_USER_REVIEW',
        relatedData: { amount: 0, description: row.description },
      });
      skippedRows.push(row.rowNumber);
      continue;
    }

    // --- Negative amount ---
    if (numericAmount < 0) {
      anomalies.push({
        id: makeId(),
        type: 'NEGATIVE_AMOUNT',
        severity: 'warning',
        rowNumbers: [row.rowNumber],
        description: `Row ${row.rowNumber}: "${row.description}" has negative amount (${numericAmount})`,
        details: `Negative amounts are interpreted as refunds/credits. The split direction will be reversed — money flows back to the participants.`,
        proposedAction: 'Import as refund (reverse credit direction)',
        action: 'NEEDS_USER_REVIEW',
        relatedData: { amount: numericAmount, description: row.description },
      });
      // Don't skip — we handle it, but flag for review
    }

    // --- Currency detection ---
    let currency = row.currency?.trim().toUpperCase() || '';
    let exchangeRate: number | null = null;
    let amountPaise = Math.round(Math.abs(numericAmount) * 100);
    const originalAmountPaise = amountPaise;

    // Detect currency from amount string (e.g., "$45")
    if (!currency) {
      if (row.amount.includes('$')) currency = 'USD';
      else if (row.amount.includes('€')) currency = 'EUR';
      else if (row.amount.includes('£')) currency = 'GBP';
      else if (row.amount.includes('₹') || row.amount.toLowerCase().includes('inr')) currency = 'INR';
    }

    if (!currency) {
      currency = 'INR'; // default
      anomalies.push({
        id: makeId(),
        type: 'MISSING_CURRENCY',
        severity: 'info',
        rowNumbers: [row.rowNumber],
        description: `Row ${row.rowNumber}: No currency specified — defaulting to INR`,
        details: `The currency field is empty. Assuming Indian Rupees (INR).`,
        proposedAction: 'Default to INR',
        action: 'AUTO_FIXED',
      });
    }

    // --- Foreign currency conversion ---
    if (currency !== 'INR' && EXCHANGE_RATES[currency]) {
      exchangeRate = EXCHANGE_RATES[currency];
      amountPaise = Math.round(amountPaise * exchangeRate);
      anomalies.push({
        id: makeId(),
        type: 'FOREIGN_CURRENCY',
        severity: 'warning',
        rowNumbers: [row.rowNumber],
        description: `Row ${row.rowNumber}: "${row.description}" is in ${currency} (${Math.abs(numericAmount).toFixed(2)})`,
        details: `Converting ${currency} ${Math.abs(numericAmount).toFixed(2)} → ₹${(amountPaise / 100).toFixed(2)} at rate 1 ${currency} = ₹${exchangeRate}. The exchange rate used is a fixed approximate rate.`,
        proposedAction: `Convert to INR at rate ${exchangeRate}`,
        action: 'NEEDS_USER_REVIEW',
        relatedData: { originalCurrency: currency, originalAmount: numericAmount, rate: exchangeRate, convertedINR: amountPaise / 100 },
      });
    }

    // --- Date parsing ---
    const parsedDate = parseFlexibleDate(row.date, row.rowNumber, anomalies, makeId);
    if (!parsedDate) {
      skippedRows.push(row.rowNumber);
      continue;
    }

    // --- Settlement detection ---
    const descLower = row.description.toLowerCase();
    const catLower = row.category?.toLowerCase() || '';
    const isSettlement = SETTLEMENT_KEYWORDS.some((kw) => descLower.includes(kw)) || catLower === 'settlement';

    let settlementTo: string | undefined;
    if (isSettlement) {
      // Try to extract recipient from description: "Rohan paid Priya"
      const splitNames = row.splitAmong.split(',').map((n) => normalizeName(n, nameMap)).filter(Boolean);
      const payer = normalizeName(row.paidBy, nameMap);
      settlementTo = splitNames.find((n) => n !== payer) || splitNames[0];

      anomalies.push({
        id: makeId(),
        type: 'SETTLEMENT_AS_EXPENSE',
        severity: 'warning',
        rowNumbers: [row.rowNumber],
        description: `Row ${row.rowNumber}: "${row.description}" is a settlement, not an expense`,
        details: `This row appears to be a payment between members (keywords: "${catLower === 'settlement' ? 'category=Settlement' : SETTLEMENT_KEYWORDS.find((kw) => descLower.includes(kw))}"). It will be imported as a settlement record (${payer} → ${settlementTo}), not as a shared expense.`,
        proposedAction: 'Import as settlement instead of expense',
        action: 'NEEDS_USER_REVIEW',
        relatedData: { from: payer, to: settlementTo, amount: amountPaise / 100 },
      });
    }

    // --- Normalize names ---
    const paidBy = normalizeName(row.paidBy, nameMap);
    const splitAmong = row.splitAmong
      .split(',')
      .map((n) => normalizeName(n, nameMap))
      .filter(Boolean);

    // If amount was negative, keep the sign for processing
    const finalAmountPaise = numericAmount < 0 ? -amountPaise : amountPaise;
    const finalOriginalPaise = numericAmount < 0 ? -originalAmountPaise : originalAmountPaise;

    // --- Track member timeline ---
    const allInvolved = [paidBy, ...splitAmong].filter(Boolean);
    for (const name of allInvolved) {
      if (!members[name]) {
        members[name] = {
          normalizedName: name,
          firstSeen: parsedDate,
          lastSeen: parsedDate,
          joinedAt: KNOWN_MEMBERS_CONTEXT[name]?.joinedAt
            ? new Date(KNOWN_MEMBERS_CONTEXT[name].joinedAt!)
            : null,
          leftAt: KNOWN_MEMBERS_CONTEXT[name]?.leftAt
            ? new Date(KNOWN_MEMBERS_CONTEXT[name].leftAt!)
            : null,
        };
      } else {
        if (parsedDate < members[name].firstSeen) members[name].firstSeen = parsedDate;
        if (parsedDate > members[name].lastSeen) members[name].lastSeen = parsedDate;
      }
    }

    parsedRows.push({
      rowNumber: row.rowNumber,
      date: parsedDate,
      description: row.description,
      amount: finalAmountPaise,
      originalAmount: finalOriginalPaise,
      currency,
      exchangeRate,
      paidBy,
      splitAmong,
      category: row.category || 'general',
      notes: row.notes || '',
      isSettlement,
      settlementTo,
    });
  }

  // ── Pass 3: Cross-row anomaly detection ────────────────────

  // --- Duplicate detection (same date + similar description + similar amount) ---
  for (let i = 0; i < parsedRows.length; i++) {
    for (let j = i + 1; j < parsedRows.length; j++) {
      const a = parsedRows[i];
      const b = parsedRows[j];

      const sameDate = a.date.toDateString() === b.date.toDateString();
      const similarDesc = stringSimilarity(a.description.toLowerCase(), b.description.toLowerCase()) > 0.6;
      const exactDesc = a.description.toLowerCase() === b.description.toLowerCase();
      const sameAmount = a.amount === b.amount;
      const similarAmount = Math.abs(a.amount - b.amount) < Math.max(a.amount, b.amount) * 0.1;

      if (sameDate && exactDesc && sameAmount) {
        // Exact duplicate
        anomalies.push({
          id: makeId(),
          type: 'DUPLICATE_EXACT',
          severity: 'error',
          rowNumbers: [a.rowNumber, b.rowNumber],
          description: `Exact duplicate: Rows ${a.rowNumber} & ${b.rowNumber} — "${a.description}"`,
          details: `Same date, same description, same amount (₹${(a.amount / 100).toFixed(2)}). This is almost certainly a duplicate entry. The second occurrence (row ${b.rowNumber}) should be removed.`,
          proposedAction: `Remove row ${b.rowNumber} (keep row ${a.rowNumber})`,
          action: 'NEEDS_USER_REVIEW',
          relatedData: { keepRow: a.rowNumber, removeRow: b.rowNumber },
        });
      } else if (sameDate && similarDesc && !sameAmount && similarAmount) {
        // Same event logged by different people with different amounts
        anomalies.push({
          id: makeId(),
          type: 'DUPLICATE_ENTRY',
          severity: 'warning',
          rowNumbers: [a.rowNumber, b.rowNumber],
          description: `Possible duplicate: Rows ${a.rowNumber} & ${b.rowNumber} — "${a.description}" vs "${b.description}"`,
          details: `Same date and similar description but different amounts: ₹${(a.amount / 100).toFixed(2)} vs ₹${(b.amount / 100).toFixed(2)}. This may be the same event logged by two people. Which amount is correct?`,
          proposedAction: `Keep row ${a.rowNumber} (₹${(a.amount / 100).toFixed(2)}) — review manually`,
          action: 'NEEDS_USER_REVIEW',
          relatedData: {
            row1: { number: a.rowNumber, amount: a.amount / 100, payer: a.paidBy },
            row2: { number: b.rowNumber, amount: b.amount / 100, payer: b.paidBy },
          },
        });
      }
    }
  }

  // --- Temporal membership validation ---
  for (const row of parsedRows) {
    for (const member of row.splitAmong) {
      const timeline = members[member];
      if (!timeline) continue;

      // Post-departure check
      if (timeline.leftAt && row.date > timeline.leftAt) {
        anomalies.push({
          id: makeId(),
          type: 'POST_DEPARTURE_MEMBER',
          severity: 'warning',
          rowNumbers: [row.rowNumber],
          description: `Row ${row.rowNumber}: ${member} included in "${row.description}" but left on ${timeline.leftAt.toLocaleDateString('en-IN')}`,
          details: `${member} moved out on ${timeline.leftAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, but this expense is dated ${row.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Should ${member} still be part of this split?`,
          proposedAction: `Remove ${member} from this split`,
          action: 'NEEDS_USER_REVIEW',
          relatedData: { member, leftAt: timeline.leftAt.toISOString(), expenseDate: row.date.toISOString() },
        });
      }

      // Pre-join check
      if (timeline.joinedAt && row.date < timeline.joinedAt) {
        anomalies.push({
          id: makeId(),
          type: 'PRE_JOIN_MEMBER',
          severity: 'warning',
          rowNumbers: [row.rowNumber],
          description: `Row ${row.rowNumber}: ${member} included in "${row.description}" but joined on ${timeline.joinedAt.toLocaleDateString('en-IN')}`,
          details: `${member} joined on ${timeline.joinedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, but this expense is dated ${row.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. ${member} wasn't a member yet.`,
          proposedAction: `Remove ${member} from this split`,
          action: 'NEEDS_USER_REVIEW',
          relatedData: { member, joinedAt: timeline.joinedAt.toISOString(), expenseDate: row.date.toISOString() },
        });
      }
    }
  }

  // --- Meera in Goa hotel check (trip participant mismatch) ---
  for (const row of parsedRows) {
    if (row.category?.toLowerCase() === 'travel' || row.category?.toLowerCase() === 'activities') {
      const hasDevOrTrip = row.splitAmong.includes('Dev') || row.description.toLowerCase().includes('goa');
      const hasMeera = row.splitAmong.includes('Meera');
      if (hasDevOrTrip && hasMeera) {
        anomalies.push({
          id: makeId(),
          type: 'MEMBER_IN_WRONG_TRIP',
          severity: 'warning',
          rowNumbers: [row.rowNumber],
          description: `Row ${row.rowNumber}: Meera included in trip expense "${row.description}" but may not have been on the trip`,
          details: `This appears to be a trip expense (category: ${row.category}) that includes Dev (a trip participant) and also Meera. If Meera didn't go on this trip, she shouldn't be in the split.`,
          proposedAction: 'Remove Meera from this split if she wasn\'t on the trip',
          action: 'NEEDS_USER_REVIEW',
        });
      }
    }
  }

  // De-duplicate anomalies by row+type
  const seen = new Set<string>();
  const uniqueAnomalies = anomalies.filter((a) => {
    const key = `${a.type}:${a.rowNumbers.sort().join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Compute stats ──────────────────────────────────────────
  const activeRows = parsedRows.filter((r) => !skippedRows.includes(r.rowNumber));
  const stats = {
    expenses: activeRows.filter((r) => !r.isSettlement).length,
    settlements: activeRows.filter((r) => r.isSettlement).length,
    totalAmountINR: activeRows.reduce((sum, r) => sum + Math.abs(r.amount), 0),
    uniqueMembers: Object.keys(members).length,
    foreignCurrencyRows: activeRows.filter((r) => r.currency !== 'INR').length,
    anomalyCount: uniqueAnomalies.length,
  };

  return {
    fileName: 'expenses_export.csv',
    totalRows: rawRows.length,
    parsedRows,
    anomalies: uniqueAnomalies,
    members,
    skippedRows,
    stats,
  };
}

// ── Date Parsing ───────────────────────────────────────────────

/**
 * Parse a date string that could be in various formats:
 * - YYYY-MM-DD (ISO)
 * - DD/MM/YYYY (Indian)
 * - MM/DD/YYYY (American)
 * - DD-MM-YYYY
 *
 * Strategy: Try ISO first, then use heuristics for ambiguous formats.
 */
function parseFlexibleDate(
  dateStr: string,
  rowNumber: number,
  anomalies: Anomaly[],
  makeId: () => string
): Date | null {
  if (!dateStr || !dateStr.trim()) {
    anomalies.push({
      id: makeId(),
      type: 'INCONSISTENT_DATE_FORMAT',
      severity: 'error',
      rowNumbers: [rowNumber],
      description: `Row ${rowNumber}: Missing date`,
      details: 'No date provided for this entry.',
      proposedAction: 'Skip row',
      action: 'NEEDS_USER_REVIEW',
    });
    return null;
  }

  const trimmed = dateStr.trim();

  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // Try DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1]);
    const b = parseInt(slashMatch[2]);
    const year = parseInt(slashMatch[3]);

    // If first number > 12, it MUST be DD/MM/YYYY
    if (a > 12) {
      anomalies.push({
        id: makeId(),
        type: 'INCONSISTENT_DATE_FORMAT',
        severity: 'info',
        rowNumbers: [rowNumber],
        description: `Row ${rowNumber}: Date "${trimmed}" uses DD/MM/YYYY format`,
        details: `Detected non-ISO date format. Parsed as ${a}/${b}/${year} (DD/MM/YYYY).`,
        proposedAction: 'Auto-converted to standard format',
        action: 'AUTO_FIXED',
      });
      return new Date(year, b - 1, a);
    }

    // If second number > 12, it MUST be MM/DD/YYYY
    if (b > 12) {
      anomalies.push({
        id: makeId(),
        type: 'INCONSISTENT_DATE_FORMAT',
        severity: 'info',
        rowNumbers: [rowNumber],
        description: `Row ${rowNumber}: Date "${trimmed}" uses MM/DD/YYYY format`,
        details: `Detected American date format. Parsed as ${a}/${b}/${year} (MM/DD/YYYY).`,
        proposedAction: 'Auto-converted to standard format',
        action: 'AUTO_FIXED',
      });
      return new Date(year, a - 1, b);
    }

    // Ambiguous: both <= 12 (e.g., 03/05/2025)
    // Default to DD/MM/YYYY (Indian convention) but flag it
    anomalies.push({
      id: makeId(),
      type: 'AMBIGUOUS_DATE',
      severity: 'warning',
      rowNumbers: [rowNumber],
      description: `Row ${rowNumber}: Date "${trimmed}" is ambiguous — could be ${a} ${getMonthName(b)} or ${b} ${getMonthName(a)}`,
      details: `"${trimmed}" is ambiguous: is it ${a}/${b} (DD/MM — ${a} ${getMonthName(b)} ${year}) or ${b}/${a} (MM/DD — ${b} ${getMonthName(a)} ${year})? Defaulting to DD/MM/YYYY (Indian convention).`,
      proposedAction: `Interpreted as ${a} ${getMonthName(b)} ${year} (DD/MM/YYYY) — review if wrong`,
      action: 'NEEDS_USER_REVIEW',
      relatedData: {
        interpretation1: `${a} ${getMonthName(b)} ${year} (DD/MM)`,
        interpretation2: `${b} ${getMonthName(a)} ${year} (MM/DD)`,
        chosen: 'DD/MM/YYYY',
      },
    });
    return new Date(year, b - 1, a);
  }

  // Try DD-MM-YYYY
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const day = parseInt(dashMatch[1]);
    const month = parseInt(dashMatch[2]);
    const year = parseInt(dashMatch[3]);

    anomalies.push({
      id: makeId(),
      type: 'INCONSISTENT_DATE_FORMAT',
      severity: 'info',
      rowNumbers: [rowNumber],
      description: `Row ${rowNumber}: Date "${trimmed}" uses DD-MM-YYYY format`,
      details: `Non-standard dash-separated format. Parsed as ${day} ${getMonthName(month)} ${year}.`,
      proposedAction: 'Auto-converted to standard format',
      action: 'AUTO_FIXED',
    });
    return new Date(year, month - 1, day);
  }

  // Fallback: try native Date parser
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) {
    anomalies.push({
      id: makeId(),
      type: 'INCONSISTENT_DATE_FORMAT',
      severity: 'info',
      rowNumbers: [rowNumber],
      description: `Row ${rowNumber}: Date "${trimmed}" parsed with fallback parser`,
      details: `Non-standard format, used JavaScript Date parser.`,
      proposedAction: 'Auto-parsed',
      action: 'AUTO_FIXED',
    });
    return fallback;
  }

  anomalies.push({
    id: makeId(),
    type: 'INCONSISTENT_DATE_FORMAT',
    severity: 'error',
    rowNumbers: [rowNumber],
    description: `Row ${rowNumber}: Cannot parse date "${trimmed}"`,
    details: `The date format is unrecognizable.`,
    proposedAction: 'Skip this row',
    action: 'NEEDS_USER_REVIEW',
  });
  return null;
}

// ── Utilities ──────────────────────────────────────────────────

function normalizeName(raw: string, nameMap: Map<string, string>): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  return nameMap.get(lower) || trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function getMonthName(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1] || `Month-${month}`;
}

/**
 * Simple string similarity (Dice coefficient)
 * Returns 0-1, where 1 = identical
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));

  let intersectionSize = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (bigramsA.has(b.substring(i, i + 2))) intersectionSize++;
  }

  return (2 * intersectionSize) / (a.length - 1 + b.length - 1);
}

/**
 * Generate a downloadable import report as text
 */
export function generateImportReport(result: ImportResult): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════');
  lines.push('  SplitX — CSV Import Report');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`📁 File: ${result.fileName}`);
  lines.push(`📅 Imported: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
  lines.push('');

  lines.push('── Summary ──────────────────────────────────────────');
  lines.push(`  Total rows in CSV:        ${result.totalRows}`);
  lines.push(`  Expenses imported:        ${result.stats.expenses}`);
  lines.push(`  Settlements imported:     ${result.stats.settlements}`);
  lines.push(`  Rows skipped:             ${result.skippedRows.length}`);
  lines.push(`  Anomalies detected:       ${result.stats.anomalyCount}`);
  lines.push(`  Unique members found:     ${result.stats.uniqueMembers}`);
  lines.push(`  Foreign currency rows:    ${result.stats.foreignCurrencyRows}`);
  lines.push(`  Total amount (INR):       ₹${(result.stats.totalAmountINR / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  lines.push('');

  lines.push('── Members Detected ─────────────────────────────────');
  for (const [name, timeline] of Object.entries(result.members)) {
    const status = timeline.leftAt ? `left ${timeline.leftAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'active';
    lines.push(`  👤 ${name} (${status}) — seen from ${timeline.firstSeen.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} to ${timeline.lastSeen.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`);
  }
  lines.push('');

  if (result.anomalies.length > 0) {
    lines.push('── Anomalies Detected ───────────────────────────────');
    lines.push('');

    // Group by severity
    const errors = result.anomalies.filter((a) => a.severity === 'error');
    const warnings = result.anomalies.filter((a) => a.severity === 'warning');
    const infos = result.anomalies.filter((a) => a.severity === 'info');

    if (errors.length > 0) {
      lines.push(`  🔴 ERRORS (${errors.length}):`);
      errors.forEach((a, i) => {
        lines.push(`    ${i + 1}. [Row ${a.rowNumbers.join(', ')}] ${a.description}`);
        lines.push(`       → ${a.proposedAction} (${a.action})`);
      });
      lines.push('');
    }

    if (warnings.length > 0) {
      lines.push(`  🟡 WARNINGS (${warnings.length}):`);
      warnings.forEach((a, i) => {
        lines.push(`    ${i + 1}. [Row ${a.rowNumbers.join(', ')}] ${a.description}`);
        lines.push(`       → ${a.proposedAction} (${a.action})`);
      });
      lines.push('');
    }

    if (infos.length > 0) {
      lines.push(`  🔵 INFO (${infos.length}):`);
      infos.forEach((a, i) => {
        lines.push(`    ${i + 1}. [Row ${a.rowNumbers.join(', ')}] ${a.description}`);
        lines.push(`       → ${a.proposedAction} (${a.action})`);
      });
      lines.push('');
    }
  }

  if (result.skippedRows.length > 0) {
    lines.push('── Skipped Rows ─────────────────────────────────────');
    lines.push(`  Rows: ${result.skippedRows.join(', ')}`);
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════');
  lines.push('  Generated by SplitX Import Engine');
  lines.push('═══════════════════════════════════════════════════════');

  return lines.join('\n');
}
