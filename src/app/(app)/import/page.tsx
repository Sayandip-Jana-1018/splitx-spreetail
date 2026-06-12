'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, FileSpreadsheet, AlertTriangle, AlertCircle, Info,
    CheckCircle2, X, Download, ArrowRight, Shield, Sparkles, Eye,
    FileText, ChevronDown, ChevronUp, RotateCcw,
} from 'lucide-react';
import styles from './import.module.css';

/* ── Types (mirrors ImportResult from csvParser.ts) ── */
interface ParsedExpense {
    rowNumber: number;
    date: string;
    description: string;
    amount: number;
    originalAmount: number;
    currency: string;
    exchangeRate: number | null;
    paidBy: string;
    splitAmong: string[];
    category: string;
    notes: string;
    isSettlement: boolean;
    settlementTo?: string;
}

interface Anomaly {
    id: string;
    type: string;
    severity: 'error' | 'warning' | 'info';
    rowNumbers: number[];
    description: string;
    details: string;
    proposedAction: string;
    action: string;
    userDecision?: 'approve' | 'reject' | null;
    relatedData?: Record<string, unknown>;
}

interface ParseResult {
    fileName: string;
    totalRows: number;
    parsedRows: ParsedExpense[];
    anomalies: Anomaly[];
    skippedRows: number[];
    stats: {
        expenses: number;
        settlements: number;
        totalAmountINR: number;
        uniqueMembers: number;
        foreignCurrencyRows: number;
        anomalyCount: number;
    };
    members: Record<string, unknown>;
}

/* ── Animations ── */
const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const stagger = {
    visible: { transition: { staggerChildren: 0.06 } },
};

/* ── Helpers ── */
function severityIcon(s: string) {
    if (s === 'error') return <AlertCircle size={14} />;
    if (s === 'warning') return <AlertTriangle size={14} />;
    return <Info size={14} />;
}

function severityLabel(s: string) {
    if (s === 'error') return 'Error';
    if (s === 'warning') return 'Review';
    return 'Auto-fixed';
}

const STEPS = ['Upload', 'Preview', 'Review', 'Import'];

/* ══════════════════════════════════════════════════════════════
   Import Page Component
   ══════════════════════════════════════════════════════════════ */
