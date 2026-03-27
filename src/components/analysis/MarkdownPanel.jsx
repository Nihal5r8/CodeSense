// MarkdownPanel.jsx
// Renders LLM explanation text with proper step-by-step formatting.
// Splits "Step N:" patterns onto individual lines so they don't
// run together as a wall of text.

export function MarkdownPanel({ content }) {
    if (!content) return null;

    const formatted = content
        .replace(/\r\n/g, '\n')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+(Step\s+\d+\s*:)/g, '\n$1')
        .replace(/\s+(\*\s+)/g, '\n$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const lines = formatted.split('\n');

    return (
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {lines.map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} style={{ height: 8 }} />;

                // Step headers: "Step 1: Title - description"
                const stepMatch = trimmed.match(/^(Step\s+\d+\s*:\s*[\w\s]+?)\s*-\s*(.*)$/i);
                if (stepMatch) {
                    return (
                        <div key={i} style={{
                            padding: '10px 0',
                            borderBottom: '1px solid var(--border)',
                            marginTop: i === 0 ? 0 : 4,
                        }}>
                            <div style={{ marginBottom: 4 }}>
                                <span style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: 11, fontWeight: 700,
                                    color: 'var(--accent-cyan)',
                                    letterSpacing: '0.5px',
                                }}>
                                    {stepMatch[1].trim()}
                                </span>
                                <span style={{
                                    color: 'var(--text-secondary)', marginLeft: 8, fontSize: 13,
                                }}>
                                    {stepMatch[2].trim()}
                                </span>
                            </div>
                        </div>
                    );
                }

                // Plain step label with no dash
                const stepLabelOnly = trimmed.match(/^(Step\s+\d+\s*:.*)$/i);
                if (stepLabelOnly) {
                    return (
                        <div key={i} style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 11, fontWeight: 700,
                            color: 'var(--accent-cyan)',
                            letterSpacing: '0.5px',
                            paddingTop: i === 0 ? 0 : 10,
                            paddingBottom: 4,
                        }}>
                            {trimmed}
                        </div>
                    );
                }

                // Bullet points
                if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                    return (
                        <div key={i} style={{
                            display: 'flex', gap: 8, paddingLeft: 8,
                            color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.65,
                        }}>
                            <span style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: 2 }}>•</span>
                            <span>{trimmed.slice(2)}</span>
                        </div>
                    );
                }

                // Plain text line
                return (
                    <p key={i} style={{
                        color: 'var(--text-secondary)',
                        fontSize: 13, lineHeight: 1.65,
                    }}>
                        {trimmed}
                    </p>
                );
            })}
        </div>
    );
}