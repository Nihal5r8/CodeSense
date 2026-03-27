export function Badge({ children, className = '' }) {
    return (
        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-800 border border-slate-700 text-slate-300 ${className}`}>
            {children}
        </span>
    );
}
