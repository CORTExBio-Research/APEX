import React, { useState } from 'react';
import type { TrialScores, AbilityEstimate } from '../types/apex.types';
import { getExportUrl, getFullSessionScoring } from '../api/apexApi';

const CLINICIAN_PIN = '7734';

export interface TrialEntry {
  trial: number;
  level: number;
  scores: TrialScores;
  abilityEstimate: AbilityEstimate;
}

interface FullSessionData {
  session_id: string;
  patient_id: string;
  created_at: string | null;
  completed_at: string | null;
  status: string;
  trials_completed: number;
  final_ability_score: number | null;
  ability_ci_lower: number | null;
  ability_ci_upper: number | null;
  trials: Array<{
    trial_number: number;
    difficulty_level: number;
    phase: string;
    ska_score: number | null;
    ca_score: number | null;
    ee_score: number | null;
    aui_score: number | null;
    composite_score: number | null;
    mcs_score: number | null;
    votat_rate: number | null;
  }>;
  means: {
    ska: number | null;
    ca: number | null;
    ee: number | null;
    aui: number | null;
    mcs: number | null;
  };
  clinical_flags: string[];
}

interface Props {
  sessionId: string;
  participantId: string;
  abilityEstimate: AbilityEstimate | null;
  allTrialScores: TrialEntry[];
  sessionComplete?: boolean;
  terminated?: boolean;
  onNewSession: () => void;
}

// ─── Tier calculation ────────────────────────────────────────────────────────
function getTier(composite: number): { label: string; position: number; color: string } {
  if (composite <= 0.40) return { label: 'Below Average', position: 0.08,  color: '#ef4444' };
  if (composite <= 0.55) return { label: 'Average',       position: 0.33,  color: '#f59e0b' };
  if (composite <= 0.70) return { label: 'Above Average', position: 0.535, color: '#3b82f6' };
  if (composite <= 0.85) return { label: 'High',          position: 0.715, color: '#8b5cf6' };
  return                         { label: 'Exceptional',  position: 0.90,  color: '#10b981' };
}

