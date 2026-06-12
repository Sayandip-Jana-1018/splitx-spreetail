# AI_USAGE.md — AI Tools, Prompts & Error Log

## Tools Used

| Tool | Purpose | Usage |
|------|---------|-------|
| **Antigravity IDE (Gemini-powered)** | Primary development collaborator | Architecture design, CSV parser engine, anomaly detection logic, UI components, documentation |
| **Claude (via Antigravity)** | Code generation, decision analysis | Complex algorithm design, edge case analysis |

---

## Key Prompts

### 1. CSV Anomaly Detection Engine
> "Create a CSV parser for expenses_export.csv that detects at least 12 data problems including: duplicates, negative amounts, settlements logged as expenses, inconsistent date formats, currency mismatches, post-departure member inclusion, name inconsistencies, missing fields, and ambiguous dates. Each anomaly should be surfaced to the user with a proposed action."

**Result:** Generated the `csvParser.ts` module with 15 anomaly types, three-pass detection (name normalization → per-row → cross-row), and a structured import report.

### 2. Settlement Algorithm
> "Implement a settlement simplification algorithm that minimizes the number of transfers. Run both greedy netting and exact-match pruning, pick whichever produces fewer transfers."

**Result:** Generated `settlement.ts` with dual strategy, paise-based arithmetic, and remainder distribution.

### 3. Multi-Currency Support
> "Add multi-currency support to handle USD trip expenses. Use static exchange rates since the trip was in a specific month. Store original amount, currency, and exchange rate alongside the converted INR amount."

**Result:** Generated `currencyConverter.ts` with configurable static rates and dual-amount display formatting.

---

## AI Errors Caught & Corrected

### Error 1: Floating-Point Amount Parsing

**What AI generated:**
```typescript
const amountPaise = numericAmount * 100;
```

**The problem:** `1850.5 * 100 = 185049.99999999997` in JavaScript. This creates rounding errors in split calculations, violating our "exact integer arithmetic" principle.

**What I changed:**
```typescript
const amountPaise = Math.round(Math.abs(numericAmount) * 100);
```

**Why:** `Math.round()` ensures we always get an exact integer, preventing silent accumulation of floating-point errors across dozens of transactions.

---

### Error 2: Duplicate Detection Missing Reverse Description Matching

**What AI generated:**
The initial duplicate detection used exact string matching:
```typescript
const isDuplicate = a.description === b.description && a.date === b.date;
```

**The problem:** "Dinner at Mainland China" and "Mainland China Dinner" are clearly the same event but have different strings. Exact matching would miss this duplicate entirely — the most critical anomaly in the CSV.

**What I changed:**
Implemented Dice coefficient (bigram-based) similarity matching:
```typescript
function stringSimilarity(a: string, b: string): number {
  // Bigram Dice coefficient — handles word reordering
  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));
  let intersectionSize = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (bigramsA.has(b.substring(i, i + 2))) intersectionSize++;
  }
  return (2 * intersectionSize) / (a.length - 1 + b.length - 1);
}
```

**Why:** Bigram similarity naturally handles word reordering ("Mainland China Dinner" ↔ "Dinner at Mainland China" share most bigrams). The 0.6 threshold was tuned to catch obvious duplicates without false positives on unrelated expenses.

---

### Error 3: Date Parsing Defaulting to MM/DD/YYYY

**What AI generated:**
```typescript
// Default to MM/DD/YYYY when ambiguous
return new Date(year, a - 1, b); // a = month, b = day
```

**The problem:** The flatmates are in India. Indian date convention is DD/MM/YYYY. Defaulting to American MM/DD/YYYY would silently misinterpret `03/05/2025` as March 5 instead of May 3 (or vice versa) — and the user would never know.

**What I changed:**
```typescript
// Default to DD/MM/YYYY (Indian convention) but FLAG it
anomalies.push({
  type: 'AMBIGUOUS_DATE',
  description: `"${trimmed}" is ambiguous — could be ${a} ${getMonthName(b)} or ${b} ${getMonthName(a)}`,
  proposedAction: `Interpreted as ${a} ${getMonthName(b)} ${year} (DD/MM/YYYY) — review if wrong`,
  action: 'NEEDS_USER_REVIEW',
});
return new Date(year, b - 1, a); // b = month, a = day (DD/MM)
```

**Why:** Two fixes: (1) Changed default to DD/MM/YYYY to match the locale, (2) Added explicit flagging so the user sees both possible interpretations and can correct if needed. Silent guessing is exactly what the assignment warns against.

---

## Observations on AI Collaboration

1. **AI excels at boilerplate** — generating CRUD endpoints, CSS frameworks, and standard patterns saved hours
2. **AI struggles with domain-specific edge cases** — the floating-point issue and date locale defaulting required human understanding of the problem domain
3. **AI-generated code must be read line-by-line** — the three errors above would have caused subtle, hard-to-debug issues in production
4. **Prompting matters** — specific prompts with concrete examples produced far better results than vague "build an import feature" requests
5. **The engineer is the engineer** — AI is a collaborator, not a replacement. Every line was reviewed, tested, and understood before submission
