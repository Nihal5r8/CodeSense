import { motion } from 'framer-motion';
import { GitCompare } from 'lucide-react';

// Filter helpers
const leftLines = line => line.type === 'unchanged' || line.type === 'removed';
const rightLines = line => line.type === 'unchanged' || line.type === 'added';

function lineStyle(type) {
    if (type === 'removed') return 'bg-red-900/30   border-l-2 border-red-500   text-red-300';
    if (type === 'added') return 'bg-green-900/30 border-l-2 border-green-500 text-green-300';
    return 'text-slate-500';
}

function linePrefix(type) {
    if (type === 'removed') return '-';
    if (type === 'added') return '+';
    return ' ';
}

function DiffColumn({ title, lines }) {
    return (
        <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500 mb-2 px-1">
                {title}
            </p>
            <div
                className="rounded-lg overflow-y-auto border border-white/5 bg-slate-950/50"
                style={{ maxHeight: '400px' }}
            >
                {lines.map((l, i) => (
                    <div
                        key={i}
                        className={`flex items-start gap-2 px-2 py-0.5 ${lineStyle(l.type)}`}
                    >
                        {/* Line number */}
                        <span className="w-7 flex-shrink-0 text-right text-[10px] font-mono text-slate-600 select-none pt-px">
                            {l.line_num}
                        </span>
                        {/* Prefix */}
                        <span className="flex-shrink-0 text-[10px] font-mono select-none pt-px opacity-60">
                            {linePrefix(l.type)}
                        </span>
                        {/* Content */}
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-5 flex-1">
                            {l.line}
                        </pre>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function DiffPanel({ diff, originalCode, fixedCode }) {
    // Nothing to show
    if (!diff?.length && !originalCode && !fixedCode) return null;

    const hasDiff = diff?.length > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="glass-panel neon-border p-5 w-full"
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <GitCompare className="w-4 h-4 text-neon-cyan" />
                <span className="text-sm font-semibold text-white tracking-wide">Code Changes</span>
                {hasDiff && (
                    <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded border text-neon-cyan/70 border-neon-cyan/20 bg-neon-cyan/5">
                        {diff.filter(l => l.type === 'removed').length} removed &nbsp;·&nbsp;
                        {diff.filter(l => l.type === 'added').length} added
                    </span>
                )}
            </div>

            {hasDiff ? (
                <div className="flex gap-3">
                    <DiffColumn title="Before (Buggy)" lines={diff.filter(leftLines)} />
                    <DiffColumn title="After (Fixed)" lines={diff.filter(rightLines)} />
                </div>
            ) : (
                <p className="text-sm font-mono text-slate-500 text-center py-6">
                    No differences detected — code was already correct
                </p>
            )}
        </motion.div>
    );
}
