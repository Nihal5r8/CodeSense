import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Layers, BrainCircuit, Activity, FileCheck, Info, RotateCcw } from 'lucide-react';
import { generateCode, clearSession } from './services/api';

// Components
import { Header } from './components/layout/Header';
import { PromptPanel } from './components/layout/PromptPanel';
import { ResultCard } from './components/ui/ResultCard';
import { StatusPanel } from './components/ui/StatusPanel';
import { CodeBlock } from './components/analysis/CodeBlock';
import ReactFlowDiagram from './components/diagram/ReactFlowDiagram';
import { MarkdownPanel } from './components/analysis/MarkdownPanel';
import { MetadataCard } from './components/analysis/MetadataCard';
import { DiffPanel } from './components/ui/DiffPanel';
import { PerformanceMetricsCard } from './components/analysis/PerformanceMetricsCard';
import { ChatResponsePanel } from './components/analysis/ChatResponsePanel';
import CustomCursor from './components/CustomCursor';
import Tutorial from './components/Tutorial';

const SESSION_KEY = 'codesense_session_id';

const DEFAULT_OPTIONS = {
  show_metadata: true,
  show_code: true,
  show_visualization: true,
  show_annotated: true,
  show_complexity: true,
  show_tests: true,
};

// ── Strip raw markdown artifacts from plain-text sections ──────────────────────
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/```\s*$/gm, '')
    .trim();
}

// ── SSE pipeline step keys in order ───────────────────────────────────────────
const PIPELINE_KEYS = ['detecting', 'model_loading', 'model_ready', 'generating', 'parsing', 'rendering'];

function makePendingSteps() {
  return PIPELINE_KEYS.map(step => ({ step, message: '', progress: 0, state: 'pending' }));
}

function App() {
  const [userPrompt, setUserPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [requestId, setRequestId] = useState(null);
  const [statusSteps, setStatusSteps] = useState(makePendingSteps());
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [sessionId, setSessionId] = useState(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const newId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, newId);
    return newId;
  });

  const resultsRef = useRef(null);
  const sseRef = useRef(null);

  const closeSse = () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!userPrompt.trim()) return;

    closeSse();
    setLoading(true);
    setError(null);
    setResult(null);
    console.log('[SESSION]', sessionId);

    const newRequestId = crypto.randomUUID();
    setRequestId(newRequestId);
    setStatusSteps(makePendingSteps());

    await new Promise((resolve) => {
      const evtSource = new EventSource(`http://localhost:8000/api/status/${newRequestId}`);
      sseRef.current = evtSource;

      const safetyTimer = setTimeout(resolve, 3000);

      evtSource.onopen = () => {
        clearTimeout(safetyTimer);
        resolve();
      };

      evtSource.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);

          setStatusSteps(prev =>
            prev.map(s => {
              if (s.step === payload.step) {
                return { ...s, message: payload.message, progress: payload.progress, state: 'active' };
              }
              if (s.state === 'active') return { ...s, state: 'done' };
              return s;
            })
          );

          if (payload.step === 'done' || payload.step === 'error') {
            setStatusSteps(prev =>
              prev.map(s =>
                s.state === 'active'
                  ? { ...s, state: payload.step === 'error' ? 'error' : 'done' }
                  : s
              )
            );
            closeSse();
          }
        } catch { /* ignore parse errors */ }
      };

      evtSource.onerror = () => {
        clearTimeout(safetyTimer);
        resolve();
        closeSse();
      };
    });

    try {
      const data = await generateCode(userPrompt, options, newRequestId, sessionId);
      setResult(data);
    } catch (err) {
      setError('Failed to reach backend. Ensure http://localhost:8000/api/generate is running.');
    } finally {
      closeSse();
      setLoading(false);
    }
  };

  useEffect(() => {
    if (result && !loading && resultsRef.current) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [result, loading]);

  useEffect(() => () => closeSse(), []);

  const handleNewSession = async () => {
    await clearSession(sessionId);
    const newId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, newId);
    setSessionId(newId);
    setResult(null);
    setError(null);
    setRequestId(null);
    setStatusSteps(makePendingSteps());
    setUserPrompt('');
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } }
  };

  const displayMetadata = result ? (result.metadata || {
    LANGUAGE: result.language || 'python',
    MODE: result.mode,
    ALGORITHM: result.mode === 'fix' ? 'Bug Fix' : 'Visualization',
  }) : null;

  const language = result ? (
    result.metadata?.LANGUAGE ||
    result.metadata?.language ||
    result.language ||
    'python'
  ).toLowerCase() : 'python';

  const renderResults = () => {
    if (!result) return null;

    // ── CHAT MODE ─────────────────────────────────────────────────────────────
    if (result.mode === 'chat') {
      return (
        <motion.div variants={itemVariants} className="result-panel">
          <ChatResponsePanel result={result} />
        </motion.div>
      );
    }

    // ── GENERATE MODE ─────────────────────────────────────────────────────────
    if (result.mode === 'generate') {
      const hasCode = !!result.code;
      const hasViz = !!result.visualization;
      const stepByStep = result.explanation || result.annotated || '';
      const hasAnalysis = !!stepByStep;
      const hasMetrics = !!(result.time_complexity || result.space_complexity);
      const hasTests = !!result.test_cases;

      return (
        <>
          {(hasCode || hasViz) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              {hasCode && (
                <motion.div variants={itemVariants} className="result-panel">
                  <ResultCard title="Implementation" icon={Activity} accentColor="#00d4ff">
                    <CodeBlock code={result.code} language={language} />
                  </ResultCard>
                </motion.div>
              )}
              {hasViz && (
                <motion.div variants={itemVariants} className="result-panel react-flow-panel">
                  <ResultCard title="System Architecture" icon={BrainCircuit} accentColor="#a855f7">
                    <ReactFlowDiagram
                      visualization={result.visualization}
                      title={result.metadata?.ALGORITHM || ''}
                      language={language}
                    />
                  </ResultCard>
                </motion.div>
              )}
            </div>
          )}

          {hasAnalysis && (
            <motion.div variants={itemVariants} className="result-panel">
              <ResultCard title="Step-by-Step Explanation" icon={Info} accentColor="#06b6d4">
                <MarkdownPanel content={stripMarkdown(stepByStep)} />
              </ResultCard>
            </motion.div>
          )}

          {hasMetrics && (
            <motion.div variants={itemVariants} className="result-panel">
              <PerformanceMetricsCard result={result} />
            </motion.div>
          )}

          {hasTests && (
            <motion.div variants={itemVariants} className="result-panel">
              <ResultCard title="Verification & Test Cases" icon={FileCheck} defaultOpen={false} accentColor="#00ff87">
                <MarkdownPanel content={stripMarkdown(result.test_cases)} />
              </ResultCard>
            </motion.div>
          )}
        </>
      );
    }

    // ── DEBUG MODE ────────────────────────────────────────────────────────────
    if (result.mode === 'debug') {
      const hasDiff = result.diff && result.diff.length > 0;
      const hasFixedCode = !!result.fixed_code;
      const hasViz = !!result.visualization;
      const stepByStep = result.explanation || result.annotated || '';
      const hasAnalysis = !!stepByStep;
      const hasMetrics = !!(result.time_complexity || result.space_complexity);
      const hasTests = !!result.test_cases;

      return (
        <>
          {hasDiff && (
            <motion.div variants={itemVariants} className="result-panel">
              <DiffPanel
                diff={result.diff}
                originalCode={result.original_code}
                fixedCode={result.fixed_code}
              />
            </motion.div>
          )}

          {(hasFixedCode || hasViz) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              {hasFixedCode && (
                <motion.div variants={itemVariants} className="result-panel">
                  <ResultCard title="Fixed Implementation" icon={Activity} accentColor="#00d4ff">
                    <CodeBlock code={result.fixed_code} language={language} />
                  </ResultCard>
                </motion.div>
              )}
              {hasViz && (
                <motion.div variants={itemVariants} className="result-panel react-flow-panel">
                  <ResultCard title="System Architecture" icon={BrainCircuit} accentColor="#a855f7">
                    <ReactFlowDiagram
                      visualization={result.visualization}
                      title={result.metadata?.ALGORITHM || ''}
                      language={language}
                    />
                  </ResultCard>
                </motion.div>
              )}
            </div>
          )}

          {hasAnalysis && (
            <motion.div variants={itemVariants} className="result-panel">
              <ResultCard title="Debug Analysis" icon={Info} accentColor="#06b6d4">
                <MarkdownPanel content={stripMarkdown(stepByStep)} />
              </ResultCard>
            </motion.div>
          )}

          {hasMetrics && (
            <motion.div variants={itemVariants} className="result-panel">
              <PerformanceMetricsCard result={result} />
            </motion.div>
          )}

          {hasTests && (
            <motion.div variants={itemVariants} className="result-panel">
              <ResultCard title="Verification & Test Cases" icon={FileCheck} defaultOpen={false} accentColor="#00ff87">
                <MarkdownPanel content={stripMarkdown(result.test_cases)} />
              </ResultCard>
            </motion.div>
          )}
        </>
      );
    }

    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      {/* Custom cursor — always first */}
      <CustomCursor />

      {/* Tutorial overlay */}
      <Tutorial />

      {/* Help / re-trigger tutorial button */}
      <HelpButton />

      <Header />

      <main style={{
        flex: 1, width: '100%', maxWidth: 1600, margin: '0 auto',
        padding: '16px 24px 40px',
        display: 'flex', flexDirection: 'row', gap: 32,
        flexWrap: 'wrap',
      }}>
        {/* LEFT PANEL */}
        <div style={{
          width: '100%', maxWidth: 340,
          display: 'flex', flexDirection: 'column', gap: 16,
          position: 'sticky', top: 20, alignSelf: 'flex-start',
          flex: '0 0 auto',
        }}
          className="system-prompt-panel"
        >
          <PromptPanel
            userPrompt={userPrompt}
            setUserPrompt={setUserPrompt}
            handleSubmit={handleSubmit}
            loading={loading}
            options={options}
            setOptions={setOptions}
            detectedMode={result?.mode || 'generate'}
          />

          {/* Context-active badge — Fix 3e */}
          <AnimatePresence>
            {result?.context_used && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="session-context-badge"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '6px 14px',
                  background: '#00ff8710',
                  border: '1px solid #00ff8733',
                  borderRadius: 20,
                  fontSize: 11, fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#00ff87',
                  letterSpacing: '0.3px',
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#00ff87',
                  boxShadow: '0 0 6px #00ff87',
                  display: 'inline-block', flexShrink: 0,
                  animation: 'statusPulse 2s infinite',
                }} />
                Using conversation context
              </motion.div>
            )}
          </AnimatePresence>

          {/* New Session button */}
          <AnimatePresence>
            {result && (
              <motion.button
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                onClick={handleNewSession}
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderRadius: 12,
                  border: '1px solid var(--border-bright)',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 500, cursor: 'none',
                  transition: 'all .2s',
                  opacity: loading ? 0.4 : 1,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                  e.currentTarget.style.borderColor = 'var(--border-bright)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                  e.currentTarget.style.borderColor = 'var(--border-bright)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
              >
                <RotateCcw style={{ width: 14, height: 14 }} />
                New Session
              </motion.button>
            )}
          </AnimatePresence>

          {/* Metadata card */}
          <AnimatePresence>
            {result?.metadata && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <ResultCard title="Execution Metadata" icon={Layers} accentColor="#ff6d00">
                  <MetadataCard
                    metadata={displayMetadata}
                    mode={result.mode}
                    processTime={result.process_time_sec}
                  />
                </ResultCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  padding: 14,
                  background: 'rgba(255,77,109,0.08)',
                  border: '1px solid rgba(255,77,109,0.2)',
                  borderRadius: 12,
                  color: '#ff4d6d',
                  fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <RefreshCw style={{ width: 18, height: 18, flexShrink: 0 }} />
                <p>{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status panel */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                style={{ width: '100%' }}
              >
                <StatusPanel statusSteps={statusSteps} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT PANEL — results */}
        <div style={{ flex: 1, minWidth: 0 }} ref={resultsRef}>
          <AnimatePresence>
            {result && !loading && (
              <motion.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.08 } } }}
                style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}
              >
                {renderResults()}
              </motion.div>
            )}
          </AnimatePresence>

          {!result && !loading && !error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                height: '100%', minHeight: 500,
                border: '2px dashed rgba(255,255,255,0.05)',
                borderRadius: 20,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                textAlign: 'center', padding: 32, opacity: 0.5,
              }}
            >
              <BrainCircuit style={{ width: 56, height: 56, color: '#334155', marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.05em', color: '#475569', marginBottom: 8 }}>
                Awaiting Input
              </h3>
              <p style={{ color: '#334155', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, maxWidth: 360 }}>
                Provide a system prompt on the left to begin generating architectural diagrams,
                code implementations, and structural analysis.
              </p>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Help button (bottom-right corner) ──────────────────────────────────────────
function HelpButton() {
  return (
    <button
      onClick={() => {
        localStorage.removeItem('tutorial_seen')
        window.location.reload()
      }}
      title="Re-open tutorial"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 100,
        width: 44, height: 44, borderRadius: '50%',
        background: 'var(--bg-panel)', border: '1px solid var(--border-bright)',
        color: 'var(--text-secondary)', fontSize: 18, cursor: 'none',
        transition: 'all .2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent-cyan)'
        e.currentTarget.style.color = 'var(--accent-cyan)'
        e.currentTarget.style.boxShadow = 'var(--glow-cyan)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border-bright)'
        e.currentTarget.style.color = 'var(--text-secondary)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      ?
    </button>
  );
}

export default App;