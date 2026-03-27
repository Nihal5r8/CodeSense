// PerformanceMetricsCard.jsx
// Dedicated card for showing Time & Space complexity below the Analysis panel.

import { Zap } from 'lucide-react';
import { ResultCard } from '../ui/ResultCard';

// Parse complexity from raw string like:
//   "Time: O(n^2) - explanation\nSpace: O(1) - explanation"
function parseComplexity(raw) {
  const time = raw?.match(/Time[^:]*:\s*([^\n]+)/i)?.[1]?.trim() || '';
  const space = raw?.match(/Space[^:]*:\s*([^\n]+)/i)?.[1]?.trim() || '';
  return { time, space };
}

// Strip bold markdown from a string
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

export function PerformanceMetricsCard({ result }) {
  if (!result) return null;

  // Prefer pre-split fields; fall back to parsing the raw complexity string
  let timeVal = result.time_complexity || '';
  let spaceVal = result.space_complexity || '';

  if ((!timeVal || !spaceVal) && result.complexity) {
    const parsed = parseComplexity(result.complexity);
    timeVal = timeVal || parsed.time;
    spaceVal = spaceVal || parsed.space;
  }

  if (!timeVal && !spaceVal) return null;

  return (
    <ResultCard title="Performance Metrics" icon={Zap}>
      <div className="flex flex-col gap-4" style={{ padding: '4px 4px 4px 4px' }}>
        {timeVal && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-mono font-bold text-neon-cyan/70 uppercase tracking-widest"
                  style={{ paddingLeft: '4px' }}>
              Time Complexity
            </span>
            <span className="font-mono text-sm text-neon-purple bg-neon-purple/10 border border-neon-purple/20 rounded-lg leading-relaxed break-words"
                  style={{ padding: '10px 16px', paddingLeft: '20px' }}>
              {stripMarkdown(timeVal)}
            </span>
          </div>
        )}
        {spaceVal && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-mono font-bold text-neon-cyan/70 uppercase tracking-widest"
                  style={{ paddingLeft: '4px' }}>
              Space Complexity
            </span>
            <span className="font-mono text-sm text-neon-purple bg-neon-purple/10 border border-neon-purple/20 rounded-lg leading-relaxed break-words"
                  style={{ padding: '10px 16px', paddingLeft: '20px' }}>
              {stripMarkdown(spaceVal)}
            </span>
          </div>
        )}
      </div>
    </ResultCard>
  );
}
