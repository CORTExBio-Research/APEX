import React, { useState, CSSProperties } from 'react';
import type { ConnectionType, InferredStructure } from '../types/apex.types';
import { useCountdown } from '../hooks/useCountdown';

interface Props {
  trialId: string;
  exogenousLabels: string[];
  endogenousLabels: string[];
  timeLimitSeconds: number;
  onSubmit: (structure: InferredStructure, confidence: number, strategyText: string) => void;
}

const CONNECTION_OPTIONS: { value: ConnectionType; label: string; color: string }[] = [
  { value: 'positive', label: '＋ Positive', color: '#4ade80' },
  { value: 'negative', label: '－ Negative', color: '#f87171' },
  { value: 'none', label: '○ No link', color: '#4b5563' },
];

export function MetacognitiveReport({
  exogenousLabels,
  endogenousLabels,
  timeLimitSeconds,
  onSubmit,
}: Props) {
  const allPossible: string[] = [];
  for (const x of exogenousLabels) {
    for (const y of endogenousLabels) {
      allPossible.push(`${x}->${y}`);
    }
  }

  const [structure, setStructure] = useState<InferredStructure>(() =>
    Object.fromEntries(allPossible.map(k => [k, 'none' as ConnectionType]))
  );
  const [confidence, setConfidence] = useState(50);
  const [strategyText, setStrategyText] = useState('');

  const countdown = useCountdown(timeLimitSeconds, () =>
    onSubmit(structure, confidence, strategyText)
  );

  // Start countdown on mount
  React.useEffect(() => { countdown.start(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = () => {
    countdown.stop();
    onSubmit(structure, confidence, strategyText);
  };

  const timerFraction = countdown.fraction;
  const timerColor = timerFraction > 0.5 ? '#4ade80' : timerFraction > 0.25 ? '#f59e0b' : '#ef4444';

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Metacognitive Report</h2>
            <p style={styles.subtitle}>Reflect on the system you just explored.</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...styles.timer, color: timerColor }}>{countdown.formatted}</div>
            <div style={styles.timerLabel}>remaining</div>
          </div>
        </div>

        {/* Section A: Causal Structure */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>A. Causal Structure</h3>
          <p style={styles.sectionDesc}>
            For each possible connection, select whether it exists and its direction.
          </p>
          <div style={styles.matrixContainer}>
            {/* Column headers (endogenous) */}
            <div style={matrixGrid(exogenousLabels.length, endogenousLabels.length)}>
              <div /> {/* empty corner */}
              {endogenousLabels.map(y => (
                <div key={y} style={styles.colHeader}>{y}</div>
              ))}

              {exogenousLabels.map(x => (
                <React.Fragment key={x}>
                  <div style={styles.rowHeader}>{x}</div>
                  {endogenousLabels.map(y => {
                    const key = `${x}->${y}`;
                    const current = structure[key] ?? 'none';
                    return (
                      <div key={y} style={styles.cellGroup}>
                        {CONNECTION_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setStructure(prev => ({ ...prev, [key]: opt.value }))}
                            style={{
                              ...styles.optionBtn,
                              background: current === opt.value ? '#1f2937' : 'transparent',
                              color: current === opt.value ? opt.color : '#4b5563',
                              borderColor: current === opt.value ? opt.color : '#1f2937',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* Section B: Confidence */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>B. Confidence Rating</h3>
          <p style={styles.sectionDesc}>
            How confident are you in your understanding of this system?
          </p>
          <div style={styles.confidenceRow}>
            <span style={styles.confidenceLabel}>Not at all confident</span>
            <div style={styles.sliderWrapper}>
              <input
                type="range"
                min={0}
                max={100}
                value={confidence}
                onChange={e => setConfidence(Number(e.target.value))}
                style={styles.slider}
              />
              <div style={styles.confidenceValue}>{confidence}</div>
            </div>
            <span style={styles.confidenceLabel}>Completely confident</span>
          </div>
        </section>

        {/* Section C: Strategy */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>C. Strategy Report <span style={styles.optional}>(optional)</span></h3>
          <p style={styles.sectionDesc}>Briefly describe the strategy you used to explore the system.</p>
          <textarea
            value={strategyText}
            onChange={e => setStrategyText(e.target.value.slice(0, 500))}
            maxLength={500}
            placeholder="Describe your exploration strategy..."
            style={styles.textarea}
          />
          <div style={styles.charCount}>{strategyText.length}/500</div>
        </section>

        <button onClick={handleSubmit} style={styles.submitBtn}>
          Submit &amp; Begin Control Phase
        </button>
      </div>
    </div>
  );
}

function matrixGrid(nExo: number, nEndo: number): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `80px ${'1fr '.repeat(nEndo)}`,
    gridTemplateRows: `auto ${'auto '.repeat(nExo)}`,
    gap: 8,
    alignItems: 'center',
  };
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    overflowY: 'auto' as const,
    padding: '40px 20px',
    zIndex: 100,
  },
  container: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: 32,
    maxWidth: 800,
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 28,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#f9fafb',
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    margin: '6px 0 0',
  },
  timer: {
    fontSize: 28,
    fontWeight: 700,
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
  },
  timerLabel: {
    fontSize: 11,
    color: '#4b5563',
    textAlign: 'right' as const,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#e5e7eb',
    margin: 0,
  },
  sectionDesc: {
    fontSize: 13,
    color: '#6b7280',
    margin: 0,
  },
  optional: {
    fontSize: 12,
    fontWeight: 400,
    color: '#4b5563',
  },
  matrixContainer: {
    overflowX: 'auto' as const,
  },
  colHeader: {
    textAlign: 'center' as const,
    fontSize: 16,
    fontWeight: 700,
    color: '#9ca3af',
    fontFamily: 'monospace',
    padding: '4px 0',
  },
  rowHeader: {
    fontSize: 16,
    fontWeight: 700,
    color: '#9ca3af',
    fontFamily: 'monospace',
    padding: '4px 0',
  },
  cellGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    padding: '8px',
    background: '#0d1117',
    borderRadius: 6,
    border: '1px solid #1f2937',
  },
  optionBtn: {
    padding: '4px 8px',
    border: '1px solid',
    borderRadius: 4,
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontWeight: 500,
    transition: 'all 0.1s',
    textAlign: 'left' as const,
  },
  confidenceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  confidenceLabel: {
    fontSize: 12,
    color: '#6b7280',
    whiteSpace: 'nowrap' as const,
    minWidth: 120,
  },
  sliderWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
  },
  slider: {
    width: '100%',
    accentColor: '#3b82f6',
  },
  confidenceValue: {
    fontSize: 20,
    fontWeight: 700,
    color: '#3b82f6',
    fontFamily: 'monospace',
  },
  textarea: {
    background: '#0d1117',
    border: '1px solid #1f2937',
    borderRadius: 6,
    color: '#e5e7eb',
    fontSize: 13,
    padding: '10px 12px',
    resize: 'vertical' as const,
    minHeight: 80,
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
  },
  charCount: {
    fontSize: 11,
    color: '#4b5563',
    textAlign: 'right' as const,
  },
  submitBtn: {
    padding: '13px 0',
    background: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
};
