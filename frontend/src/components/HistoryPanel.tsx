import React, { useRef, useEffect } from 'react';
import type { HistoryEntry } from '../types/apex.types';

interface Props {
  history: HistoryEntry[];
  endogenousLabels: string[];
  variableBounds: Record<string, { min: number; max: number }>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const MAX_HISTORY = 20;
const CHART_H = 100;
const CHART_W = 200;

export function HistoryPanel({ history, endogenousLabels, variableBounds }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.length]);

  const recent = history.slice(-MAX_HISTORY);

  // Build sparklines per variable
  const sparklines = endogenousLabels.map((label, idx) => {
    const color = COLORS[idx % COLORS.length];
    const bounds = variableBounds[label] ?? { min: -50, max: 50 };
    const span = bounds.max - bounds.min || 1;

    const points = recent.map((entry, i) => {
      const val = entry.state[label] ?? 0;
      const x = (i / (MAX_HISTORY - 1)) * CHART_W;
      const y = CHART_H - ((val - bounds.min) / span) * CHART_H;
      return { x, y, val };
    });

    const pathD = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${Math.max(0, Math.min(CHART_H, p.y)).toFixed(1)}`)
      .join(' ');

    const lastVal = recent.length > 0 ? (recent[recent.length - 1].state[label] ?? 0) : 0;

    return { label, color, pathD, points, lastVal };
  });

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>HISTORY</span>
        <span style={styles.stepCount}>{recent.length} steps</span>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        {endogenousLabels.map((label, i) => (
          <div key={label} style={styles.legendItem}>
            <div style={{ ...styles.legendDot, background: COLORS[i % COLORS.length] }} />
            <span style={{ ...styles.legendLabel, color: COLORS[i % COLORS.length] }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Sparkline chart */}
      <div style={styles.chartContainer}>
        {recent.length < 2 ? (
          <div style={styles.emptyMsg}>Submit an intervention to see history</div>
        ) : (
          <svg
            width="100%"
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            style={styles.svg}
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(f => (
              <line
                key={f}
                x1={0} y1={f * CHART_H}
                x2={CHART_W} y2={f * CHART_H}
                stroke="#1f2937"
                strokeWidth={1}
              />
            ))}

            {/* Variable lines */}
            {sparklines.map(({ label, color, pathD }) => (
              <path
                key={label}
                d={pathD}
                stroke={color}
                strokeWidth={1.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* Last point dots */}
            {sparklines.map(({ label, color, points }) => {
              if (points.length === 0) return null;
              const last = points[points.length - 1];
              return (
                <circle
                  key={label}
                  cx={last.x}
                  cy={Math.max(0, Math.min(CHART_H, last.y))}
                  r={3}
                  fill={color}
                />
              );
            })}
          </svg>
        )}
      </div>

      {/* Current values table */}
      <div ref={scrollRef} style={styles.table}>
        {sparklines.map(({ label, color, lastVal }) => (
          <div key={label} style={styles.tableRow}>
            <span style={{ ...styles.tableLabel, color }}>{label}</span>
            <span style={styles.tableVal}>{lastVal.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minWidth: 240,
    maxWidth: 300,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
  },
  stepCount: {
    fontSize: 11,
    color: '#4b5563',
    fontVariantNumeric: 'tabular-nums',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px 12px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  legendLabel: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  chartContainer: {
    background: '#0d1117',
    borderRadius: 6,
    border: '1px solid #1f2937',
    overflow: 'hidden',
    height: 110,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  emptyMsg: {
    fontSize: 11,
    color: '#4b5563',
    textAlign: 'center',
    padding: '0 16px',
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  tableRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 0',
    borderBottom: '1px solid #1f2937',
  },
  tableLabel: {
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  tableVal: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#9ca3af',
    fontVariantNumeric: 'tabular-nums',
  },
};
