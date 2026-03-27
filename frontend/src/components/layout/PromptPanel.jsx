import { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, Play, Activity, Mic, MicOff, Loader2, ChevronDown } from 'lucide-react';
import { transcribeAudio } from '../../services/api';

// ── Live Backend Status Hook ──────────────────────────────────────────────────
function useBackendStatus() {
  const [status, setStatus] = useState('checking')   // 'checking' | 'connected' | 'disconnected'
  const [modelLoaded, setModelLoaded] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/health', {
          signal: AbortSignal.timeout(4000),
        })
        if (res.ok) {
          const data = await res.json()
          setStatus('connected')
          setModelLoaded(data.model_loaded ?? false)
        } else {
          setStatus('disconnected')
        }
      } catch {
        setStatus('disconnected')
      }
    }
    check() // fire immediately on mount
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  return { status, modelLoaded }
}

export function PromptPanel({ userPrompt, setUserPrompt, handleSubmit, loading, options, setOptions, detectedMode = 'generate' }) {
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [micError, setMicError] = useState(false);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const { status, modelLoaded } = useBackendStatus();

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);
    const autoStopRef = useRef(null);

    const stopRecording = useCallback(() => {
        if (autoStopRef.current) {
            clearTimeout(autoStopRef.current);
            autoStopRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setIsRecording(false);
    }, []);

    const toggleRecording = useCallback(async () => {
        if (isRecording) {
            stopRecording();
            return;
        }
        setMicError(false);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };
            mediaRecorder.onstop = async () => {
                setIsTranscribing(true);
                try {
                    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        try {
                            const base64 = reader.result.split(',')[1];
                            const data = await transcribeAudio(base64, 'audio/webm');
                            if (data?.text) setUserPrompt(data.text);
                        } catch {
                            setMicError(true);
                            setTimeout(() => setMicError(false), 3000);
                        } finally {
                            setIsTranscribing(false);
                        }
                    };
                    reader.readAsDataURL(blob);
                } catch {
                    setMicError(true);
                    setIsTranscribing(false);
                    setTimeout(() => setMicError(false), 3000);
                }
            };
            mediaRecorder.start();
            setIsRecording(true);
            autoStopRef.current = setTimeout(() => { stopRecording(); }, 10000);
        } catch {
            setMicError(true);
            setTimeout(() => setMicError(false), 3000);
        }
    }, [isRecording, setUserPrompt, stopRecording]);

    const getMicButtonClass = () => {
        const base = 'flex items-center justify-center w-11 h-11 rounded-xl border transition-all duration-200 flex-shrink-0';
        if (micError) return `${base} bg-red-500/20 border-red-500/50 text-red-400 cursor-not-allowed`;
        if (isTranscribing) return `${base} bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan cursor-wait`;
        if (isRecording) return `${base} bg-red-500/20 border-red-500/60 text-red-400 animate-pulse`;
        return `${base} bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-white`;
    };

    const MicIcon = () => {
        if (isTranscribing) return <Loader2 className="w-5 h-5 animate-spin" />;
        if (micError) return <MicOff className="w-5 h-5" />;
        if (isRecording) return <MicOff className="w-5 h-5" />;
        return <Mic className="w-5 h-5" />;
    };

    return (
        <div className="flex flex-col gap-4 w-full h-full">
            <div className="glass-panel neon-border" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Cyan-purple accent bar at top of panel */}
                <div style={{
                    height: 3,
                    background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))',
                    boxShadow: '0 0 8px var(--accent-cyan)',
                }} />

                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Header row: title + live status badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h2 style={{
                            fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <Sparkles style={{ width: 18, height: 18, color: 'var(--accent-purple)' }} />
                            System Prompt
                        </h2>

                        {/* Live backend status badge */}
                        <div className={`status-badge status-${status}`}>
                            <span className="status-dot" />
                            {status === 'checking'     && 'Connecting...'}
                            {status === 'connected'    && modelLoaded  && 'Model Ready ✓'}
                            {status === 'connected'    && !modelLoaded && 'Backend Ready'}
                            {status === 'disconnected' && 'Backend Offline'}
                        </div>
                    </div>

                    {/* Prompt textarea */}
                    <textarea
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                        placeholder="Describe the logic or paste the code you want to debug, analyze, or visualize..."
                        className="prompt-textarea"
                        style={{ minHeight: 250, flexGrow: 1 }}
                        disabled={loading}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                handleSubmit(e);
                            }
                        }}
                    />

                    {/* Mic hint */}
                    {(isRecording || isTranscribing || micError) && (
                        <p style={{
                            fontSize: 12, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center',
                            color: micError ? '#ff4d6d' : isTranscribing ? 'var(--accent-cyan)' : '#ff4d6d',
                            marginTop: -8,
                        }}>
                            {micError ? '⚠ Mic error — check permissions or backend' :
                                isTranscribing ? '⏳ Transcribing audio…' :
                                    '🔴 Recording… click mic to stop (max 10s)'}
                        </p>
                    )}

                    {/* Options collapsible — hidden in chat mode */}
                    {detectedMode !== 'chat' && (
                    <div style={{ marginTop: -4 }}>
                        <button
                            type="button"
                            onClick={() => setOptionsOpen(o => !o)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                background: 'none', border: 'none', padding: '4px 0',
                                color: 'var(--text-muted)', fontSize: 11,
                                fontFamily: "'JetBrains Mono', monospace",
                                letterSpacing: '0.5px', cursor: 'none',
                                transition: 'color .15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                            <ChevronDown style={{
                                width: 12, height: 12,
                                transform: optionsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform .2s',
                            }} />
                            Output Options
                        </button>

                        {optionsOpen && (
                            <div style={{
                                marginTop: 6, padding: '10px 12px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
                            }}>
                                {[
                                    ['show_metadata',     'Show Metadata'],
                                    ['show_code',         'Show Code'],
                                    ['show_visualization','Show Diagram'],
                                    ['show_annotated',    'Show Step-by-Step'],
                                    ['show_complexity',   'Show Complexity'],
                                    ['show_tests',        'Show Test Cases'],
                                ].map(([key, label]) => (
                                    <label key={key} style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        fontSize: 11, color: 'var(--text-secondary)',
                                        fontFamily: "'JetBrains Mono', monospace",
                                        cursor: 'none', userSelect: 'none',
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={options?.[key] ?? true}
                                            onChange={e => setOptions(prev => ({ ...prev, [key]: e.target.checked }))}
                                            style={{
                                                width: 12, height: 12,
                                                accentColor: 'var(--accent-cyan)',
                                                cursor: 'none', flexShrink: 0,
                                            }}
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                    )}

                    {/* Submit row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Mic button */}
                        <button
                            type="button"
                            onClick={toggleRecording}
                            disabled={loading || isTranscribing}
                            className={`voice-btn ${getMicButtonClass()}`}
                            title={isRecording ? 'Stop recording' : 'Click to record voice input'}
                        >
                            <MicIcon />
                        </button>

                        {/* Submit button */}
                        <button
                            onClick={handleSubmit}
                            disabled={loading || !userPrompt.trim()}
                            className="generate-btn"
                            style={{
                                flex: 1, padding: '13px 20px',
                                opacity: (loading || !userPrompt.trim()) ? 0.45 : 1,
                                cursor: (loading || !userPrompt.trim()) ? 'not-allowed' : 'none',
                                animation: loading ? 'btnPulse 1.5s ease-in-out infinite' : 'none',
                            }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15 }}>
                                {loading ? 'Processing...' : 'Generate Context'}
                                {!loading
                                    ? <Play style={{ width: 16, height: 16, fill: 'var(--accent-cyan)', stroke: 'none' }} />
                                    : <Activity style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                                }
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
