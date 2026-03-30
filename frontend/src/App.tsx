import React, { useState, useCallback } from 'react';
import type {
  AppPhase,
  SystemConfig,
  PhaseTimings,
  TrialScores,
  AbilityEstimate,
  InferredStructure,
} from './types/apex.types';
import { createSession, startTrial, submitMetacog, completeTrial, endSession } from './api/apexApi';
import { InstructionScreen } from './components/InstructionScreen';
import { ExplorationPhase } from './components/ExplorationPhase';
import { ControlPhase } from './components/ControlPhase';
import { MetacognitiveReport } from './components/MetacognitiveReport';
import { ResultsScreen } from './components/ResultsScreen';

const MAX_TRIALS = 8;

function generatePatientId(): string {
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'APEX-' + dateStr + '-' + random;
}

interface TrialEntry {
  trial: number;
  level: number;
  scores: TrialScores;
  abilityEstimate: AbilityEstimate;
}

interface AppState {
  phase: AppPhase;
  sessionId: string | null;
  participantId: string | null;
  trialId: string | null;
  trialNumber: number;
  systemConfig: SystemConfig | null;
  controlSystemConfig: SystemConfig | null;
  phaseTimings: PhaseTimings;
  nextTrialLevel: number | null;
  abilityEstimate: AbilityEstimate | null;
  allTrialScores: TrialEntry[];
  sessionComplete: boolean;
  terminated: boolean;
  error: string | null;
}

const DEFAULT_TIMINGS: PhaseTimings = {
  exploration_seconds: 240,
  metacog_seconds: 180,
  control_seconds: 240,
};

