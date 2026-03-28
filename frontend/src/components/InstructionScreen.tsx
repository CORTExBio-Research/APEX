import React from 'react';

interface Props {
  phase: 'welcome' | 'exploration' | 'control' | 'between_trials';
  participantId?: string;
  trialNumber?: number;
  difficultyLevel?: number;
  phaseTimings?: { exploration_seconds: number; metacog_seconds: number; control_seconds: number };
  onContinue: () => void;
}

export function InstructionScreen({ phase, participantId, trialNumber, difficultyLevel, phaseTimings, onContinue }: Props) {

  if (phase === 'welcome') {
    return (
      <div style={s.container}>
        <div style={s.welcomeCard}>
          <div style={s.logo}>APEX</div>
          <h1 style={s.welcomeTitle}>APEX — Adaptive Problem-solving Under Expanding compleXity</h1>
          <p style={s.welcomeSubtitle}>Cognitive Assessment Platform</p>

          {participantId && (
            <div style={s.sessionIdBox}>
              <span style={s.sessionIdLabel}>Your Session ID</span>
              <span style={s.sessionIdValue}>{participantId}</span>
              <span style={s.sessionIdNote}>Please inform your clinician of this ID before starting.</span>
            </div>
          )}

          <div style={s.section}>
            <div style={s.sectionTitle}>What You Will Do</div>
            <p style={s.bodyText}>
              This assessment consists of <strong style={s.strong}>8 trials</strong>. Each trial has three phases:
            </p>

            <div style={s.phaseBlock}>
              <div style={s.phaseHeader}>
                <span style={s.phaseLabel}>Phase 1</span>
                <span style={s.phaseName}>Discovery (4 minutes)</span>
              </div>
              <p style={s.phaseBody}>
                You will interact with a hidden system by adjusting input variables labeled A, B, C, etc. Your goal is to learn how your inputs affect the outputs labeled Y, Z, W, etc. No targets will be shown. Explore freely.
              </p>
            </div>

            <div style={s.phaseBlock}>
              <div style={s.phaseHeader}>
                <span style={s.phaseLabel}>Phase 2</span>
                <span style={s.phaseName}>Report (3 minutes)</span>
              </div>
              <p style={s.phaseBody}>
                You will be asked to report what you learned about the system — which inputs affect which outputs, and in which direction. You will also rate your confidence in your understanding.
              </p>
            </div>

            <div style={s.phaseBlock}>
              <div style={s.phaseHeader}>
                <span style={s.phaseLabel}>Phase 3</span>
                <span style={s.phaseName}>Control (4 minutes)</span>
              </div>
              <p style={s.phaseBody}>
                Target values will be displayed for each output variable. Your goal is to adjust the input variables to bring all outputs to their target values and hold them there.
              </p>
            </div>
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>Important Notes</div>
            <ul style={s.notesList}>
              <li>Each trial uses a different system with different rules.</li>
              <li>There are no right or wrong ways to explore.</li>
              <li>Take your time during each phase — the timer will advance you automatically when time expires.</li>
              <li>Your session ID is displayed in the top-right corner. Please inform your clinician of this ID before starting.</li>
            </ul>
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>Total Duration</div>
            <p style={s.bodyText}>
              Approximately 90 minutes. Please ensure you have sufficient time to complete the full assessment without interruption.
            </p>
          </div>

          <button onClick={onContinue} style={s.startBtn}>Start Session →</button>
        </div>
      </div>
    );
  }

  // ─── Non-welcome phases ────────────────────────────────────────────────────
  const content = {
    exploration: {
      title: `Trial ${trialNumber ?? ''} — Exploration Phase`,
      subtitle: `Difficulty Level ${difficultyLevel ?? ''}`,
      body: (
        <>
          <p>
            You have <strong>{phaseTimings ? Math.floor(phaseTimings.exploration_seconds / 60) : 4} minutes</strong> to explore the system.
          </p>
          <ul>
            <li>Use the sliders on the left to adjust input variables (A, B, C…).</li>
            <li>Press <strong>Submit Intervention</strong> to advance the system by one time step.</li>
            <li>Observe how output variables (Y, Z, W…) respond in the center panel.</li>
            <li>The history panel on the right shows trends over time.</li>
            <li><strong>Tip:</strong> Try changing only <em>one input at a time</em> (VOTAT strategy) to isolate causal effects.</li>
          </ul>
          <p>The phase will automatically end when the timer reaches zero.</p>
        </>
      ),
      btnLabel: 'Start Exploration',
    },
    control: {
      title: 'Control Phase',
      subtitle: 'Bring outputs to their target values',
      body: (
        <>
          <p>
            You have <strong>{phaseTimings ? Math.floor(phaseTimings.control_seconds / 60) : 4} minutes</strong> to control the system.
          </p>
          <ul>
            <li>Each output variable now shows a <strong>white target marker</strong> on its gauge.</li>
            <li>Your goal is to bring all outputs as close to their targets as possible.</li>
            <li>The deviation readout below each gauge shows how far you are from target.</li>
            <li>At higher difficulty levels, the target may shift mid-trial — adapt quickly.</li>
          </ul>
        </>
      ),
      btnLabel: 'Start Control Phase',
    },
    between_trials: {
      title: 'Trial Complete',
      subtitle: `Moving to Trial ${(trialNumber ?? 0) + 1}`,
      body: (
        <p>
          Great work. Your scores have been recorded. The next trial will begin at{' '}
          <strong>difficulty level {difficultyLevel ?? '—'}</strong> based on your performance.
        </p>
      ),
      btnLabel: 'Start Next Trial',
    },
  };

  const { title, subtitle, body, btnLabel } = content[phase as keyof typeof content];

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.logoSmall}>APEX</div>
        <h1 style={s.title}>{title}</h1>
        <p style={s.subtitle}>{subtitle}</p>
        <div style={s.body}>{body}</div>
        <button onClick={onContinue} style={s.btn}>{btnLabel}</button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', background: '#030712',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  welcomeCard: {
    background: '#111827', border: '1px solid #1f2937',
    borderRadius: 12, padding: '48px 52px', maxWidth: 720,
    width: '100%', display: 'flex', flexDirection: 'column', gap: 28,
  },
  logo: {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.2em',
    color: '#3b82f6', textTransform: 'uppercase',
  },
  welcomeTitle: {
    fontSize: 24, fontWeight: 700, color: '#f9fafb',
    margin: 0, lineHeight: 1.3, fontFamily: 'Inter, sans-serif',
  },
  welcomeSubtitle: {
    fontSize: 14, color: '#6b7280', margin: 0, letterSpacing: '0.05em',
  },
  sessionIdBox: {
    background: '#0d1117', border: '1px solid #1d4ed8',
    borderRadius: 8, padding: '14px 18px',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  sessionIdLabel: {
    fontSize: 10, color: '#4b5563', textTransform: 'uppercase',
    letterSpacing: '0.12em', fontFamily: 'Inter, sans-serif',
  },
  sessionIdValue: {
    fontSize: 18, fontWeight: 700, color: '#3b82f6',
    fontFamily: 'monospace', letterSpacing: '0.06em',
  },
  sessionIdNote: {
    fontSize: 12, color: '#6b7280', marginTop: 2,
  },
  section: {
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
    color: '#4b5563', textTransform: 'uppercase',
    borderBottom: '1px solid #1f2937', paddingBottom: 8,
  },
  bodyText: {
    fontSize: 14, color: '#9ca3af', lineHeight: 1.7, margin: 0,
  },
  strong: { color: '#e5e7eb', fontWeight: 600 },
  phaseBlock: {
    background: '#0d1117', border: '1px solid #1f2937',
    borderRadius: 6, padding: '12px 16px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  phaseHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  phaseLabel: {
    fontSize: 10, fontWeight: 700, color: '#3b82f6',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
    borderRadius: 3, padding: '2px 6px',
  },
  phaseName: {
    fontSize: 13, fontWeight: 600, color: '#e5e7eb',
  },
  phaseBody: {
    fontSize: 13, color: '#9ca3af', lineHeight: 1.65, margin: 0,
  },
  notesList: {
    margin: 0, paddingLeft: 20,
    display: 'flex', flexDirection: 'column', gap: 6,
    fontSize: 13, color: '#9ca3af', lineHeight: 1.65,
  },
  startBtn: {
    marginTop: 8, padding: '15px 0',
    background: '#1d4ed8', color: '#fff',
    border: 'none', borderRadius: 8,
    fontSize: 16, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif', letterSpacing: '0.03em',
  },
  // ─── Non-welcome card styles ────────────────────────────────────────────
  card: {
    background: '#111827', border: '1px solid #1f2937',
    borderRadius: 12, padding: 48, maxWidth: 640,
    width: '100%', display: 'flex', flexDirection: 'column', gap: 20,
  },
  logoSmall: {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.2em',
    color: '#3b82f6', textTransform: 'uppercase',
  },
  title: { fontSize: 28, fontWeight: 700, color: '#f9fafb', margin: 0 },
  subtitle: { fontSize: 15, color: '#6b7280', margin: 0 },
  body: {
    fontSize: 14, color: '#9ca3af', lineHeight: 1.7,
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  btn: {
    marginTop: 8, padding: '13px 0',
    background: '#1d4ed8', color: '#fff',
    border: 'none', borderRadius: 8,
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
};
