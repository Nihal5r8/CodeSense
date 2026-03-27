export function Header() {
  const modes = ['GENERATE', 'ANALYZE', 'VISUALIZE', 'DEBUG', 'CHAT'];

  return (
    <header style={{
      textAlign: 'center', padding: '20px 0 12px',
      position: 'relative', zIndex: 1,
      width: '100%',
    }}>
      {/* Glowing top line */}
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px',
        background: 'linear-gradient(90deg, transparent, var(--accent-cyan), var(--accent-purple), transparent)',
        boxShadow: '0 0 12px var(--accent-cyan)',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
        {/* Animated logo icon */}
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(0,212,255,0.13), rgba(168,85,247,0.13))',
          border: '1px solid rgba(0,212,255,0.27)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
          color: 'var(--accent-cyan)',
          animation: 'logoSpin 8s ease-in-out infinite',
          boxShadow: 'var(--glow-cyan)',
          flexShrink: 0,
        }}>
          {'</>'}
        </div>
        <h1 style={{
          fontSize: 'clamp(18px, 3vw, 26px)', fontWeight: 800, letterSpacing: '-0.5px',
          background: 'linear-gradient(135deg, #e2e8f0 0%, var(--accent-cyan) 50%, var(--accent-purple) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          LLM Based Code Debugger and Analyser
        </h1>
      </div>

      {/* Mode pills */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
        {modes.map(mode => (
          <ModePill key={mode} label={mode} />
        ))}
      </div>

      <style>{`
        @keyframes logoSpin {
          0%, 100% { transform: rotate(0deg); }
          25%  { transform: rotate(-5deg); }
          75%  { transform: rotate(5deg);  }
        }
      `}</style>
    </header>
  );
}

function ModePill({ label }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '1.5px',
      color: 'var(--text-muted)', padding: '3px 10px',
      borderRadius: 20, border: '1px solid var(--border)',
      userSelect: 'none', pointerEvents: 'none',
    }}>
      {label}
    </span>
  );
}