// ─── Tier bar visualization ──────────────────────────────────────────────────
function TierBar({ composite }: { composite: number }) {
  const tier = getTier(composite);
  const tierLabels = ['Below Average', 'Average', 'Above Average', 'High', 'Exceptional'];
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ height: 8, borderRadius: 4, overflow: 'visible', position: 'relative',
        background: 'linear-gradient(to right, #ef4444 0%, #f59e0b 25%, #3b82f6 50%, #8b5cf6 75%, #10b981 100%)' }}>
        <div style={{
          position: 'absolute', top: -5,
          left: `${tier.position * 100}%`,
          transform: 'translateX(-50%)',
          width: 18, height: 18,
          background: tier.color,
          border: '2px solid #f9fafb',
          borderRadius: '50%',
          boxShadow: `0 0 8px ${tier.color}88`,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        {tierLabels.map(t => (
          <span key={t} style={{
            fontSize: 9, letterSpacing: '0.04em',
            color: t === tier.label ? tier.color : '#374151',
            fontWeight: t === tier.label ? 700 : 400,
            fontFamily: 'Inter, sans-serif',
          }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Staircase SVG chart ─────────────────────────────────────────────────────
function StaircaseChart({ allTrialScores }: { allTrialScores: TrialEntry[] }) {
  if (allTrialScores.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 13 }}>No trial data to display.</p>;
  }

  const W = 480, H = 190;
  const ml = 38, mr = 10, mt = 20, mb = 38;
  const iW = W - ml - mr, iH = H - mt - mb;

  const maxT = Math.max(8, allTrialScores.length);
  const xS = (t: number) =>
    allTrialScores.length === 1 ? iW / 2 : ((t - 1) / (maxT - 1)) * iW;
  const yS = (l: number) => iH - ((Math.min(15, Math.max(1, l)) - 1) / 14) * iH;

  const levelPts = allTrialScores.map(t => `${xS(t.trial)},${yS(t.level)}`).join(' ');
  const abilityPts = allTrialScores.map(t =>
    `${xS(t.trial)},${yS(t.abilityEstimate.estimated_level)}`).join(' ');

  const ciTopPts = allTrialScores.map(t => `${xS(t.trial)},${yS(t.abilityEstimate.ci_upper)}`).join(' ');
  const ciBottomPts = [...allTrialScores].reverse().map(t =>
    `${xS(t.trial)},${yS(t.abilityEstimate.ci_lower)}`).join(' ');
  const ciBand = ciTopPts + ' ' + ciBottomPts;

  return (
    <svg width={W} height={H} style={{ maxWidth: '100%', display: 'block' }}>
      <g transform={`translate(${ml},${mt})`}>
        {/* Grid lines */}
        {[1, 3, 5, 7, 9, 11, 13, 15].map(l => (
          <line key={l} x1={0} y1={yS(l)} x2={iW} y2={yS(l)}
            stroke="#1f2937" strokeWidth={1} />
        ))}
        {/* CI band */}
        <polygon points={ciBand} fill="rgba(59,130,246,0.10)" />
        {/* Difficulty level line (dashed) */}
        <polyline points={levelPts} fill="none" stroke="#6b7280" strokeWidth={2} strokeDasharray="6,3" />
        {/* Ability estimate line */}
        <polyline points={abilityPts} fill="none" stroke="#3b82f6" strokeWidth={2} />
        {/* Difficulty dots */}
        {allTrialScores.map(t => (
          <circle key={`l-${t.trial}`} cx={xS(t.trial)} cy={yS(t.level)} r={3.5} fill="#6b7280" />
        ))}
        {/* Ability dots */}
        {allTrialScores.map(t => (
          <circle key={`a-${t.trial}`} cx={xS(t.trial)} cy={yS(t.abilityEstimate.estimated_level)} r={3.5} fill="#3b82f6" />
        ))}
        {/* X-axis */}
        <line x1={0} y1={iH} x2={iW} y2={iH} stroke="#374151" />
        {allTrialScores.map(t => (
          <text key={t.trial} x={xS(t.trial)} y={iH + 16} fill="#6b7280" fontSize={10} textAnchor="middle">{t.trial}</text>
        ))}
        <text x={iW / 2} y={iH + 30} fill="#4b5563" fontSize={9} textAnchor="middle">Trial</text>
        {/* Y-axis */}
        <line x1={0} y1={0} x2={0} y2={iH} stroke="#374151" />
        {[1, 5, 10, 15].map(l => (
          <text key={l} x={-5} y={yS(l) + 4} fill="#6b7280" fontSize={9} textAnchor="end">{l}</text>
        ))}
        <text x={-28} y={iH / 2} fill="#4b5563" fontSize={9} textAnchor="middle"
          transform={`rotate(-90,-28,${iH / 2})`}>Level</text>
        {/* Legend */}
        <line x1={iW - 116} y1={6}  x2={iW - 100} y2={6}  stroke="#6b7280" strokeWidth={2} strokeDasharray="6,3" />
        <text x={iW - 95} y={10} fill="#6b7280" fontSize={9}>Difficulty Level</text>
        <line x1={iW - 116} y1={20} x2={iW - 100} y2={20} stroke="#3b82f6" strokeWidth={2} />
        <text x={iW - 95} y={24} fill="#3b82f6" fontSize={9}>Ability Estimate</text>
        <rect x={iW - 116} y={30} width={16} height={8} fill="rgba(59,130,246,0.15)" />
        <text x={iW - 95} y={38} fill="#4b5563" fontSize={9}>95% CI</text>
      </g>
    </svg>
  );
}

// ─── Score bar ───────────────────────────────────────────────────────────────
function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color, fontFamily: 'monospace' }}>
          {(value * 100).toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 5, background: '#1f2937', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value * 100}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

// ─── Helper to compute local clinical flags from frontend data ────────────────
function computeLocalFlags(allTrialScores: TrialEntry[], terminated?: boolean): string[] {
  const flags: string[] = [];
  const adaptiveTrials = allTrialScores.filter(t => t.trial >= 3);
  if (adaptiveTrials.length > 0) {
    const meanComposite = adaptiveTrials.reduce((s, t) => s + t.scores.composite, 0) / adaptiveTrials.length;
    if (meanComposite < 0.40) flags.push('Performance in deficit range');
  }
  const allEE = allTrialScores.map(t => t.scores.ee);
  const meanEE = allEE.length > 0 ? allEE.reduce((a, b) => a + b, 0) / allEE.length : null;
  if (meanEE !== null && meanEE < 0.25) {
    flags.push('Severely unsystematic exploration — possible executive function impairment');
  }
  if (terminated) flags.push('Assessment incomplete — interpret with caution');
  return flags;
}

// ─── Main ResultsScreen component ────────────────────────────────────────────
export function ResultsScreen({
  sessionId, participantId, abilityEstimate, allTrialScores,
  sessionComplete, terminated, onNewSession,
}: Props) {
  const [clinicianView, setClinicianView] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [fullData, setFullData] = useState<FullSessionData | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);

  const avgComposite = allTrialScores.length > 0
    ? allTrialScores.reduce((sum, t) => sum + t.scores.composite, 0) / allTrialScores.length
    : 0;

  const lastScores = allTrialScores.length > 0 ? allTrialScores[allTrialScores.length - 1].scores : null;

  // ── Between-trial simple view ────────────────────────────────────────────
  if (!sessionComplete) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <div style={s.logo}>APEX — CORTExBio</div>
          <h1 style={s.title}>Trial Complete</h1>
          {lastScores && (
            <div style={s.scoresBox}>
              <div style={s.sectionTitle}>Trial Scores</div>
              <div style={s.scoresGrid}>
                <ScoreBar label="Structural Knowledge (SKA)" value={lastScores.ska} color="#3b82f6" />
                <ScoreBar label="Control Accuracy (CA)" value={lastScores.ca} color="#10b981" />
                <ScoreBar label="Exploration Efficiency (EE)" value={lastScores.ee} color="#f59e0b" />
                <ScoreBar label="Adaptive Updating (AUI)" value={lastScores.aui} color="#8b5cf6" />
                <div style={{ borderTop: '1px solid #1f2937', paddingTop: 8 }}>
                  <ScoreBar label="Composite APEX Score" value={lastScores.composite} color="#ffffff" />
                </div>
              </div>
            </div>
          )}
          <div style={s.actions}>
            <button onClick={onNewSession} style={s.primaryBtn}>Continue to Next Trial →</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Clinician PIN unlock ─────────────────────────────────────────────────
  async function handleUnlockClinician() {
    if (pinInput === CLINICIAN_PIN) {
      setShowPinDialog(false);
      setPinInput('');
      setPinError(false);
      setLoadingFull(true);
      try {
        const data = await getFullSessionScoring(sessionId) as FullSessionData;
        setFullData(data);
      } catch (_) {
        // Fall back to local computation — clinician view still works
      } finally {
        setLoadingFull(false);
      }
      setClinicianView(true);
    } else {
      setPinError(true);
      setPinInput('');
    }
  }

  if (clinicianView) {
    return (
      <ClinicianView
        sessionId={sessionId}
        participantId={participantId}
        abilityEstimate={abilityEstimate}
        allTrialScores={allTrialScores}
        fullData={fullData}
        loadingFull={loadingFull}
        terminated={terminated}
        onPatientView={() => setClinicianView(false)}
        onNewSession={onNewSession}
      />
    );
  }

  // ── Patient view (session complete) ─────────────────────────────────────
  const tier = getTier(avgComposite);
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <>
      {showPinDialog && (
        <div style={s.modalOverlay}>
          <div style={s.pinCard}>
            <div style={s.pinTitle}>Clinician Access</div>
            <p style={s.pinSub}>Enter your clinician PIN to view the full assessment report.</p>
            <input
              type="password"
              value={pinInput}
              onChange={e => { setPinInput(e.target.value); setPinError(false); }}
              onKeyDown={e => e.key === 'Enter' && handleUnlockClinician()}
              placeholder="Enter PIN"
              autoFocus
              style={s.pinInput}
            />
            {pinError && <div style={s.pinError}>Incorrect PIN.</div>}
            {loadingFull && <div style={s.pinError}>Loading data…</div>}
            <button onClick={handleUnlockClinician} style={s.pinBtn}>Access</button>
            <button onClick={() => { setShowPinDialog(false); setPinInput(''); setPinError(false); }} style={s.pinCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={s.container} id="patient-print-area">
        <div style={s.card}>
          <div style={s.logo}>
            APEX — CORTExBio
            <span style={{ color: '#4b5563', fontWeight: 400, fontSize: 10, marginLeft: 8 }}>
              | Patient Summary
            </span>
          </div>

          <h1 style={s.title}>Session Complete</h1>
          <p style={{ color: '#9ca3af', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Thank you for completing the APEX assessment.
          </p>

          <div style={s.infoGrid}>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>Session ID</span>
              <span style={s.infoValue}>{participantId}</span>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>Date</span>
              <span style={s.infoValue}>{dateStr}</span>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>Trials Completed</span>
              <span style={s.infoValue}>{allTrialScores.length} of 8</span>
            </div>
          </div>

          <div style={s.tierBox}>
            <div style={s.tierLabel}>Overall Performance Level</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: tier.color, marginBottom: 4 }}>
              {tier.label}
            </div>
            <TierBar composite={avgComposite} />
          </div>

          <div style={s.messageBox}>
            <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.75, margin: 0 }}>
              Your full results have been recorded and will be reviewed by your clinician.
              Please provide your Session ID to your clinician:{' '}
              <strong style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{participantId}</strong>
            </p>
          </div>

          <div style={s.actions}>
            <button onClick={() => window.print()} style={s.printBtn}>Print Summary</button>
            <button onClick={onNewSession} style={s.primaryBtn}>Start New Session</button>
          </div>

          <button onClick={() => setShowPinDialog(true)} style={s.clinicianLink}>
            Clinician Access →
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #patient-print-area, #patient-print-area * { visibility: visible; }
          #patient-print-area { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </>
  );
}

// ─── Clinician View ───────────────────────────────────────────────────────────
interface ClinicianProps {
  sessionId: string;
  participantId: string;
  abilityEstimate: AbilityEstimate | null;
  allTrialScores: TrialEntry[];
  fullData: FullSessionData | null;
  loadingFull: boolean;
  terminated?: boolean;
  onPatientView: () => void;
  onNewSession: () => void;
}

function ClinicianView({
  sessionId, participantId, abilityEstimate, allTrialScores,
  fullData, terminated, onPatientView, onNewSession,
}: ClinicianProps) {

  const trialsCompleted = allTrialScores.length;
  const dateStr = new Date().toLocaleString();

  const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const meanSKA = mean(allTrialScores.map(t => t.scores.ska));
  const meanCA  = mean(allTrialScores.map(t => t.scores.ca));
  const meanEE  = mean(allTrialScores.map(t => t.scores.ee));
  const level8Trials = allTrialScores.filter(t => t.level >= 8);
  const meanAUI = level8Trials.length > 0 ? mean(level8Trials.map(t => t.scores.aui)) : null;

  const adaptiveTrials = allTrialScores.filter(t => t.trial >= 3);
  const adaptiveEE = adaptiveTrials.length > 0 ? mean(adaptiveTrials.map(t => t.scores.ee)) : null;

  const finalAbility  = fullData?.final_ability_score  ?? abilityEstimate?.estimated_level ?? null;
  const ciLower       = fullData?.ability_ci_lower      ?? abilityEstimate?.ci_lower        ?? null;
  const ciUpper       = fullData?.ability_ci_upper      ?? abilityEstimate?.ci_upper        ?? null;
  const abilityLevel  = finalAbility != null ? Math.round(finalAbility) : null;
  const meanMCS       = fullData?.means?.mcs ?? null;

  const clinicalFlags = fullData?.clinical_flags ?? computeLocalFlags(allTrialScores, terminated);

  function mcsInterpretation(v: number) {
    if (v > 0.75) return 'Well-calibrated';
    if (v >= 0.50) return 'Moderate calibration';
    return 'Overconfident or underconfident';
  }

  function eeInterpretation(v: number) {
    if (v > 0.70) return 'Systematic exploration (VOTAT-dominant)';
    if (v >= 0.40) return 'Mixed exploration strategy';
    return 'Unsystematic exploration';
  }

  return (
    <div style={s.clinContainer} id="clinician-print-area">
      <div style={s.clinCard}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div style={s.logo}>
            APEX — CORTExBio
            <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 10, marginLeft: 10 }}>
              CLINICIAN VIEW — CONFIDENTIAL
            </span>
          </div>
          <button onClick={onPatientView} style={s.backBtn}>← Patient View</button>
        </div>

        {/* HEADER */}
        <section style={s.clinSection}>
          <div style={s.clinSectionTitle}>Patient Assessment Summary</div>
          <div style={s.clinGrid}>
            <div style={s.clinCell}><span style={s.clinLabel}>Patient Session ID</span><span style={s.clinValue}>{participantId}</span></div>
            <div style={s.clinCell}><span style={s.clinLabel}>Assessment Date/Time</span><span style={s.clinValue}>{dateStr}</span></div>
            <div style={s.clinCell}><span style={s.clinLabel}>Trials Completed</span><span style={s.clinValue}>{trialsCompleted}/8</span></div>
            <div style={s.clinCell}>
              <span style={s.clinLabel}>Session Status</span>
              <span style={{ ...s.clinValue, color: terminated ? '#ef4444' : '#10b981' }}>
                {terminated ? 'Terminated Early' : 'Completed'}
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 1 — COMPOSITE SCORE */}
        <section style={s.clinSection}>
          <div style={s.clinSectionTitle}>1 — Composite Score</div>
          <div style={s.clinGrid}>
            <div style={s.clinCell}>
              <span style={s.clinLabel}>Final APEX Ability Score</span>
              <span style={{ ...s.clinValue, fontSize: 26, color: '#3b82f6' }}>
                {finalAbility != null ? finalAbility.toFixed(2) : '—'}
              </span>
            </div>
            <div style={s.clinCell}>
              <span style={s.clinLabel}>95% Confidence Interval</span>
              <span style={s.clinValue}>
                {ciLower != null && ciUpper != null ? `${ciLower.toFixed(2)} — ${ciUpper.toFixed(2)}` : '—'}
              </span>
            </div>
            <div style={s.clinCell}>
              <span style={s.clinLabel}>Ability Level Estimate (1–15)</span>
              <span style={s.clinValue}>{abilityLevel ?? '—'}</span>
            </div>
          </div>
        </section>

        {/* SECTION 2 — DIMENSIONAL SCORES */}
        <section style={s.clinSection}>
          <div style={s.clinSectionTitle}>2 — Dimensional Scores</div>
          <div style={s.table}>
            <div style={{ ...s.tableHead, gridTemplateColumns: '44px 48px 1fr 1fr 1fr 1fr 1fr 90px' }}>
              <span>Trial</span><span>Level</span><span>SKA</span><span>CA</span>
              <span>EE</span><span>AUI</span><span>Composite</span><span>Phase</span>
            </div>
            {allTrialScores.map(({ trial, level, scores }) => (
              <div key={trial} style={{ ...s.tableRow, gridTemplateColumns: '44px 48px 1fr 1fr 1fr 1fr 1fr 90px' }}>
                <span>{trial}</span>
                <span>{level}</span>
                <span>{(scores.ska * 100).toFixed(0)}%</span>
                <span>{(scores.ca * 100).toFixed(0)}%</span>
                <span>{(scores.ee * 100).toFixed(0)}%</span>
                <span>{level >= 8 ? (scores.aui * 100).toFixed(0) + '%' : '—'}</span>
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>{(scores.composite * 100).toFixed(0)}%</span>
                <span style={{ color: '#6b7280' }}>{trial <= 2 ? 'Calibration' : 'Adaptive'}</span>
              </div>
            ))}
          </div>
          <div style={s.meansRow}>
            <span style={s.clinLabel}>Means:</span>
            <span style={s.clinValue}>SKA {(meanSKA * 100).toFixed(1)}%</span>
            <span style={s.clinValue}>CA {(meanCA * 100).toFixed(1)}%</span>
            <span style={s.clinValue}>EE {(meanEE * 100).toFixed(1)}%</span>
            <span style={s.clinValue}>AUI {meanAUI != null ? (meanAUI * 100).toFixed(1) + '%' : 'N/A (no Level 8+ trials)'}</span>
          </div>
        </section>

        {/* SECTION 3 — METACOGNITIVE CALIBRATION */}
        <section style={s.clinSection}>
          <div style={s.clinSectionTitle}>3 — Metacognitive Calibration</div>
          <div style={s.clinGrid}>
            <div style={s.clinCell}>
              <span style={s.clinLabel}>Mean MCS (Metacognitive Calibration Score)</span>
              <span style={s.clinValue}>{meanMCS != null ? meanMCS.toFixed(3) : 'N/A'}</span>
            </div>
            <div style={s.clinCell}>
              <span style={s.clinLabel}>Interpretation</span>
              <span style={s.clinValue}>
                {meanMCS != null ? mcsInterpretation(meanMCS) : 'Insufficient data'}
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 4 — STAIRCASE TRAJECTORY */}
        <section style={s.clinSection}>
          <div style={s.clinSectionTitle}>4 — Staircase Trajectory</div>
          <div style={{ background: '#0d1117', border: '1px solid #1f2937', borderRadius: 8, padding: 16, overflowX: 'auto' }}>
            <StaircaseChart allTrialScores={allTrialScores} />
          </div>
        </section>

        {/* SECTION 5 — EXPLORATION STRATEGY */}
        <section style={s.clinSection}>
          <div style={s.clinSectionTitle}>5 — Exploration Strategy</div>
          <div style={s.clinGrid}>
            <div style={s.clinCell}>
              <span style={s.clinLabel}>Mean EE (Adaptive Trials 3–8)</span>
              <span style={s.clinValue}>
                {adaptiveEE != null ? (adaptiveEE * 100).toFixed(1) + '%' : 'N/A'}
              </span>
            </div>
            <div style={s.clinCell}>
              <span style={s.clinLabel}>Interpretation</span>
              <span style={s.clinValue}>
                {adaptiveEE != null ? eeInterpretation(adaptiveEE) : '—'}
              </span>
            </div>
          </div>
          {fullData?.trials && fullData.trials.some(t => t.votat_rate != null) && (
            <div style={{ marginTop: 12 }}>
              <div style={s.clinLabel}>VOTAT Rate per Trial</div>
              <div style={s.table}>
                <div style={{ ...s.tableHead, gridTemplateColumns: '60px 1fr' }}>
                  <span>Trial</span><span>VOTAT %</span>
                </div>
                {fullData.trials.map(t => (
                  <div key={t.trial_number} style={{ ...s.tableRow, gridTemplateColumns: '60px 1fr' }}>
                    <span>{t.trial_number}</span>
                    <span>{t.votat_rate != null ? (t.votat_rate * 100).toFixed(1) + '%' : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* SECTION 6 — ADAPTIVE UPDATING */}
        <section style={s.clinSection}>
          <div style={s.clinSectionTitle}>6 — Adaptive Updating Index (Level 8+ Trials)</div>
          {level8Trials.length > 0 ? (
            <div style={s.table}>
              <div style={{ ...s.tableHead, gridTemplateColumns: '60px 60px 80px 1fr' }}>
                <span>Trial</span><span>Level</span><span>AUI</span><span>Interpretation</span>
              </div>
              {level8Trials.map(t => (
                <div key={t.trial} style={{ ...s.tableRow, gridTemplateColumns: '60px 60px 80px 1fr' }}>
                  <span>{t.trial}</span>
                  <span>{t.level}</span>
                  <span>{(t.scores.aui * 100).toFixed(1)}%</span>
                  <span style={{ color: '#6b7280' }}>
                    {t.scores.aui >= 0.70 ? 'Strong updating' :
                     t.scores.aui >= 0.40 ? 'Moderate updating' : 'Weak updating'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
              Subject did not reach Level 8. AUI not computable.
            </p>
          )}
        </section>

        {/* SECTION 7 — CLINICAL FLAGS */}
        <section style={s.clinSection}>
          <div style={s.clinSectionTitle}>7 — Clinical Flags</div>
          {clinicalFlags.length === 0 ? (
            <p style={{ color: '#10b981', fontSize: 13, margin: 0 }}>No clinical flags identified.</p>
          ) : (
            <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clinicalFlags.map((flag, i) => (
                <li key={i} style={{ color: '#ef4444', fontSize: 13 }}>{flag}</li>
              ))}
            </ul>
          )}
        </section>

        {/* ACTIONS */}
        <div style={{ ...s.actions, flexWrap: 'wrap' }}>
          <button onClick={() => window.print()} style={s.printBtn}>
            Print Full Clinical Report (PDF)
          </button>
          <a href={getExportUrl(sessionId)} download style={s.exportBtn}>
            Download Data (CSV)
          </a>
          <button onClick={onNewSession} style={s.primaryBtn}>Start New Session</button>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #clinician-print-area, #clinician-print-area * { visibility: visible; }
          #clinician-print-area { position: absolute; top: 0; left: 0; width: 100%; background: #fff; }
          @page { margin: 18mm; }
        }
        @media print {
          #clinician-print-area::before {
            content: "CORTExBio APEX Clinical Assessment Report — CONFIDENTIAL";
            display: block; font-size: 14px; font-weight: bold; margin-bottom: 16px;
          }
          #clinician-print-area::after {
            content: "Generated by APEX v1.0 | cortex-bio.com | For clinical use only";
            display: block; font-size: 10px; margin-top: 16px; color: #666;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', background: '#030712',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    background: '#111827', border: '1px solid #1f2937', borderRadius: 12,
    padding: 48, maxWidth: 640, width: '100%',
    display: 'flex', flexDirection: 'column', gap: 24,
  },
  logo: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
    color: '#3b82f6', textTransform: 'uppercase',
  },
  title: { fontSize: 28, fontWeight: 700, color: '#f9fafb', margin: 0 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
    color: '#6b7280', textTransform: 'uppercase',
  },
  scoresBox: { display: 'flex', flexDirection: 'column', gap: 12 },
  scoresGrid: {
    background: '#0d1117', border: '1px solid #1f2937',
    borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
  },
  infoGrid: { display: 'flex', gap: 24, flexWrap: 'wrap' },
  infoItem: { display: 'flex', flexDirection: 'column', gap: 3 },
  infoLabel: {
    fontSize: 10, color: '#4b5563', textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  infoValue: { fontSize: 14, color: '#e5e7eb', fontFamily: 'monospace' },
  tierBox: {
    background: '#0d1117', border: '1px solid #1f2937',
    borderRadius: 10, padding: '20px 24px',
  },
  tierLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
    color: '#6b7280', textTransform: 'uppercase', marginBottom: 8,
  },
  messageBox: {
    background: '#0d1117', border: '1px solid #1f2937',
    borderRadius: 8, padding: '14px 18px',
  },
  actions: { display: 'flex', gap: 10 },
  primaryBtn: {
    flex: 1, padding: '12px 0', background: '#1d4ed8', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  },
  printBtn: {
    flex: 1, padding: '12px 0', background: '#1a2438',
    color: '#60a5fa', border: '1px solid #1d4ed8',
    borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  },
  exportBtn: {
    flex: 1, padding: '12px 0', background: '#1a2e1a',
    color: '#4ade80', border: '1px solid #166534',
    borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none',
    textAlign: 'center', fontFamily: 'Inter, sans-serif',
  },
  clinicianLink: {
    background: 'transparent', border: 'none',
    color: '#4b5563', fontSize: 12, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em',
    padding: 0, textAlign: 'left',
  },
  // ── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  },
  pinCard: {
    background: '#111827', border: '1px solid #374151',
    borderRadius: 10, padding: 32, maxWidth: 380, width: '90%',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  pinTitle: { fontSize: 18, fontWeight: 700, color: '#f9fafb', fontFamily: 'Inter, sans-serif' },
  pinSub:   { fontSize: 13, color: '#9ca3af', margin: 0, lineHeight: 1.6 },
  pinInput: {
    padding: '10px 12px', background: '#0d1117',
    border: '1px solid #374151', color: '#f9fafb',
    borderRadius: 6, fontSize: 14, fontFamily: 'monospace',
    outline: 'none',
  },
  pinError: { fontSize: 12, color: '#ef4444' },
  pinBtn: {
    padding: '10px 0', background: '#1d4ed8', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  },
  pinCancel: {
    background: 'transparent', border: 'none', color: '#6b7280',
    fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  },
  // ── Clinician layout ───────────────────────────────────────────────────────
  clinContainer: {
    minHeight: '100vh', background: '#030712',
    display: 'flex', justifyContent: 'center', padding: '40px 24px',
  },
  clinCard: {
    background: '#111827', border: '1px solid #1f2937',
    borderRadius: 12, padding: '36px 44px', maxWidth: 820,
    width: '100%', display: 'flex', flexDirection: 'column', gap: 28,
  },
  backBtn: {
    background: 'transparent', border: '1px solid #374151',
    color: '#9ca3af', fontSize: 12, cursor: 'pointer',
    padding: '5px 12px', borderRadius: 4, fontFamily: 'Inter, sans-serif',
    whiteSpace: 'nowrap' as const,
  },
  clinSection: {
    display: 'flex', flexDirection: 'column', gap: 12,
    borderTop: '1px solid #1f2937', paddingTop: 20,
  },
  clinSectionTitle: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
    color: '#4b5563', textTransform: 'uppercase',
  },
  clinGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 16,
  },
  clinCell: { display: 'flex', flexDirection: 'column', gap: 4 },
  clinLabel: {
    fontSize: 10, color: '#4b5563', textTransform: 'uppercase',
    letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif',
  },
  clinValue: {
    fontSize: 14, color: '#e5e7eb', fontFamily: 'monospace',
    fontWeight: 600,
  },
  table: {
    background: '#0d1117', border: '1px solid #1f2937',
    borderRadius: 8, overflow: 'hidden', fontSize: 12, fontFamily: 'monospace',
  },
  tableHead: {
    display: 'grid', padding: '8px 12px',
    background: '#111827', color: '#6b7280', fontWeight: 600,
    borderBottom: '1px solid #1f2937',
  },
  tableRow: {
    display: 'grid', padding: '7px 12px',
    color: '#9ca3af', borderBottom: '1px solid #111827',
    alignItems: 'center',
  },
  meansRow: {
    display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
    paddingTop: 8,
  },
};
