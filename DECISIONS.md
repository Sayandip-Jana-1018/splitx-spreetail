# DECISIONS.md — Engineering Decision Log

Every significant decision made during development, with alternatives considered and rationale.

---

## 1. Amount Storage: Paise (Integer) vs Decimal

**Decision:** Store all monetary amounts as integers in paise (₹1 = 100 paise).

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Float/Decimal | Human-readable in DB | Floating-point rounding errors (0.1 + 0.2 ≠ 0.3) |
| **Integer (paise)** ✅ | Exact arithmetic, no rounding | Requires conversion for display |
| String | No precision loss | Can't do arithmetic, terrible for queries |

**Why:** Financial apps cannot tolerate rounding errors. When splitting ₹100 three ways, 33.33 × 3 = 99.99 — a missing paisa. With integers: 3334 + 3333 + 3333 = 10000 paise exactly. The first N members get `base + 1` paise to distribute the remainder fairly.

---

## 2. Settlement Algorithm: Dual Strategy

**Decision:** Run both greedy netting and exact-match pruning, pick whichever produces fewer transfers.

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Simple pairwise | Easy to understand | O(n²) transfers possible |
| Greedy (largest first) | Always finds solution | May miss optimal matches |
| **Dual: Greedy + Exact-Match** ✅ | Best of both strategies | Slightly more code |
| NP-hard optimal | Provably minimum transfers | Exponential time, overkill for 4-6 people |

**Why:** For a flat of 4-6 people, both algorithms are instant. Running both and comparing gives us the best result without the complexity of the NP-hard minimum transfer problem. We report `optimizationSavings` to show users when the optimizer found a better solution.

---

## 3. CSV Import: Client-Side Parse + Server-Side Import

**Decision:** Parse CSV and detect anomalies on the client, execute DB writes on the server.

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Full server-side | Simple architecture | User can't preview before import, poor UX |
| Full client-side | Fast, no server calls for preview | Can't access DB without API |
| **Client parse + Server import** ✅ | Instant preview, server validates | Two-phase flow |

**Why:** The user needs to see and approve anomalies before anything touches the database. Client-side parsing gives instant preview with zero latency. Only the final "Apply & Import" step hits the server.

---

## 4. Negative Amounts: Refund vs Error

**Decision:** Treat negative amounts as refunds/credits, with the split direction reversed.

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Reject as error | Safe, no ambiguity | Loses valid refund data |
| **Treat as refund** ✅ | Handles real scenarios (deposit returns) | Could mask actual errors |
| Ask every time | Most accurate | Annoying UX for large imports |

**Why:** The CSV has "Returned Bottles Deposit" at -₹500 — this is clearly a refund, not an error. We import it with reversed split direction and flag it for user review, so real errors can still be caught.

---

## 5. Date Format Resolution: Default DD/MM/YYYY

**Decision:** For ambiguous dates (e.g., `03/05/2025`), default to DD/MM/YYYY.

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| **Default DD/MM/YYYY** ✅ | Matches Indian convention | Wrong if US format intended |
| Default MM/DD/YYYY | Safe for US dates | Indian users expect DD/MM |
| Reject ambiguous | No wrong guesses | Fails on many valid rows |
| Context-based | Smart | Complex, still uncertain |

**Why:** The flat is in India. Indian convention is DD/MM/YYYY. When both parts are ≤ 12, we default to DD/MM but flag it as "AMBIGUOUS_DATE" for user confirmation. The user sees both interpretations and can correct if needed.

---

## 6. Currency Conversion: Static Rates vs Live API

**Decision:** Use static exchange rates (USD: ₹83.50, EUR: ₹90, GBP: ₹105).

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Live API (fixer.io, exchangerate-api) | Accurate real-time rates | External dependency, rate limits, API keys |
| Historical API | Exact rate on expense date | Requires date-specific lookups, API cost |
| **Static rates** ✅ | No dependencies, fast, reproducible | Approximate, not exact |

**Why:** The trip was in March 2025. Historical exchange rates are fixed and known. Using an approximate static rate (₹83.50/USD) is simple, testable, and has zero external dependencies. The rate is documented and configurable in `currencyConverter.ts`. For a more precise solution, historical API integration could be added later.

---

## 7. Post-Departure Expenses: Flag vs Auto-Exclude

**Decision:** Flag for user review; do not auto-exclude.

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Auto-exclude departed members | Clean splits | Might remove valid entries (e.g., Meera owes for March electricity billed in April) |
| **Flag for review** ✅ | User decides each case | Requires user action |
| Include anyway | No data loss | Defeats purpose of tracking membership |

**Why:** There's a legitimate edge case: an electricity bill for March might arrive in April. Meera used the electricity in March, so she should arguably still pay her share even though she moved out March 31. We flag it and let the user decide each case.

---

## 8. Settlement-as-Expense Detection: Keywords + Category

**Decision:** Detect settlements using keyword matching on description + category field check.

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Category field only | Simple | CSV might not have "Settlement" category |
| **Keywords + Category** ✅ | Catches more cases | Possible false positives |
| Amount-based | Detects round numbers | Too many false positives |

**Why:** "Rohan paid Priya ₹3,000" has both the keyword "paid" and the category "Settlement". Using both signals reduces false positives while catching settlements that might be miscategorized.

---

## 9. Duplicate Detection: Dice Coefficient Similarity

**Decision:** Use bigram-based Dice coefficient for fuzzy string matching (threshold: 0.6).

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Exact string match | Zero false positives | Misses "Mainland China Dinner" vs "Dinner at Mainland China" |
| Levenshtein distance | Character-level precision | Slow for many comparisons |
| **Dice coefficient** ✅ | Fast, handles word reordering | Threshold tuning needed |

**Why:** Two people logged the same dinner with different descriptions: "Dinner at Mainland China" vs "Mainland China Dinner". Dice coefficient handles this because both share the same bigrams. The 0.6 threshold was chosen to catch obvious duplicates without flagging unrelated expenses.

---

## 10. Authentication: JWT over Database Sessions

**Decision:** Use JWT sessions with 30-day lifetime.

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Database sessions | Revocable, secure | Extra DB query per request |
| **JWT sessions** ✅ | Stateless, fast, no DB query | Can't revoke individual sessions |

**Why:** For a shared expenses app with 4-6 users, the security trade-off of JWT is acceptable. No DB query per request means faster page loads, especially on serverless (Neon cold starts).

---

## 11. Soft Deletes vs Hard Deletes

**Decision:** All destructive operations use `deletedAt` timestamp instead of removing rows.

**Why:** Meera explicitly said: "I want to approve anything the app deletes." Soft deletes enable undo, audit trails, and transparency. All queries include `WHERE deletedAt IS NULL` to filter deleted records.

---

## 12. Framework Choice: Next.js App Router

**Decision:** Use Next.js 16 with App Router.

**Why:** Full-stack in one framework — API routes, server components, middleware, and client components. No separate backend needed. Prisma integrates directly. Deployed instantly to Vercel.

---

## 13. Database: PostgreSQL on Neon

**Decision:** Use Neon serverless PostgreSQL.

**Why:** Free tier, serverless (no infra management), direct Prisma support, branching for development. The `directUrl` config bypasses the connection pooler for migrations.

---

## 14. Approval Workflow: Per-Anomaly Review

**Decision:** Each anomaly gets its own approve/reject decision.

**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Approve all / reject all | Fast | No granularity |
| **Per-anomaly** ✅ | Full control | More clicks |
| Category-level | Good balance | Still might group unrelated issues |

**Why:** Meera's request was clear: "I want to approve anything the app deletes or changes." Per-anomaly review gives maximum transparency and control.