export default function App() {
  // Patient ID generated once at mount — shown before session creation
  const [patientId] = useState<string>(() => generatePatientId());

  const [state, setState] = useState<AppState>({
    phase: 'welcome',
    sessionId: null,
    participantId: null,
    trialId: null,
    trialNumber: 0,
    systemConfig: null,
    controlSystemConfig: null,
    phaseTimings: DEFAULT_TIMINGS,
    nextTrialLevel: null,
    abilityEstimate: null,
    allTrialScores: [],
    sessionComplete: false,
    terminated: false,
    error: null,
  });

  const [loading, setLoading] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);

  const setError = useCallback((msg: string) => {
    setState(prev => ({ ...prev, error: msg }));
  }, []);

  // ─── Welcome → Session create ──────────────────────────────────────────────
  const handleWelcomeContinue = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await createSession(patientId);
      const timings = resp.first_trial_config.phase_timings ?? DEFAULT_TIMINGS;
      setState(prev => ({
        ...prev,
        phase: 'instructions',
        sessionId: resp.session_id,
        participantId: resp.participant_id,
        phaseTimings: timings,
      }));
    } catch (e) {
      setError(`Failed to create session: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [patientId, setError]);

  // ─── Instructions → Start Trial ───────────────────────────────────────────
  const handleStartTrial = useCallback(async () => {
    if (!state.sessionId) return;
    setLoading(true);
    try {
      const nextTrialNum = state.trialNumber + 1;
      const resp = await startTrial(state.sessionId, nextTrialNum);
      setState(prev => ({
        ...prev,
        phase: 'exploration',
        trialId: resp.trial_id,
        trialNumber: nextTrialNum,
        systemConfig: resp.system_config,
        controlSystemConfig: null,
        phaseTimings: resp.phase_timings ?? prev.phaseTimings,
        error: null,
      }));
    } catch (e) {
      setError(`Failed to start trial: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, state.trialNumber, setError]);

  // ─── Exploration → Metacognitive Report ───────────────────────────────────
  const handleExplorationEnd = useCallback(() => {
    setState(prev => ({ ...prev, phase: 'metacognitive' }));
  }, []);

  // ─── Metacognitive → Control ──────────────────────────────────────────────
  const handleMetacogSubmit = useCallback(async (
    structure: InferredStructure,
    confidence: number,
    strategyText: string
  ) => {
    if (!state.trialId) return;
    setLoading(true);
    try {
      const resp = await submitMetacog(state.trialId, structure, confidence, strategyText);
      setState(prev => ({
        ...prev,
        phase: 'control_instructions',
        controlSystemConfig: resp.control_phase_config,
        error: null,
      }));
    } catch (e) {
      setError(`Failed to submit report: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [state.trialId, setError]);

  // ─── Control → Trial Complete ─────────────────────────────────────────────
  const handleControlEnd = useCallback(async () => {
    if (!state.trialId) return;
    setLoading(true);
    try {
      const resp = await completeTrial(state.trialId);
      const newScores: TrialEntry[] = [
        ...state.allTrialScores,
        {
          trial: state.trialNumber,
          level: state.systemConfig?.difficulty_level ?? 0,
          scores: resp.trial_scores,
          abilityEstimate: resp.session_ability_estimate,
        },
      ];

      if (resp.session_complete) {
        setState(prev => ({
          ...prev,
          phase: 'session_complete',
          abilityEstimate: resp.session_ability_estimate,
          allTrialScores: newScores,
          sessionComplete: true,
          nextTrialLevel: null,
          error: null,
        }));
      } else {
        setState(prev => ({
          ...prev,
          phase: 'trial_results',
          abilityEstimate: resp.session_ability_estimate,
          allTrialScores: newScores,
          nextTrialLevel: resp.next_trial_level,
          error: null,
        }));
      }
    } catch (e) {
      setError(`Failed to complete trial: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [state.trialId, state.trialNumber, state.systemConfig, state.allTrialScores, setError]);

  // ─── Trial Results → Next Trial ───────────────────────────────────────────
  const handleNextTrial = useCallback(() => {
    setState(prev => ({
      ...prev,
      phase: 'instructions',
      systemConfig: null,
      controlSystemConfig: null,
      trialId: null,
    }));
  }, []);

  // ─── End Session ──────────────────────────────────────────────────────────
  const handleConfirmEndSession = useCallback(async () => {
    if (!state.sessionId) return;
    setLoading(true);
    try {
      await endSession(state.sessionId);
      setShowEndDialog(false);
      setState(prev => ({
        ...prev,
        phase: 'session_complete',
        sessionComplete: true,
        terminated: true,
        error: null,
      }));
    } catch (e) {
      setError(`Failed to end session: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [state.sessionId, setError]);

  // ─── New Session ──────────────────────────────────────────────────────────
  const handleNewSession = useCallback(() => {
    setState({
      phase: 'welcome',
      sessionId: null,
      participantId: null,
      trialId: null,
      trialNumber: 0,
      systemConfig: null,
      controlSystemConfig: null,
      phaseTimings: DEFAULT_TIMINGS,
      nextTrialLevel: null,
      abilityEstimate: null,
      allTrialScores: [],
      sessionComplete: false,
      terminated: false,
      error: null,
    });
  }, []);

  // ─── Error display ────────────────────────────────────────────────────────
  if (state.error) {
    const isExpired = state.error.includes('expired');
    return (
      <div style={errorStyles.container}>
        <div style={errorStyles.box}>
          <div style={errorStyles.label}>{isExpired ? 'Session Expired' : 'Error'}</div>
          <div style={errorStyles.msg}>{state.error}</div>
          {isExpired ? (
            <button
              onClick={() => window.location.reload()}
              style={errorStyles.btn}
            >
              Start New Session
            </button>
          ) : (
            <button onClick={() => setState(prev => ({ ...prev, error: null }))} style={errorStyles.btn}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Loading overlay ──────────────────────────────────────────────────────
  const loadingOverlay = loading ? (
    <div style={loadingStyles.overlay}>
      <div style={loadingStyles.spinner}>Loading…</div>
    </div>
  ) : null;

  // ─── Persistent patient ID display (top-right) ────────────────────────────
  const patientIdBadge = (
    <div style={badgeStyles.badge}>
      <span style={badgeStyles.label}>SESSION ID</span>
      <span style={badgeStyles.value}>{patientId}</span>
    </div>
  );

  // ─── End Session button (fixed bottom-right, visible during active trials) ─
  const activePhases: AppPhase[] = ['exploration', 'metacognitive', 'control_instructions', 'control'];
  const endSessionButton = state.sessionId && activePhases.includes(state.phase) ? (
    <button onClick={() => setShowEndDialog(true)} style={endBtnStyles.btn}>
      End Session
    </button>
  ) : null;

  // ─── End Session confirmation dialog ──────────────────────────────────────
  const endSessionDialog = showEndDialog ? (
    <div style={dialogStyles.overlay}>
      <div style={dialogStyles.card}>
        <div style={dialogStyles.title}>End Session?</div>
        <p style={dialogStyles.body}>
          Are you sure you want to end this session?<br />
          Your progress up to this point will be saved.<br />
          You will be taken to the results screen.
        </p>
        <div style={dialogStyles.actions}>
          <button onClick={handleConfirmEndSession} style={dialogStyles.confirmBtn}>
            Yes, End Session
          </button>
          <button onClick={() => setShowEndDialog(false)} style={dialogStyles.cancelBtn}>
            Continue Assessment
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // ─── Phase rendering ──────────────────────────────────────────────────────
  switch (state.phase) {
    case 'welcome':
      return (
        <>
          {loadingOverlay}
          {patientIdBadge}
          <InstructionScreen
            phase="welcome"
            participantId={patientId}
            onContinue={handleWelcomeContinue}
          />
        </>
      );

    case 'instructions':
      return (
        <>
          {loadingOverlay}
          {patientIdBadge}
          <InstructionScreen
            phase={state.trialNumber === 0 ? 'exploration' : 'between_trials'}
            trialNumber={state.trialNumber + 1}
            difficultyLevel={state.nextTrialLevel ?? 3}
            phaseTimings={state.phaseTimings}
            onContinue={handleStartTrial}
          />
        </>
      );

    case 'exploration':
      if (!state.systemConfig || !state.trialId) return null;
      return (
        <>
          {loadingOverlay}
          {patientIdBadge}
          {endSessionButton}
          {endSessionDialog}
          <ExplorationPhase
            trialId={state.trialId}
            systemConfig={state.systemConfig}
            timeLimitSeconds={state.phaseTimings.exploration_seconds}
            trialNumber={state.trialNumber}
            totalTrials={MAX_TRIALS}
            onPhaseEnd={handleExplorationEnd}
          />
        </>
      );

    case 'metacognitive':
      if (!state.systemConfig || !state.trialId) return null;
      return (
        <>
          {loadingOverlay}
          {patientIdBadge}
          {endSessionButton}
          {endSessionDialog}
          <MetacognitiveReport
            trialId={state.trialId}
            exogenousLabels={state.systemConfig.exogenous_labels}
            endogenousLabels={state.systemConfig.endogenous_labels}
            timeLimitSeconds={state.phaseTimings.metacog_seconds}
            onSubmit={handleMetacogSubmit}
          />
        </>
      );

    case 'control_instructions':
      if (!state.controlSystemConfig || !state.trialId) return null;
      return (
        <>
          {loadingOverlay}
          {patientIdBadge}
          {endSessionButton}
          {endSessionDialog}
          <InstructionScreen
            phase="control"
            trialNumber={state.trialNumber}
            phaseTimings={state.phaseTimings}
            onContinue={() => setState(prev => ({ ...prev, phase: 'control' as AppPhase }))}
          />
        </>
      );

    case 'control':
      if (!state.controlSystemConfig || !state.trialId) return null;
      return (
        <>
          {loadingOverlay}
          {patientIdBadge}
          {endSessionButton}
          {endSessionDialog}
          <ControlPhase
            trialId={state.trialId}
            systemConfig={state.controlSystemConfig}
            timeLimitSeconds={state.phaseTimings.control_seconds}
            trialNumber={state.trialNumber}
            totalTrials={MAX_TRIALS}
            onPhaseEnd={handleControlEnd}
          />
        </>
      );

    case 'trial_results':
      return (
        <>
          {loadingOverlay}
          {patientIdBadge}
          <ResultsScreen
            sessionId={state.sessionId!}
            participantId={patientId}
            abilityEstimate={state.abilityEstimate}
            allTrialScores={state.allTrialScores}
            sessionComplete={false}
            terminated={false}
            onNewSession={handleNextTrial}
          />
        </>
      );

    case 'session_complete':
      return (
        <>
          {patientIdBadge}
          <ResultsScreen
            sessionId={state.sessionId!}
            participantId={patientId}
            abilityEstimate={state.abilityEstimate}
            allTrialScores={state.allTrialScores}
            sessionComplete={true}
            terminated={state.terminated}
            onNewSession={handleNewSession}
          />
        </>
      );

    default:
      return null;
  }
}

const errorStyles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', background: '#030712',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  box: {
    background: '#1a0a0a', border: '1px solid #7f1d1d',
    borderRadius: 10, padding: 32, maxWidth: 480,
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  label: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
    color: '#ef4444', textTransform: 'uppercase',
  },
  msg: { fontSize: 14, color: '#fca5a5', lineHeight: 1.5, fontFamily: 'monospace' },
  btn: {
    padding: '10px 0', background: '#7f1d1d', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  },
};

const loadingStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  spinner: {
    background: '#111827', border: '1px solid #1f2937',
    borderRadius: 8, padding: '16px 32px',
    fontSize: 14, color: '#9ca3af', fontFamily: 'Inter, sans-serif',
  },
};

const badgeStyles: Record<string, React.CSSProperties> = {
  badge: {
    position: 'fixed', top: 14, right: 16, zIndex: 500,
    background: 'rgba(17,24,39,0.97)', border: '1px solid #1f2937',
    borderRadius: 6, padding: '5px 12px',
    display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  label: {
    fontSize: 9, color: '#4b5563', letterSpacing: '0.12em',
    textTransform: 'uppercase', fontFamily: 'Inter, sans-serif',
  },
  value: {
    fontSize: 11, color: '#3b82f6', fontFamily: 'monospace', letterSpacing: '0.05em',
  },
};

const endBtnStyles: Record<string, React.CSSProperties> = {
  btn: {
    position: 'fixed', bottom: 24, right: 20, zIndex: 500,
    background: 'transparent', border: '1px solid #ff4444',
    color: '#ff4444', padding: '6px 14px', borderRadius: 4,
    fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    letterSpacing: '0.05em',
  },
};

const dialogStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
  },
  card: {
    background: '#111827', border: '1px solid #374151',
    borderRadius: 10, padding: 32, maxWidth: 420, width: '90%',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  title: {
    fontSize: 18, fontWeight: 700, color: '#f9fafb',
    fontFamily: 'Inter, sans-serif',
  },
  body: {
    fontSize: 14, color: '#9ca3af', lineHeight: 1.7,
    margin: 0, fontFamily: 'Inter, sans-serif',
  },
  actions: { display: 'flex', gap: 10, flexDirection: 'column' },
  confirmBtn: {
    padding: '12px 0', background: '#7f1d1d', color: '#fff',
    border: '1px solid #ef4444', borderRadius: 6,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  cancelBtn: {
    padding: '12px 0', background: 'transparent', color: '#9ca3af',
    border: '1px solid #374151', borderRadius: 6,
    fontSize: 14, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  },
};
