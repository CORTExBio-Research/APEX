import React from 'react';
import type { VariableBounds } from '../types/apex.types';

interface Props {
  exogenousLabels: string[];
  exogenousInputs: Record<string, number>;
  variableBounds: Record<string, VariableBounds>;
  onUpdate: (label: string, value: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  lastVotat: boolean | null;
  stepCount: number;
}

export function InterventionPanel({
  exogenousLabels,
  exogenousInputs,
  variableBounds,
  onUpdate,
  onSubmit,
  isSubmitting,
  lastVotat,
  stepCount,
}: Props) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>INPUTS</span>
        <span style={styles.stepBadge}>Step {stepCount}</span>
      </div>

      {exogenousLabels.map(label => {
        const bounds = variableBounds[label] ?? { min: -5, max: 5 };
        const value = exogenousInputs[label] ?? 0;
        const pct = ((value - bounds.min) / (bounds.max - bounds.min)) * 100;

        return (
          <div key={label} style={styles.sliderGroup}>
            <div style={styles.sliderHeader}>
              <span style={styles.varLabel}>{label}</span>
              <span style={styles.varValue}>{value.toFixed(2)}</span>
            </div>
            <div style={styles.sliderTrack}>
              <div style={{ ...styles.sliderFill, width: `${pct}%` }} />
            </div>
            <input
              type="range"
              min={bounds.min}
              max={bounds.max}
              step={0.1}
              value={value}
              onChange={e => onUpdate(label, parseFloat(e.target.value))}
              style={styles.rangeInput}
            />
            <div style={styles.boundsRow}>
              <span style={styles.boundLabel}>{bounds.min}</span>
              <span style={styles.boundLabel}>{bounds.max}</span>
            </div>
          </div>
        );
      })}

      <button
        onClick={onSubmit}
        disabled={isSubmitting}
        style={{ ...styles.submitBtn, opacity: isSubmitting ? 0.5 : 1 }}
      >
        {isSubmitting ? 'Computing...' : 'Submit Intervention'}
      </button>

      {lastVotat !== null && (
        <div style={{ ...styles.votatBadge, background: lastVotat ? '#1a3a2a' : '#3a1a1a' }}>
          <span style={{ color: lastVotat ? '#4ade80' : '#f87171', fontSize: 11, fontWeight: 600 }}>
            {lastVotat ? '✓ VOTAT' : '✗ Multi-change'}
          </span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 8,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minWidth: 220,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
  },
  stepBadge: {
    fontSize: 11,
    color: '#4b5563',
    fontVariantNumeric: 'tabular-nums',
  },
  sliderGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sliderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  varLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#e5e7eb',
    fontFamily: 'monospace',
  },
  varValue: {
    fontSize: 13,
    color: '#9ca3af',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'monospace',
  },
  sliderTrack: {
    height: 4,
    background: '#1f2937',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    background: '#3b82f6',
    borderRadius: 2,
    transition: 'width 0.1s',
  },
  rangeInput: {
    width: '100%',
    accentColor: '#3b82f6',
    cursor: 'pointer',
    margin: 0,
  },
  boundsRow: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  boundLabel: {
    fontSize: 10,
    color: '#4b5563',
    fontFamily: 'monospace',
  },
  submitBtn: {
    marginTop: 8,
    padding: '10px 0',
    background: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
    fontFamily: 'Inter, sans-serif',
  },
  votatBadge: {
    padding: '6px 10px',
    borderRadius: 4,
    textAlign: 'center',
  },
};
