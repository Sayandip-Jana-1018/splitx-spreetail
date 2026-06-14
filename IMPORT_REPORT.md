═══════════════════════════════════════════════════════
  SplitX — CSV Import Report
═══════════════════════════════════════════════════════

📁 File: Expenses Export.csv
📅 Imported: 15 Jun 2026, 12:06 am

── Summary ──────────────────────────────────────────
  Total rows in CSV:        42
  Expenses imported:        39
  Settlements imported:     1
  Rows skipped:             2
  Anomalies detected:       50
  Unique members found:     8
  Foreign currency rows:    4
  Total amount (INR):       ₹3,38,951.00

── Members Detected ─────────────────────────────────
  👤 Aisha (active) — seen from 1 Feb to 4 May
  👤 Rohan (active) — seen from 1 Feb to 4 May
  👤 Priya (active) — seen from 1 Feb to 4 May
  👤 Meera (active) — seen from 1 Feb to 2 Apr
  👤 Dev (active) — seen from 8 Feb to 14 Mar
  👤 Priya s (active) — seen from 18 Feb to 18 Feb
  👤 Dev's friend kabir (active) — seen from 11 Mar to 11 Mar
  👤 Sam (active) — seen from 8 Apr to 20 Apr

── Anomalies Detected ───────────────────────────────

  🔴 ERRORS (1):
    1. [Row 13] Row 13: "House cleaning supplies" has no payer
       → Skip this row (user can assign payer manually) (NEEDS_USER_REVIEW)

  🟡 WARNINGS (9):
    1. [Row 14] Row 14: "Rohan paid Aisha back" is a settlement, not an expense
       → Import as settlement instead of expense (NEEDS_USER_REVIEW)
    2. [Row 20] Row 20: "Goa villa booking" is in USD (540.00)
       → Convert to INR at rate 83.5 (NEEDS_USER_REVIEW)
    3. [Row 21] Row 21: "Beach shack lunch" is in USD (84.00)
       → Convert to INR at rate 83.5 (NEEDS_USER_REVIEW)
    4. [Row 23] Row 23: "Parasailing" is in USD (150.00)
       → Convert to INR at rate 83.5 (NEEDS_USER_REVIEW)
    5. [Row 26] Row 26: "Parasailing refund" has negative amount (-30)
       → Import as refund (reverse credit direction) (NEEDS_USER_REVIEW)
    6. [Row 26] Row 26: "Parasailing refund" is in USD (30.00)
       → Convert to INR at rate 83.5 (NEEDS_USER_REVIEW)
    7. [Row 27] Row 27: Date "Mar-14" is missing a year
       → Interpreted as 14 Mar 2026 — review if wrong (NEEDS_USER_REVIEW)
    8. [Row 31] Row 31: "Dinner order Swiggy" has zero amount
       → Skip this row (zero-amount expenses have no financial effect) (NEEDS_USER_REVIEW)
    9. [Row 24, 25] Possible duplicate: Rows 24 & 25 — "Dinner at Thalassa" vs "Thalassa dinner"
       → Keep row 24 (₹2400.00) — review manually (NEEDS_USER_REVIEW)

  🔵 INFO (40):
    1. [Row 2] Row 2: Date "01-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    2. [Row 3] Row 3: Date "03-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    3. [Row 4] Row 4: Date "05-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    4. [Row 5] Row 5: Date "08-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    5. [Row 6] Row 6: Date "08-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    6. [Row 7] Row 7: Date "10-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    7. [Row 8] Row 8: Date "12-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    8. [Row 9] Row 9: Date "14-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    9. [Row 10] Row 10: Date "15-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    10. [Row 11] Row 11: Date "18-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    11. [Row 12] Row 12: Date "20-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    12. [Row 14] Row 14: Date "25-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    13. [Row 15] Row 15: Date "28-02-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    14. [Row 16] Row 16: Date "01-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    15. [Row 17] Row 17: Date "03-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    16. [Row 18] Row 18: Date "05-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    17. [Row 19] Row 19: Date "08-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    18. [Row 20] Row 20: Date "09-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    19. [Row 21] Row 21: Date "10-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    20. [Row 22] Row 22: Date "10-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    21. [Row 23] Row 23: Date "11-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    22. [Row 24] Row 24: Date "11-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    23. [Row 25] Row 25: Date "11-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    24. [Row 26] Row 26: Date "12-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    25. [Row 28] Row 28: No currency specified — defaulting to INR
       → Default to INR (AUTO_FIXED)
    26. [Row 28] Row 28: Date "15-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    27. [Row 29] Row 29: Date "18-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    28. [Row 30] Row 30: Date "20-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    29. [Row 32] Row 32: Date "25-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    30. [Row 33] Row 33: Date "28-03-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    31. [Row 34] Row 34: Date "04-05-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    32. [Row 35] Row 35: Date "01-04-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    33. [Row 36] Row 36: Date "02-04-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    34. [Row 37] Row 37: Date "05-04-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    35. [Row 38] Row 38: Date "08-04-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    36. [Row 39] Row 39: Date "10-04-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    37. [Row 40] Row 40: Date "12-04-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    38. [Row 41] Row 41: Date "15-04-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    39. [Row 42] Row 42: Date "18-04-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)
    40. [Row 43] Row 43: Date "20-04-2026" uses DD-MM-YYYY format
       → Auto-converted to standard format (AUTO_FIXED)

── Skipped Rows ─────────────────────────────────────
  Rows: 13, 31

═══════════════════════════════════════════════════════
  Generated by SplitX Import Engine
═══════════════════════════════════════════════════════