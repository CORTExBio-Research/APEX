import React, { useEffect } from 'react';
import type { SystemConfig } from '../types/apex.types';
import { useTrialState } from '../hooks/useTrialState';
import { useCountdown } from '../hooks/useCountdown';
import { InterventionPanel } from './InterventionPanel';
import { SystemDisplay } from './SystemDisplay';
import { HistoryPanel } from './HistoryPanel';

interface Props {
  trialId: string;
  systemConfig: SystemConfig;
  timeLimitSeconds: number;
  trialNumber: number;
  totalTrials: number;
  onPhaseEnd: () => void;
}

export function ExplorationPhase({
  trialId,
  systemConfig,
  timeLimitSeconds,
  trialNumber,
  totalTrials,
  onPhaseEnd,
}: Props) {
  const trial = useTrialState(systemConfig, trialId);
  const countdown = useCountdown(timeLimitSeconds, onPhaseEnd);

  useEffect(() => {
    trial.setPhase('exploration');
    countdown.start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const timerFraction = countdown.fraction;
  const timerColor = timerFraction > 0.5 ? '#4ade80' : timerFraction > 0.25 ? '#f59e0b' : '#ef4444';

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <span style={styles.phaseLabel}>EXPLORATION</span>
          <span style={styles.trialBadge}>Trial {trialNumber} / {totalTrials}</span>
          <span style={styles.levelBadge}>Level {systemConfig.difficulty_level}</span>
        </div>
        <div style={styles.topRight}>
          <div style={{ ...styles.timerValue, color: timerColor }}>{countdown.formatted}</div>
          <div style={styles.timerBar}>
            <div style={{
              ...styles.timerFill,
              width: `${timerFraction * 100}%`,
              background: timerColor,
            }} />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.content}>
        <InterventionPanel
          exogenousLabels={systemConfig.exogenous_labels}
          exogenousInputs={trial.exogenousInputs}
          variableBounds={systemConfig.variable_bounds}
          onUpdate={trial.updateExogenous}
          onSubmit={trial.submitIntervention}
          isSubmitting={trial.isSubmitting}
          lastVotat={trial.lastVotat}
          stepCount={trial.stepCount}
        />

        <SystemDisplay
          endogenousLabels={systemConfig.endogenous_labels}
          systemState={trial.systemState}
          displayState={trial.displayState}
          variableBounds={systemConfig.variable_bounds}
          targetState={null}
        />

        <HistoryPanel
          history={trial.history}
          endogenousLabels={systemConfig.endogenous_labels}
          variableBounds={systemConfig.variable_bounds}
        />
      </div>

      {/* Manual end button */}
      <div style={styles.bottomBar}>
        <button onClick={onPhaseEnd} style={styles.endBtn}>
          End Exploration &amp; Proceed to Report →
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#030712',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, sans-serif',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    borderBottom: '1px solid #1f2937',
    background: '#111827',
  },
  topLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  phaseLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.15em',
    color: '#3b82f6',
    textTransform: 'uppercase',
  },
  trialBadge: {
    fontSize: 12,
    color: '#6b7280',
    fontVariantNumeric: 'tabular-nums',
  },
  levelBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: '#4b5563',
    background: '#1f2937',
    padding: '2px 8px',
    borderRadius: 4,
  },
  topRight: {
    position: 'fixed',
    top: 14,
    left: 0,
    right: 0,
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  timerValue: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
  },
  timerBar: {
    width: 120,
    height: 4,
    background: '#1f2937',
    borderRadius: 2,
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 1s linear, background 0.3s',
  },
  content: {
    flex: 1,
    display: 'flex',
    gap: 16,
    padding: 16,
    alignItems: 'flex-start',
  },
  bottomBar: {
    position: 'fixed',
    bottom: 20,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 100,
  },
  endBtn: {
    pointerEvents: 'auto',
    padding: '9px 20px',
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid #374151',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
};
