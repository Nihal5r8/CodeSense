import { Code2, Zap, Binary, Clock, Tag } from 'lucide-react';
import { Badge } from '../ui/Badge';

// Mode accent colors per spec
const modeColor = (mode) => {
    if (!mode) return 'var(--text-primary)';
    const m = mode.toLowerCase();
    if (m === 'generate') return 'var(--accent-green)';
    if (m === 'debug')    return 'var(--accent-orange)';
    if (m === 'fix')      return 'var(--accent-orange)';
    if (m === 'visualize' || m === 'visualise') return 'var(--accent-purple)';
    if (m === 'chat')     return 'var(--accent-gold)';
    return 'var(--text-primary)';
};

export function MetadataCard({ metadata, mode, processTime }) {
    if (!metadata) return null;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Language */}
            <div className="meta-badge">
                <div className="meta-label">Language</div>
                <div className="meta-value" style={{ color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Code2 style={{ width: 14, height: 14, flexShrink: 0 }} />
                    {metadata.LANGUAGE || 'Unknown'}
                </div>
            </div>

            {/* Mode */}
            <div className="meta-badge">
                <div className="meta-label">Mode</div>
                <div className="meta-value" style={{ color: modeColor(mode), display: 'flex', alignItems: 'center', gap: 6, textTransform: 'capitalize' }}>
                    <Zap style={{ width: 14, height: 14, flexShrink: 0 }} />
                    {mode || 'Auto'}
                </div>
            </div>

            {/* Algorithm */}
            <div className="meta-badge">
                <div className="meta-label">Algorithm / Target</div>
                <div className="meta-value" style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Binary style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--text-muted)' }} />
                    {metadata.ALGORITHM || metadata.FILENAME || 'General Scope'}
                </div>
            </div>

            {/* Process Time */}
            <div className="meta-badge">
                <div className="meta-label">Process Time</div>
                <div className="meta-value" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock style={{ width: 14, height: 14, flexShrink: 0 }} />
                    {processTime ? `${processTime} s` : 'N/A'}
                </div>
            </div>

            {/* Tags (optional) */}
            {metadata.tags && metadata.tags.length > 0 && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {metadata.tags.map(tag => (
                        <Badge key={tag} className="flex items-center gap-1 bg-neon-cyan/10 text-neon-cyan border-neon-cyan/20">
                            <Tag style={{ width: 10, height: 10 }} />
                            {tag}
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    );
}
