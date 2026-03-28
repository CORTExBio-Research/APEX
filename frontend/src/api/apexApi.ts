import type {
  CreateSessionResponse,
  SessionStatus,
  StartTrialResponse,
  InterveneResponse,
  MetacogResponse,
  CompleteTrialResponse,
  InferredStructure,
} from '../types/apex.types';

const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Session ─────────────────────────────────────────────────────────────────

export async function createSession(participantId?: string): Promise<CreateSessionResponse> {
  return request('/session/create', {
    method: 'POST',
    body: JSON.stringify({ participant_id: participantId || null, apex_variant: 'standard' }),
  });
}

export async function getSessionStatus(sessionId: string): Promise<SessionStatus> {
  return request(`/session/${sessionId}/status`);
}

// ─── Trial ───────────────────────────────────────────────────────────────────

export async function startTrial(sessionId: string, trialNumber: number): Promise<StartTrialResponse> {
  return request('/trial/start', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, trial_number: trialNumber }),
  });
}

export async function intervene(
  trialId: string,
  phase: 'exploration' | 'control',
  exogenousInputs: Record<string, number>
): Promise<InterveneResponse> {
  return request('/trial/intervene', {
    method: 'POST',
    body: JSON.stringify({ trial_id: trialId, phase, exogenous_inputs: exogenousInputs }),
  });
}

export async function submitMetacog(
  trialId: string,
  inferredStructure: InferredStructure,
  confidence: number,
  strategyText: string
): Promise<MetacogResponse> {
  return request('/trial/submit_metacog', {
    method: 'POST',
    body: JSON.stringify({
      trial_id: trialId,
      inferred_structure: inferredStructure,
      confidence,
      strategy_text: strategyText,
    }),
  });
}

export async function completeTrial(trialId: string): Promise<CompleteTrialResponse> {
  return request('/trial/complete', {
    method: 'POST',
    body: JSON.stringify({ trial_id: trialId }),
  });
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export async function getSessionScoring(sessionId: string) {
  return request(`/scoring/session/${sessionId}`);
}

export async function getFullSessionScoring(sessionId: string) {
  return request(`/scoring/session/${sessionId}/full`);
}

export async function endSession(sessionId: string) {
  return request(`/session/${sessionId}/end`, { method: 'POST' });
}

export function getExportUrl(sessionId: string): string {
  return `${BASE_URL}/scoring/export/${sessionId}`;
}
