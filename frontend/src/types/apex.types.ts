// ─── Core System Types ────────────────────────────────────────────────────────

export interface VariableBounds {
  min: number;
  max: number;
}

export interface SystemConfig {
  system_id: string;
  difficulty_level: number;
  n_exogenous: number;
  n_endogenous: number;
  exogenous_labels: string[];
  endogenous_labels: string[];
  variable_bounds: Record<string, VariableBounds>;
  initial_state: Record<string, number>;
  target_state?: Record<string, number> | null;
}

export interface PhaseTimings {
  exploration_seconds: number;
  metacog_seconds: number;
  control_seconds: number;
}

// ─── Session / Trial ─────────────────────────────────────────────────────────

export interface CreateSessionResponse {
  session_id: string;
  participant_id: string;
  first_trial_config: SystemConfig & { phase_timings: PhaseTimings };
}

export interface SessionStatus {
  status: string;
  n_trials: number;
  ability_estimate: AbilityEstimate | null;
  apex_ability_score: number | null;
  current_level: number | null;
}

export interface StartTrialResponse {
  trial_id: string;
  system_config: SystemConfig;
  phase_timings: PhaseTimings;
  trial_number: number;
  difficulty_level: number;
  phase_type: 'calibration' | 'adaptive';
}

export interface InterveneResponse {
  new_system_state: Record<string, number>;
  display_state: Record<string, number>;
  step_number: number;
  is_votat: boolean;
  target_state: Record<string, number> | null;
  target_shifted: boolean;
}

export interface MetacogResponse {
  ska_score: number;
  calibration_score: number;
  control_phase_config: SystemConfig;
}

export interface TrialScores {
  ska: number;
  ca: number;
  ee: number;
  aui: number;
  composite: number;
}

export interface AbilityEstimate {
  estimated_level: number;
  ci_lower: number;
  ci_upper: number;
  n_trials_completed: number;
}

export interface CompleteTrialResponse {
  trial_scores: TrialScores;
  next_trial_level: number;
  session_ability_estimate: AbilityEstimate;
  session_complete: boolean;
}

// ─── Metacognitive Report ────────────────────────────────────────────────────

export type ConnectionType = 'positive' | 'negative' | 'none';

export interface InferredStructure {
  [connection: string]: ConnectionType;
}

// ─── App State ───────────────────────────────────────────────────────────────

export type AppPhase =
  | 'welcome'
  | 'instructions'
  | 'exploration'
  | 'metacognitive'
  | 'control_instructions'
  | 'control'
  | 'trial_results'
  | 'session_complete';

export interface HistoryEntry {
  step: number;
  state: Record<string, number>;
  exogenous: Record<string, number>;
  phase: 'exploration' | 'control';
}
