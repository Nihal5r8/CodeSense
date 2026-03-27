import { useState, useEffect } from 'react'

const STEPS = [
  {
    title: '👋 Welcome to the LLM Code Debugger',
    body: "This tool uses a locally hosted AI model to help you generate, fix, visualize, and understand code. Let's take a quick tour.",
    target: null,
  },
  {
    title: '✏️ System Prompt',
    body: 'Type your request here. You can ask it to write code, fix bugs, visualize an algorithm, or ask questions about previous code.',
    target: '.system-prompt-panel',
  },
  {
    title: '🎙️ Voice Input',
    body: 'Click the microphone to speak your prompt instead of typing. It uses Whisper AI for transcription.',
    target: '.voice-btn',
  },
  {
    title: '⚡ Four Modes',
    body: 'The system auto-detects your intent:\n• Generate — write new code\n• Fix — debug broken code\n• Visualize — get a flowchart\n• Chat — ask follow-up questions',
    target: null,
  },
  {
    title: '🔷 React Flow Diagram',
    body: 'Every result includes an interactive diagram. You can zoom, pan, and click any node to see detailed information about that step.',
    target: '.react-flow-panel',
  },
  {
    title: '🔁 Session Context',
    body: 'The AI remembers your last 2 exchanges. Ask follow-up questions like "give me more test cases" or "explain step 3" without re-submitting code.',
    target: '.session-context-badge',
  },
  {
    title: "🚀 You're ready!",
    body: 'Try: "write a binary search in Python" or paste buggy code and say "fix this". The model runs locally — no data leaves your machine.',
    target: null,
  },
]

export default function Tutorial({ onComplete }) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem('tutorial_seen')
    if (!seen) {
      setTimeout(() => setVisible(true), 800)
    }
  }, [])

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else finish()
  }

  const finish = () => {
    localStorage.setItem('tutorial_seen', '1')
    setVisible(false)
    onComplete?.()
  }

  if (!visible) return null

  const current = STEPS[step]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={finish}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.67)',
          backdropFilter: 'blur(4px)', zIndex: 9000,
          animation: 'fadeIn .3s ease',
        }}
      />

      {/* Card */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9001,
        background: 'var(--bg-panel)',
        border: '1px solid rgba(0,212,255,0.27)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        width: 440,
        maxWidth: 'calc(100vw - 32px)',
        boxShadow: '0 0 60px rgba(0,212,255,0.13), 0 24px 48px rgba(0,0,0,0.53)',
        animation: 'fadeSlideUp .25s ease',
      }}>
        {/* Top accent */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))',
          borderRadius: '16px 16px 0 0',
        }} />

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 20 : 6, height: 6, borderRadius: 3,
                background: i === step ? 'var(--accent-cyan)' : 'var(--border-bright)',
                transition: 'width .3s',
              }}
            />
          ))}
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
          {current.title}
        </h2>
        <p style={{
          fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)',
          whiteSpace: 'pre-line', marginBottom: 28,
        }}>
          {current.body}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={finish}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              font: 'inherit', cursor: 'none', fontSize: 13, padding: '8px 0',
            }}
          >
            Skip tour
          </button>
          <button onClick={next} className="generate-btn" style={{ width: 'auto', padding: '10px 28px' }}>
            {step === STEPS.length - 1 ? "Let's go →" : 'Next →'}
          </button>
        </div>

        {/* Step counter */}
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          {step + 1} / {STEPS.length}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      `}</style>
    </>
  )
}
