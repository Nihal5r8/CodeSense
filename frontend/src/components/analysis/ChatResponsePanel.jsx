import { MessageCircle, FileCheck, Info } from 'lucide-react';
import { PerformanceMetricsCard } from './PerformanceMetricsCard';
import { MarkdownPanel } from './MarkdownPanel';
import { ResultCard } from '../ui/ResultCard';

/**
 * ChatResponsePanel — data-driven, renders ALL populated sections.
 *
 * No chat_type switching. Whatever the backend populated gets shown:
 *   explanation      → Analysis & Explanation card
 *   test_cases       → Verification & Test Cases card
 *   complexity/time/space → Performance Metrics card
 *   chat_response    → Plain-text assistant card (fallback)
 *
 * Multiple sections can appear together (e.g. test cases + complexity).
 */
export function ChatResponsePanel({ result }) {
    if (!result) return null;

    const {
        test_cases, complexity,
        time_complexity, space_complexity,
        explanation, chat_response,
    } = result;

    const hasExplanation = !!explanation?.trim();
    const hasTests       = !!test_cases?.trim();
    const hasComplexity  = !!(time_complexity?.trim() || space_complexity?.trim() || complexity?.trim());
    const hasPlainText   = !!chat_response?.trim();

    if (!hasExplanation && !hasTests && !hasComplexity && !hasPlainText) return null;

    return (
        <div className="flex flex-col gap-6">

            {/* Step-by-step explanation — same panel as generate mode */}
            {hasExplanation && (
                <ResultCard title="Analysis & Explanation" icon={Info}>
                    <MarkdownPanel content={explanation} />
                </ResultCard>
            )}

            {/* Test cases — same panel as generate mode */}
            {hasTests && (
                <ResultCard title="Verification & Test Cases" icon={FileCheck} defaultOpen={false}>
                    <MarkdownPanel content={test_cases} />
                </ResultCard>
            )}

            {/* Complexity — same card as generate mode */}
            {hasComplexity && (
                <PerformanceMetricsCard result={result} />
            )}

            {/* General / plain-text fallback */}
            {hasPlainText && (
                <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 bg-white/3">
                        <div className="p-2 bg-neon-cyan/10 text-neon-cyan rounded-lg shadow-[0_0_10px_rgba(0,243,255,0.15)]">
                            <MessageCircle className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-semibold text-white/90 tracking-wide">
                            Assistant Response
                        </span>
                        <span className="ml-auto text-[10px] font-mono text-neon-cyan/50 tracking-widest uppercase">
                            Chat
                        </span>
                    </div>
                    <div className="px-6 py-5 space-y-3">
                        {chat_response.split('\n').map((line, i) =>
                            line.trim() === '' ? (
                                <div key={i} className="h-2" />
                            ) : (
                                <p key={i} className="text-slate-300 text-sm leading-relaxed font-mono">
                                    {line}
                                </p>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
