import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function CodeBlock({ code, language = 'python' }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group rounded-xl overflow-hidden border border-white/5 bg-[#09090b]/80 shadow-[0_4px_20px_rgba(0,0,0,0.5)] z-0">
            <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-slate-700/50"></div>
                    <div className="w-3 h-3 rounded-full bg-slate-700/50"></div>
                    <div className="w-3 h-3 rounded-full bg-slate-700/50"></div>
                </div>
                <span className="absolute left-1/2 -translate-x-1/2 text-xs font-mono font-semibold text-neon-cyan/70 uppercase tracking-widest">{language}</span>
                <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>
            <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                customStyle={{
                    margin: 0,
                    padding: '1.5rem',
                    fontSize: '0.875rem',
                    background: 'transparent',
                    fontFamily: '"JetBrains Mono", monospace'
                }}
                wrapLongLines={true}
                showLineNumbers={true}
                lineNumberStyle={{ minWidth: '3em', paddingRight: '1em', color: '#52525b', textAlign: 'right' }}
            >
                {code || '// No code provided'}
            </SyntaxHighlighter>
        </div>
    );
}