export default function ImportPage() {
    const [step, setStep] = useState(0);
    const [file, setFile] = useState<File | null>(null);
    const [dragging, setDragging] = useState(false);
    const [result, setResult] = useState<ParseResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
    const [expandedAnomaly, setExpandedAnomaly] = useState<number | null>(null);
    const [anomalyTab, setAnomalyTab] = useState<'action' | 'autofixed' | 'all'>('action');
    const [groupId, setGroupId] = useState<string>('');
    const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
    const [groupsLoaded, setGroupsLoaded] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    /* ── Load groups on mount ── */
    const loadGroups = useCallback(async () => {
        if (groupsLoaded) return;
        try {
            const res = await fetch('/api/groups');
            const data = await res.json();
            const g = (data.groups || data || []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }));
            setGroups(g);
            if (g.length === 1) setGroupId(g[0].id);
            setGroupsLoaded(true);
        } catch { /* ignore */ }
    }, [groupsLoaded]);

    // Load on first render
    if (!groupsLoaded) loadGroups();

    // Safeguard: if state got out of sync (e.g. hot reload), reset to upload
    if (step > 0 && step < 3 && !result) {
        setStep(0);
    }

    /* ── File handling ── */
    const handleFile = (f: File) => {
        if (!f.name.endsWith('.csv')) return;
        setFile(f);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    };

    /* ── Analyze CSV ── */
    const analyze = async () => {
        if (!file) return;
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('action', 'analyze');
            if (groupId) formData.append('groupId', groupId);

            const res = await fetch('/api/import', { method: 'POST', body: formData });
            const json = await res.json();

            if (!res.ok || !json.success) throw new Error(json.error || 'Analysis failed');

            // API wraps in { success, data: { result, report } }
            const data = json.data;
            setResult(data.result);
            setStep(1);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setLoading(false);
        }
    };

    /* ── Run Import ── */
    const runImport = async () => {
        if (!result || !groupId) return;
        setImporting(true);
        setStep(3);
        setImportProgress(5);

        // Animate progress smoothly while waiting for the API
        let currentProgress = 5;
        const ticker = setInterval(() => {
            currentProgress = Math.min(currentProgress + (Math.random() * 4 + 1), 88);
            setImportProgress(Math.round(currentProgress));
        }, 800);

        try {
            const formData = new FormData();
            formData.append('action', 'import');
            formData.append('groupId', groupId);
            formData.append('result', JSON.stringify(result));

            // Build decisions map: anomalyId → decision
            const decisionsMap: Record<string, string> = {};
            result.anomalies.forEach(a => {
                decisionsMap[a.id] = a.userDecision || 'approve';
            });
            formData.append('decisions', JSON.stringify(decisionsMap));

            const res = await fetch('/api/import', { method: 'POST', body: formData });
            clearInterval(ticker);
            setImportProgress(95);

            const json = await res.json();
            setImportProgress(100);

            if (!res.ok || !json.success) throw new Error(json.error || 'Import failed');

            const data = json.data;
            setImportResult({
                imported: data.imported || 0,
                skipped: data.skipped || 0,
                errors: data.errors || [],
            });
        } catch (err) {
            clearInterval(ticker);
            setImportResult({ imported: 0, skipped: 0, errors: [err instanceof Error ? err.message : 'Import failed'] });
        } finally {
            setImporting(false);
        }
    };

    /* ── Decision handler ── */
    const setDecision = (idx: number, decision: 'approve' | 'reject') => {
        if (!result) return;
        const updated = { ...result };
        updated.anomalies = [...updated.anomalies];
        updated.anomalies[idx] = { ...updated.anomalies[idx], userDecision: decision };
        setResult(updated);
    };

    /* ── Download report ── */
    const downloadReport = () => {
        if (!result || !importResult) return;
        const lines = [
            '═══════════════════════════════════════════════',
            '  SplitX Import Report',
            '═══════════════════════════════════════════════',
            '',
            `File: ${result.fileName}`,
            `Date: ${new Date().toLocaleString()}`,
            `Total Rows: ${result.totalRows}`,
            `Imported: ${importResult.imported}`,
            `Skipped: ${importResult.skipped}`,
            '',
            '── Anomalies Found ──',
            '',
        ];

        result.anomalies.forEach((a, i) => {
            lines.push(`${i + 1}. [${a.severity.toUpperCase()}] ${a.type}`);
            if (a.rowNumbers?.length) lines.push(`   Row(s): ${a.rowNumbers.join(', ')}`);
            lines.push(`   ${a.description}`);
            lines.push(`   Action: ${a.proposedAction}`);
            lines.push(`   Decision: ${a.userDecision || 'approve'}`);
            lines.push('');
        });

        if (importResult.errors.length) {
            lines.push('── Import Errors ──', '');
            importResult.errors.forEach(e => lines.push(`  ⚠ ${e}`));
        }

        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `import-report-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const errors = result?.anomalies.filter(a => a.severity === 'error') || [];
    const warnings = result?.anomalies.filter(a => a.severity === 'warning') || [];
    const infos = result?.anomalies.filter(a => a.severity === 'info') || [];

    return (
        <>
            {/* ── Page Header ── */}
            <motion.div className={styles.pageHeader} initial="hidden" animate="visible" variants={fadeUp}>
                <div className={styles.pageHeaderIcon}>
                    <FileSpreadsheet size={26} />
                </div>
                <h1 className={styles.pageTitle}>Import Expenses</h1>
                <p className={styles.pageSubtitle}>
                    Upload a CSV file to import shared expenses with smart anomaly detection
                </p>
            </motion.div>

            {/* ── Stepper ── */}
            <motion.div className={styles.stepper} initial="hidden" animate="visible" variants={fadeUp}>
                {STEPS.map((label, i) => (
                    <div key={label} className={styles.stepItem}>
                        {i > 0 && (
                            <div className={`${styles.stepLine} ${i <= step ? styles.stepLineActive : styles.stepLineInactive}`} />
                        )}
                        <div className={`${styles.stepCircle} ${
                            i < step ? styles.stepComplete :
                            i === step ? styles.stepActive :
                            styles.stepInactive
                        }`}>
                            {i < step ? <CheckCircle2 size={14} /> : i + 1}
                        </div>
                        <span className={styles.stepLabel} style={{
                            color: i <= step ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
                        }}>
                            {label}
                        </span>
                    </div>
                ))}
            </motion.div>

            {/* ── Group Selector ── */}
            {groups.length > 1 && step < 3 && (
                <motion.div
                    style={{ marginBottom: 'var(--space-4)' }}
                    initial="hidden" animate="visible" variants={fadeUp}
                >
                    <div className={styles.card}>
                        <div style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--fg-secondary)' }}>Import to:</span>
                            <select
                                value={groupId}
                                onChange={e => setGroupId(e.target.value)}
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: 10,
                                    background: 'rgba(var(--accent-500-rgb), 0.04)',
                                    border: '1px solid rgba(var(--accent-500-rgb), 0.1)',
                                    color: 'var(--fg-primary)', fontSize: 'var(--text-sm)',
                                    fontWeight: 600, outline: 'none',
                                }}
                            >
                                <option value="">Select group…</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ══════════════════════════════════════════════
                STEP 0 — Upload
               ══════════════════════════════════════════════ */}
            <AnimatePresence mode="wait">
                {step === 0 && (
                    <motion.div key="upload" initial="hidden" animate="visible" exit="hidden" variants={fadeUp}>
                        <div className={styles.card}>
                            <div className={styles.cardGlow} />

                            {!file ? (
                                <div
                                    className={`${styles.dropZone} ${dragging ? styles.dropZoneDragging : ''}`}
                                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                                    onDragLeave={() => setDragging(false)}
                                    onDrop={onDrop}
                                    onClick={() => fileRef.current?.click()}
                                >
                                    <motion.div
                                        className={styles.dropIcon}
                                        animate={dragging ? { scale: 1.1, y: -8 } : { scale: 1, y: 0 }}
                                        transition={{ type: 'spring', damping: 15 }}
                                    >
                                        <Upload size={28} />
                                    </motion.div>
                                    <p className={styles.dropTitle}>Drop your CSV file here</p>
                                    <p className={styles.dropSubtitle}>or click to browse files</p>
                                    <span className={styles.dropMeta}>
                                        <FileText size={12} /> Accepts .csv files • Max 10MB
                                    </span>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept=".csv"
                                        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                                        style={{ display: 'none' }}
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className={styles.filePreview}>
                                        <div className={styles.filePreviewIcon}>
                                            <FileSpreadsheet size={20} />
                                        </div>
                                        <div className={styles.filePreviewInfo}>
                                            <div className={styles.filePreviewName}>{file.name}</div>
                                            <div className={styles.filePreviewMeta}>
                                                <span>{(file.size / 1024).toFixed(1)} KB</span>
                                                <span>•</span>
                                                <span>CSV</span>
                                            </div>
                                        </div>
                                        <button
                                            className={styles.filePreviewRemove}
                                            onClick={() => setFile(null)}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>

                                    <div className={styles.btnGroup}>
                                        <button
                                            className={styles.btnPrimary}
                                            onClick={analyze}
                                            disabled={loading || (!groupId && groups.length > 0)}
                                        >
                                            {loading ? (
                                                <motion.div
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                                >
                                                    <RotateCcw size={16} />
                                                </motion.div>
                                            ) : (
                                                <Sparkles size={16} />
                                            )}
                                            {loading ? 'Analyzing…' : 'Analyze & Detect Anomalies'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ── Features ── */}
                        {!file && (
                            <motion.div className={styles.featuresGrid} variants={stagger} initial="hidden" animate="visible">
                                <motion.div className={styles.featureCard} variants={fadeUp}>
                                    <div className={styles.featureIcon} style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05))', color: '#8b5cf6' }}>
                                        <Sparkles size={20} />
                                    </div>
                                    <p className={styles.featureTitle}>Smart Detection</p>
                                    <p className={styles.featureDesc}>Finds duplicates, missing data, inconsistent formats</p>
                                </motion.div>

                                <motion.div className={styles.featureCard} variants={fadeUp}>
                                    <div className={styles.featureIcon} style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(6,182,212,0.05))', color: '#06b6d4' }}>
                                        <Shield size={20} />
                                    </div>
                                    <p className={styles.featureTitle}>Review & Approve</p>
                                    <p className={styles.featureDesc}>Every anomaly surfaced — nothing auto-deleted</p>
                                </motion.div>

                                <motion.div className={styles.featureCard} variants={fadeUp}>
                                    <div className={styles.featureIcon} style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))', color: '#f59e0b' }}>
                                        <FileText size={20} />
                                    </div>
                                    <p className={styles.featureTitle}>Detailed Report</p>
                                    <p className={styles.featureDesc}>Downloadable report of every issue and action</p>
                                </motion.div>
                            </motion.div>
                        )}
                    </motion.div>
                )}

                {/* ══════════════════════════════════════════════
                    STEP 1 — Preview
                   ══════════════════════════════════════════════ */}
                {step === 1 && result && (
                    <motion.div key="preview" initial="hidden" animate="visible" exit="hidden" variants={fadeUp}>
                        <div className={styles.card}>
                            <div className={styles.cardGlow} />

                            {/* Stats */}
                            <div className={styles.statsRow}>
                                <div className={styles.statCard}>
                                    <div className={styles.statValue}>{result.totalRows}</div>
                                    <div className={styles.statLabel}>Rows</div>
                                </div>
                                <div className={styles.statCard}>
                                    <div className={styles.statValue}>{result.stats.expenses}</div>
                                    <div className={styles.statLabel}>Expenses</div>
                                </div>
                                <div className={styles.statCard}>
                                    <div className={styles.statValue}>{result.stats.settlements}</div>
                                    <div className={styles.statLabel}>Settlements</div>
                                </div>
                                <div className={styles.statCard}>
                                    <div className={styles.statValue}>{result.anomalies.length}</div>
                                    <div className={styles.statLabel}>Anomalies</div>
                                </div>
                            </div>

                            {/* Expense cards preview */}
                            <div className={styles.sectionTitle}>
                                <Eye size={16} /> Data Preview
                            </div>
                            <div style={{ padding: '0 var(--space-4) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {result.parsedRows.slice(0, 10).map((row) => (
                                    <div key={row.rowNumber} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '12px 14px', borderRadius: 14,
                                        background: row.isSettlement
                                            ? 'rgba(34,197,94,0.04)'
                                            : 'rgba(var(--accent-500-rgb), 0.03)',
                                        border: `1px solid ${row.isSettlement
                                            ? 'rgba(34,197,94,0.1)'
                                            : 'rgba(var(--accent-500-rgb), 0.06)'}`,
                                        transition: 'all 0.2s ease',
                                    }}>
                                        {/* Row number */}
                                        <span style={{
                                            width: 24, height: 24, borderRadius: 8,
                                            background: 'rgba(var(--accent-500-rgb), 0.08)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 10, fontWeight: 700, color: 'var(--fg-tertiary)',
                                            flexShrink: 0, fontFamily: 'var(--font-display)',
                                        }}>
                                            {row.rowNumber}
                                        </span>

                                        {/* Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
                                            }}>
                                                {row.description}
                                            </div>
                                            <div style={{
                                                fontSize: 11, color: 'var(--fg-tertiary)',
                                                display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap',
                                            }}>
                                                <span>{new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                                                <span style={{ opacity: 0.4 }}>•</span>
                                                <span style={{ fontWeight: 600, color: 'var(--fg-secondary)' }}>{row.paidBy}</span>
                                                <span style={{ opacity: 0.4 }}>•</span>
                                                <span style={{
                                                    padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                                    background: row.isSettlement
                                                        ? 'rgba(34,197,94,0.1)' : 'rgba(var(--accent-500-rgb), 0.06)',
                                                    color: row.isSettlement ? '#22c55e' : 'var(--fg-tertiary)',
                                                }}>
                                                    {row.isSettlement ? 'Settlement' : row.category}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Amount */}
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{
                                                fontSize: 14, fontWeight: 700, color: 'var(--fg-primary)',
                                                fontFamily: 'var(--font-display)',
                                            }}>
                                                {row.currency !== 'INR' && row.exchangeRate ? (
                                                    <>₹{(Math.abs(row.amount) / 100).toLocaleString('en-IN')}</>
                                                ) : (
                                                    <>₹{(Math.abs(row.amount) / 100).toLocaleString('en-IN')}</>
                                                )}
                                            </div>
                                            {row.currency !== 'INR' && (
                                                <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>
                                                    was {row.currency} {(Math.abs(row.originalAmount) / 100).toFixed(0)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {result.parsedRows.length > 10 && (
                                <div style={{
                                    padding: '0 var(--space-4) var(--space-3)', fontSize: 12,
                                    color: 'var(--fg-tertiary)', textAlign: 'center', fontWeight: 500,
                                }}>
                                    Showing 10 of {result.parsedRows.length} expenses
                                </div>
                            )}

                            <div className={styles.btnGroup}>
                                <button className={styles.btnSecondary} onClick={() => { setStep(0); setResult(null); setFile(null); }}>
                                    <RotateCcw size={14} /> Start Over
                                </button>
                                <button className={styles.btnPrimary} onClick={() => setStep(2)} style={{ maxWidth: 220 }}>
                                    Review Anomalies <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ══════════════════════════════════════════════
                    STEP 2 — Review Anomalies
                   ══════════════════════════════════════════════ */}
                {step === 2 && result && (
                    <motion.div key="review" initial="hidden" animate="visible" exit="hidden" variants={fadeUp}>
                        <div className={styles.card}>
                            <div className={styles.cardGlow} />

                            {/* ── Header with stats ── */}
                            <div style={{ padding: 'var(--space-4) var(--space-4) 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <Shield size={16} style={{ color: 'var(--accent-500)' }} />
                                        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}>
                                            {result.anomalies.length} Issues Found
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
                                        Review &amp; confirm before importing
                                    </div>
                                </div>
                                {/* Quick stats chips */}
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                    {errors.length > 0 && (
                                        <div style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)', fontSize: 11, fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <AlertCircle size={10} />{errors.length}
                                        </div>
                                    )}
                                    {warnings.length > 0 && (
                                        <div style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.15)', fontSize: 11, fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <AlertTriangle size={10} />{warnings.length}
                                        </div>
                                    )}
                                    {infos.length > 0 && (
                                        <div style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.15)', fontSize: 11, fontWeight: 700, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <CheckCircle2 size={10} />{infos.length}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── Tabs ── */}
                            <div style={{ display: 'flex', gap: 0, padding: 'var(--space-3) var(--space-4) 0', borderBottom: '1px solid rgba(var(--accent-500-rgb), 0.06)' }}>
                                {[
                                    { key: 'action', label: 'Action Needed', count: errors.length + warnings.length, color: errors.length > 0 ? '#ef4444' : '#f59e0b' },
                                    { key: 'autofixed', label: 'Auto-fixed', count: infos.length, color: '#22c55e' },
                                    { key: 'all', label: 'All', count: result.anomalies.length, color: 'var(--fg-tertiary)' },
                                ].map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setAnomalyTab(tab.key as typeof anomalyTab)}
                                        style={{
                                            flex: 1, padding: '10px 4px', background: 'none', border: 'none',
                                            borderBottom: anomalyTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                                            fontSize: 12, fontWeight: 600, color: anomalyTab === tab.key ? tab.color : 'var(--fg-tertiary)',
                                            cursor: 'pointer', transition: 'all 0.2s ease', fontFamily: 'var(--font-display)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        }}
                                    >
                                        {tab.label}
                                        <span style={{
                                            padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                                            background: anomalyTab === tab.key ? `${tab.color}20` : 'rgba(var(--accent-500-rgb), 0.06)',
                                            color: anomalyTab === tab.key ? tab.color : 'var(--fg-tertiary)',
                                        }}>{tab.count}</span>
                                    </button>
                                ))}
                            </div>

                            {/* ── Bulk approve button for action tab ── */}
                            {anomalyTab === 'action' && warnings.length > 0 && (
                                <div style={{ padding: 'var(--space-3) var(--space-4) 0', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={() => {
                                            if (!result) return;
                                            const updated = { ...result, anomalies: result.anomalies.map(a =>
                                                a.severity === 'warning' ? { ...a, userDecision: 'approve' as const } : a
                                            )};
                                            setResult(updated);
                                        }}
                                        style={{
                                            fontSize: 11, fontWeight: 600, color: '#22c55e',
                                            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                                            borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 5,
                                        }}
                                    >
                                        <CheckCircle2 size={11} /> Approve all warnings
                                    </button>
                                </div>
                            )}

                            {/* ── Anomaly list (filtered by tab) ── */}
                            <div className={styles.anomalyList}>
                                {result.anomalies
                                    .filter(a => {
                                        if (anomalyTab === 'action') return a.severity === 'error' || a.severity === 'warning';
                                        if (anomalyTab === 'autofixed') return a.severity === 'info';
                                        return true;
                                    })
                                    .map((a, i) => {
                                        const globalIdx = result.anomalies.indexOf(a);
                                        const isExpanded = expandedAnomaly === globalIdx;
                                        const needsAction = a.severity !== 'info';
                                        return (
                                            <motion.div
                                                key={a.id}
                                                variants={fadeUp}
                                                style={{
                                                    margin: '0 var(--space-4)', marginBottom: 8,
                                                    borderRadius: 14,
                                                    border: `1px solid ${
                                                        a.severity === 'error' ? 'rgba(239,68,68,0.15)' :
                                                        a.severity === 'warning' ? 'rgba(245,158,11,0.15)' :
                                                        'rgba(59,130,246,0.1)'
                                                    }`,
                                                    background: a.userDecision === 'reject' ? 'rgba(239,68,68,0.03)' :
                                                        a.userDecision === 'approve' ? 'rgba(34,197,94,0.03)' :
                                                        a.severity === 'error' ? 'rgba(239,68,68,0.03)' :
                                                        a.severity === 'warning' ? 'rgba(245,158,11,0.03)' :
                                                        'rgba(59,130,246,0.02)',
                                                    overflow: 'hidden',
                                                    opacity: a.userDecision === 'reject' ? 0.55 : 1,
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                {/* Row — always visible */}
                                                <div
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 10,
                                                        padding: '10px 12px', cursor: needsAction ? 'pointer' : 'default',
                                                    }}
                                                    onClick={() => needsAction && setExpandedAnomaly(isExpanded ? null : globalIdx)}
                                                >
                                                    {/* Severity dot */}
                                                    <div style={{
                                                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                                        background: a.severity === 'error' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6',
                                                    }} />

                                                    {/* Content */}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                                                            {a.type.replace(/_/g, ' ')}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {a.description}
                                                        </div>
                                                    </div>

                                                    {/* Right side */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                        {a.rowNumbers?.length > 0 && (
                                                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-tertiary)', background: 'rgba(var(--accent-500-rgb), 0.06)', padding: '2px 6px', borderRadius: 6 }}>
                                                                R{a.rowNumbers[0]}{a.rowNumbers.length > 1 ? `+${a.rowNumbers.length - 1}` : ''}
                                                            </span>
                                                        )}
                                                        {/* Inline approve/reject for warnings (no expand needed) */}
                                                        {a.severity === 'warning' && !isExpanded && (
                                                            <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                                                                <button onClick={() => setDecision(globalIdx, 'approve')} style={{
                                                                    width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
                                                                    background: a.userDecision === 'approve' ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.08)',
                                                                    color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    boxShadow: a.userDecision === 'approve' ? '0 0 0 1.5px #22c55e' : 'none',
                                                                }}><CheckCircle2 size={13} /></button>
                                                                <button onClick={() => setDecision(globalIdx, 'reject')} style={{
                                                                    width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
                                                                    background: a.userDecision === 'reject' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.06)',
                                                                    color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    boxShadow: a.userDecision === 'reject' ? '0 0 0 1.5px #ef4444' : 'none',
                                                                }}><X size={13} /></button>
                                                            </div>
                                                        )}
                                                        {a.severity === 'error' && (
                                                            needsAction && (isExpanded ? <ChevronUp size={13} style={{ color: 'var(--fg-tertiary)' }} /> : <ChevronDown size={13} style={{ color: 'var(--fg-tertiary)' }} />)
                                                        )}
                                                        {a.severity === 'info' && <CheckCircle2 size={13} style={{ color: '#3b82f6', opacity: 0.6 }} />}
                                                    </div>
                                                </div>

                                                {/* Expanded detail for errors */}
                                                <AnimatePresence>
                                                    {isExpanded && a.severity === 'error' && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.2 }}
                                                            style={{ overflow: 'hidden', borderTop: '1px solid rgba(239,68,68,0.1)' }}
                                                        >
                                                            <div style={{ padding: '10px 12px' }}>
                                                                <p style={{ fontSize: 12, color: 'var(--fg-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>{a.details}</p>
                                                                <div style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', padding: '6px 10px', borderRadius: 8, marginBottom: 10 }}>
                                                                    💡 {a.proposedAction}
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                                                                    <button onClick={() => setDecision(globalIdx, 'approve')} style={{
                                                                        flex: 1, padding: '7px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                                                                        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)',
                                                                        background: a.userDecision === 'approve' ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.08)',
                                                                        color: '#22c55e', boxShadow: a.userDecision === 'approve' ? '0 0 0 1.5px #22c55e' : 'none',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                                                    }}><CheckCircle2 size={12} /> Apply Fix</button>
                                                                    <button onClick={() => setDecision(globalIdx, 'reject')} style={{
                                                                        flex: 1, padding: '7px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                                                                        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)',
                                                                        background: a.userDecision === 'reject' ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.06)',
                                                                        color: '#ef4444', boxShadow: a.userDecision === 'reject' ? '0 0 0 1.5px #ef4444' : 'none',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                                                    }}><X size={12} /> Skip</button>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        );
                                    })
                                }

                                {/* Empty state */}
                                {anomalyTab === 'action' && errors.length === 0 && warnings.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--fg-tertiary)' }}>
                                        <CheckCircle2 size={28} style={{ color: '#22c55e', marginBottom: 8 }} />
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>No action needed!</div>
                                        <div style={{ fontSize: 12, marginTop: 4 }}>All issues were auto-fixed</div>
                                    </div>
                                )}
                            </div>

                            <div className={styles.btnGroup} style={{ paddingTop: 'var(--space-3)' }}>
                                <button className={styles.btnSecondary} onClick={() => setStep(1)}>
                                    ← Back
                                </button>
                                <button
                                    className={styles.btnPrimary}
                                    onClick={runImport}
                                    disabled={!groupId}
                                    style={{ maxWidth: 220 }}
                                >
                                    <Download size={14} /> Import Now
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ══════════════════════════════════════════════
                    STEP 3 — Importing / Complete
                   ══════════════════════════════════════════════ */}
                {step === 3 && (
                    <motion.div key="importing" initial="hidden" animate="visible" exit="hidden" variants={fadeUp}>
                        <div className={styles.card}>
                            <div className={styles.cardGlow} />

                            {importing ? (
                                <div className={styles.progressWrap}>
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                        style={{ color: 'var(--accent-500)' }}
                                    >
                                        <RotateCcw size={32} />
                                    </motion.div>
                                    <div className={styles.progressBar}>
                                        <motion.div
                                            className={styles.progressFill}
                                            initial={{ width: '0%' }}
                                            animate={{ width: `${importProgress}%` }}
                                        />
                                    </div>
                                    <span className={styles.progressText}>
                                        Importing expenses… {importProgress}%
                                    </span>
                                </div>
                            ) : importResult ? (
                                <div className={styles.completeWrap}>
                                    <motion.div
                                        className={styles.completeIcon}
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', damping: 12 }}
                                    >
                                        <CheckCircle2 size={36} />
                                    </motion.div>
                                    <h2 className={styles.completeTitle}>Import Complete!</h2>
                                    <p className={styles.completeSubtitle}>
                                        {importResult.imported} expenses imported • {importResult.skipped} skipped
                                    </p>

                                    {importResult.errors.length > 0 && (
                                        <div style={{
                                            marginTop: 'var(--space-3)', padding: 'var(--space-3)',
                                            borderRadius: 12, background: 'rgba(245,158,11,0.06)',
                                            border: '1px solid rgba(245,158,11,0.12)',
                                            fontSize: 12, color: '#f59e0b', textAlign: 'left', width: '100%',
                                        }}>
                                            <strong>Warnings:</strong>
                                            {importResult.errors.map((e, i) => <div key={i} style={{ marginTop: 4 }}>• {e}</div>)}
                                        </div>
                                    )}

                                    <div className={styles.btnGroup} style={{ marginTop: 'var(--space-4)' }}>
                                        <button className={styles.btnSecondary} onClick={downloadReport}>
                                            <FileText size={14} /> Download Report
                                        </button>
                                        <button
                                            className={styles.btnPrimary}
                                            onClick={() => window.location.href = '/dashboard'}
                                            style={{ maxWidth: 200 }}
                                        >
                                            Go to Dashboard <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
