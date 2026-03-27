import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';

// Pipeline steps definition — ordered as they appear in the backend
const PIPELINE = [
    { key: 'detecting', label: 'Connecting to backend' },
    { key: 'model_loading|model_ready', label: 'Loading model' },
    { key: 'generating', label: 'Generating response ' },
    { key: 'parsing', label: 'Parsing sections' },
    { key: 'rendering', label: 'Rendering diagram' },
];

function ElapsedTimer({ running }) {
    const [secs, setSecs] = useState(0);

    useEffect(() => {
        if (!running) { setSecs(0); return; }
        const id = setInterval(() => setSecs(s => s + 1), 1000);
        return () => clearInterval(id);
    }, [running]);

    if (!running) return null;
    return (
        <span className="text-neon-cyan font-mono text-xs ml-1 tabular-nums">
            {secs}s
        </span>
    );
}

// Determine if a step's key matches a pipeline step key-set (pipe-separated)
function matchesKey(pipelineKey, stepKey) {
    return pipelineKey.split('|').includes(stepKey);
}

export function StatusPanel({ statusSteps }) {
    // statusSteps: array of { step, message, progress, state }
    // state: 'pending' | 'active' | 'done' | 'error'

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="glass-panel neon-border p-5 w-full"
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-5">
                <Loader2 className="w-4 h-4 text-neon-cyan animate-spin" />
                <span className="text-sm font-semibold text-white tracking-wide">Pipeline Status</span>
            </div>

            <div className="flex flex-col" style={{ gap: 4 }}>
                {PIPELINE.map((pipe, idx) => {
                    // Find the matching SSE step object for this pipeline entry
                    const stepObj = statusSteps?.find(s => matchesKey(pipe.key, s.step));
                    const state = stepObj?.state ?? 'pending';
                    const isActive = state === 'active';
                    const isDone = state === 'done';
                    const isError = state === 'error';
                    const isPending = !isActive && !isDone && !isError;

                    return (
                        <AnimatePresence key={pipe.key} mode="wait">
                            <motion.div
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: isPending ? 0.4 : 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px',
                                    borderRadius: 6,
                                    background: isActive ? 'var(--bg-hover)' : 'transparent',
                                    border: isActive
                                        ? '1px solid rgba(0,212,255,0.15)'
                                        : '1px solid transparent',
                                    transition: 'background 0.2s',
                                }}
                            >
                                {/* Left icon */}
                                <span className="flex-shrink-0">
                                    {isDone ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                                    ) : isActive ? (
                                        <Loader2 className="w-4 h-4 text-neon-cyan animate-spin" />
                                    ) : isError ? (
                                        <Circle className="w-4 h-4 text-red-400" />
                                    ) : (
                                        <Circle className="w-4 h-4 text-slate-600" />
                                    )}
                                </span>

                                {/* Label + timer */}
                                <div className="flex-1 flex items-center gap-1.5">
                                    <span className={`text-sm font-mono ${isDone ? 'text-slate-400' :
                                        isActive ? 'text-neon-cyan' :
                                            isError ? 'text-red-400' :
                                                'text-slate-600'
                                        }`}>
                                        {pipe.label}
                                    </span>
                                    {pipe.key === 'generating' && (
                                        <ElapsedTimer running={isActive} />
                                    )}
                                </div>

                                {/* Right status badge */}
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${isDone ? 'text-green-400 border-green-400/20 bg-green-400/5' :
                                    isActive ? 'text-neon-cyan border-neon-cyan/30 bg-neon-cyan/5' :
                                        isError ? 'text-red-400   border-red-400/20   bg-red-400/5' :
                                            'text-slate-600 border-slate-700/50 bg-transparent'
                                    }`}>
                                    {isDone ? 'done' : isActive ? 'running' : isError ? 'error' : 'pending'}
                                </span>
                            </motion.div>
                        </AnimatePresence>
                    );
                })}
            </div>

            {/* Progress bar — based on how many steps are done */}
            {statusSteps && (() => {
                const doneCount = PIPELINE.filter(p =>
                    statusSteps.some(s => matchesKey(p.key, s.step) && s.state === 'done')
                ).length;
                const pct = Math.round((doneCount / PIPELINE.length) * 100);
                return (
                    <div className="mt-5 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-neon-cyan to-neon-purple"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5 }}
                        />
                    </div>
                );
            })()}
        </motion.div>
    );
}
