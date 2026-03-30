import React from 'react';
import type { VariableBounds } from '../types/apex.types';

interface Props {
  endogenousLabels: string[];
  systemState: Record<string, number>;
  displayState: Record<string, number>;
  variableBounds: Record<string, VariableBounds>;
  targetState?: Record<string, number> | null;
  targetShifted?: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function SystemDisplay({
  endogenousLabels,
  systemState,
  displayState,
  variableBounds,
  targetState,
  targetShifted,
}: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>OUTPUTS</span>
        {targetShifted && (
          <span style={styles.shiftAlert}>⚡ Target shifted</span>
        )}
      </div>
      <div style={styles.gaugesGrid}>
        {endogenousLabels.map((label, i) => {
          const color = COLORS[i % COLORS.length];
          const rawValue = systemState[label] ?? 0;
          const pct = displayState[label] ?? 50;
          const bounds = variableBounds[label] ?? { min: -50, max: 50 };
          const target = targetState?.[label];
          const targetPct = target !== undefined
            ? ((target - bounds.min) / (bounds.max - bounds.min)) * 100
            : null;
          const deviation = target !== undefined ? rawValue - target : null;

          // Color coding for gauge
          let gaugeColor = color;
          if (pct < 10 || pct > 90) gaugeColor = '#ef4444';
          else if (pct < 20 || pct > 80) gaugeColor = '#f59e0b';

          return (
            <div key={label} style={styles.gaugeCard}>
              <div style={styles.gaugeHeader}>
                <span style={{ ...styles.gaugeLabel, color }}>{label}</span>
                <span style={styles.gaugeValue}>{rawValue.toFixed(2)}</span>
              </div>

              {/* Vertical gauge bar */}
              <div style={styles.gaugeBarContainer}>
                <div style={styles.gaugeTrack}>
                  {/* Fill */}
                  <div style={{
                    ...styles.gaugeFill,
                    height: `${Math.max(0, Math.min(100, pct))}%`,
                    background: gaugeColor,
                  }} />
                  {/* Target marker */}
                  {targetPct !== null && (
                    <div style={{
                      ...styles.targetMarker,
                      bottom: `${Math.max(0, Math.min(100, targetPct))}%`,
                    }} />
                  )}
                </div>
              </div>

              {/* Bounds labels */}
              <div style={styles.boundsLabels}>
                <span style={styles.boundVal}>{bounds.max}</span>
                <span style={styles.boundVal}>{bounds.min}</span>
              </div>

              {/* Deviation readout */}
              {deviation !== null && (
                <div style={{
                  ...styles.deviation,
                  color: Math.abs(deviation) < 2.5 ? '#4ade80' : '#9ca3af',
                }}>
                  {deviation >= 0 ? '+' : ''}{deviation.toFixed(1)} from target
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 8,
    padding: 16,
    flex: 1,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
  },
  shiftAlert: {
    fontSize: 11,
    fontWeight: 700,
    color: '#f59e0b',
    background: '#2d2000',
    padding: '3px 8px',
    borderRadius: 4,
    animation: 'pulse 1s infinite',
  },
  gaugesGrid: {
    display: 'flex',
    gap: 16,
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
  },
  gaugeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    minWidth: 70,
  },
  gaugeHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  gaugeLabel: {
    fontSize: 16,
    fontWeight: 700,
    fontFamily: 'monospace',
  },
  gaugeValue: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
  },
  gaugeBarContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  gaugeTrack: {
    width: 32,
    height: 140,
    background: '#1f2937',
    borderRadius: 4,
    position: 'relative',
    overflow: 'visible',
    display: 'flex',
    alignItems: 'flex-end',
  },
  gaugeFill: {
    width: '100%',
    borderRadius: 4,
    transition: 'height 0.3s ease',
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
  targetMarker: {
    position: 'absolute',
    left: -6,
    right: -6,
    height: 2,
    background: '#ffffff',
    zIndex: 2,
    borderRadius: 1,
  },
  boundsLabels: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  boundVal: {
    fontSize: 10,
    color: '#4b5563',
    fontFamily: 'monospace',
  },
  deviation: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
};
