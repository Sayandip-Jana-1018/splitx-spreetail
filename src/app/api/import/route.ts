import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, ErrorMessages } from '@/lib/apiResponse';
import {
  parseCSVText,
  detectAnomalies,
  generateImportReport,
  type ImportResult,
  type Anomaly,
} from '@/lib/csvParser';

// ═══════════════════════════════════════════════════════════════
// POST /api/import — Parse CSV and return anomaly report
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return apiError(ErrorMessages.UNAUTHORIZED, 401);
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return apiError(ErrorMessages.USER_NOT_FOUND, 404);
    }

    const formData = await request.formData();
    const action = formData.get('action') as string;

    // ── Phase 1: Parse & Analyze ────────────────────────────
    if (action === 'analyze') {
      const file = formData.get('file') as File;
      if (!file) {
        return apiError('No CSV file provided', 400);
      }

      const text = await file.text();
      const rawRows = parseCSVText(text);

      if (rawRows.length === 0) {
        return apiError('CSV file is empty or has no data rows', 400);
      }

      const result = detectAnomalies(rawRows);
      const report = generateImportReport(result);

      return apiSuccess({
        result,
        report,
      });
    }

    // ── Phase 2: Apply Import ───────────────────────────────
    if (action === 'import') {
      const resultJson = formData.get('result') as string;
      const decisionsJson = formData.get('decisions') as string;
      const groupId = formData.get('groupId') as string;

      if (!resultJson || !groupId) {
        return apiError('Missing import data or group ID', 400);
      }

      const result: ImportResult = JSON.parse(resultJson);
      const decisions: Record<string, 'approve' | 'reject'> = decisionsJson
        ? JSON.parse(decisionsJson)
        : {};

      // Get or verify group
      const group = await prisma.group.findFirst({
        where: { id: groupId, deletedAt: null },
        include: { members: { include: { user: true } }, trips: true },
      });

      if (!group) {
        return apiError(ErrorMessages.GROUP_NOT_FOUND, 404);
      }

      // Ensure a default trip exists for imports
      let trip = group.trips.find((t) => t.isActive);
      if (!trip) {
        trip = await prisma.trip.create({
          data: {
            groupId: group.id,
            title: 'Imported Expenses',
            currency: 'INR',
            isActive: true,
          },
        });
      }

      // Build name → userId map from group members
      const memberMap = new Map<string, string>();
      for (const m of group.members) {
        if (m.user.name) {
          memberMap.set(m.user.name.toLowerCase(), m.user.id);
        }
      }

      // Process each row based on user decisions
      let imported = 0;
      let skipped = 0;
      const importErrors: string[] = [];

      // Apply user decisions to anomalies
      const rejectedRows = new Set<number>();
      for (const anomaly of result.anomalies) {
        const decision = decisions[anomaly.id];
        if (decision === 'reject') {
          // If user rejected the proposed action, mark affected rows
          if (anomaly.type === 'DUPLICATE_EXACT' || anomaly.type === 'DUPLICATE_ENTRY') {
            // User wants to keep both — don't skip
          } else {
            anomaly.rowNumbers.forEach((r) => rejectedRows.add(r));
          }
        }
      }

      // Determine which duplicate rows to skip
      const duplicateSkips = new Set<number>();
      for (const anomaly of result.anomalies) {
        if (
          (anomaly.type === 'DUPLICATE_EXACT' || anomaly.type === 'DUPLICATE_ENTRY') &&
          decisions[anomaly.id] !== 'reject'
        ) {
          // User approved removing duplicate — skip the second row
          const removeRow = (anomaly.relatedData as Record<string, number>)?.removeRow;
          if (removeRow) duplicateSkips.add(removeRow);
        }
      }

      for (const row of result.parsedRows) {
        // Skip rows that were flagged as skipped during analysis
        if (result.skippedRows.includes(row.rowNumber)) {
          skipped++;
          continue;
        }

        // Skip duplicate rows the user approved removing
        if (duplicateSkips.has(row.rowNumber)) {
          skipped++;
          continue;
        }

        // Find payer in group members
        const payerId = memberMap.get(row.paidBy.toLowerCase());
        if (!payerId) {
          importErrors.push(`Row ${row.rowNumber}: Payer "${row.paidBy}" not found in group members`);
          skipped++;
          continue;
        }

        try {
          if (row.isSettlement && row.settlementTo) {
            // Import as settlement
            const toId = memberMap.get(row.settlementTo.toLowerCase());
            if (!toId) {
              importErrors.push(`Row ${row.rowNumber}: Settlement recipient "${row.settlementTo}" not found`);
              skipped++;
              continue;
            }

            await prisma.settlement.create({
              data: {
                tripId: trip.id,
                fromId: payerId,
                toId: toId,
                amount: Math.abs(row.amount),
                status: 'completed',
                method: 'imported',
                note: `Imported from CSV: ${row.description}`,
              },
            });
            imported++;
          } else {
            // Import as expense
            const splitMembers = row.splitAmong
              .map((name) => ({
                name,
                userId: memberMap.get(name.toLowerCase()),
              }))
              .filter((m) => m.userId);

            if (splitMembers.length === 0) {
              importErrors.push(`Row ${row.rowNumber}: No valid members found for split`);
              skipped++;
              continue;
            }

            const absAmount = Math.abs(row.amount);
            const perPersonShare = Math.floor(absAmount / splitMembers.length);
            const remainder = absAmount - perPersonShare * splitMembers.length;

            await prisma.transaction.create({
              data: {
                tripId: trip.id,
                payerId: payerId,
                amount: absAmount,
                originalAmount: row.currency !== 'INR' ? Math.abs(row.originalAmount) : null,
                currency: row.currency,
                exchangeRate: row.exchangeRate,
                title: row.description,
                category: row.category.toLowerCase(),
                splitType: 'equal',
                importSource: 'csv_import',
                date: new Date(row.date),
                splits: {
                  create: splitMembers.map((m, idx) => ({
                    userId: m.userId!,
                    amount: perPersonShare + (idx < remainder ? 1 : 0),
                  })),
                },
              },
            });
            imported++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          importErrors.push(`Row ${row.rowNumber}: ${msg}`);
          skipped++;
        }
      }

      // Save import report to DB
      const anomaliesWithDecisions: Anomaly[] = result.anomalies.map((a) => ({
        ...a,
        userDecision: decisions[a.id] || undefined,
      }));

      await prisma.importReport.create({
        data: {
          userId: user.id,
          groupId: group.id,
          fileName: result.fileName,
          totalRows: result.totalRows,
          imported,
          skipped,
          anomalies: JSON.parse(JSON.stringify(anomaliesWithDecisions)),
          summary: JSON.parse(JSON.stringify({
            expenses: result.stats.expenses,
            settlements: result.stats.settlements,
            members: Object.keys(result.members),
            importErrors,
          })),
          status: importErrors.length > 0 ? 'partial' : 'completed',
        },
      });

      return apiSuccess({
        imported,
        skipped,
        errors: importErrors,
        totalRows: result.totalRows,
      });
    }

    return apiError('Invalid action. Use "analyze" or "import".', 400);
  } catch (error) {
    console.error('[API] Import error:', error);
    return apiError('Import failed. Please try again.', 500);
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/import — Fetch import history
// ═══════════════════════════════════════════════════════════════

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return apiError(ErrorMessages.UNAUTHORIZED, 401);
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return apiError(ErrorMessages.USER_NOT_FOUND, 404);
    }

    const reports = await prisma.importReport.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return apiSuccess(reports);
  } catch (error) {
    console.error('[API] Import history error:', error);
    return apiError('Failed to fetch import history', 500);
  }
}
