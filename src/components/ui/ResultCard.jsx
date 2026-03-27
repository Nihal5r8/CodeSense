import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function ResultCard({ title, icon: Icon, children, defaultOpen = true, className = "", accentColor = null }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={`glass-panel overflow-hidden neon-border group transition-all duration-300 ${className}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-6 py-4 flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors focus:outline-none"
                style={accentColor ? {
                    borderLeft: `3px solid ${accentColor}`,
                    paddingLeft: '21px',
                } : {}}
            >
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-gradient-to-br from-slate-800 to-background border border-white/10 rounded-xl group-hover:border-neon-cyan/50 group-hover:shadow-[0_0_12px_rgba(0,243,255,0.4)] transition-all">
                        <Icon className="w-5 h-5 text-neon-cyan drop-shadow-[0_0_5px_rgba(0,243,255,0.5)] group-hover:text-white transition-colors" />
                    </div>
                    <h3 className="text-lg font-bold text-white tracking-wide">{title}</h3>
                </div>
                <div className="text-slate-400 group-hover:text-neon-cyan transition-colors bg-white/5 p-1 rounded">
                    {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                    >
                        <div className="p-6 border-t border-white/5 bg-background/20">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
