import { useState, useCallback, useRef } from 'react';
import type { SystemConfig, HistoryEntry, InterveneResponse } from '../types/apex.types';
import { intervene } from '../api/apexApi';

export function useTrialState(systemConfig: SystemConfig | null, trialId: string | null) {
  const [systemState, setSystemState] = useState<Record<string, number>>(
    systemConfig?.initial_state ?? {}
  );
  const [displayState, setDisplayState] = useState<Record<string, number>>({});
  const [exogenousInputs, setExogenousInputs] = useState<Record<string, number>>(
    () => Object.fromEntries((systemConfig?.exogenous_labels ?? []).map(l => [l, 0]))
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stepCount, setStepCount] = useState(0);
  const [targetState, setTargetState] = useState<Record<string, number> | null>(
    systemConfig?.target_state ?? null
  );
  const [targetShifted, setTargetShifted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastVotat, setLastVotat] = useState<boolean | null>(null);

  const phaseRef = useRef<'exploration' | 'control'>('exploration');

  const setPhase = useCallback((phase: 'exploration' | 'control') => {
    phaseRef.current = phase;
  }, []);

  const updateExogenous = useCallback((label: string, value: number) => {
    setExogenousInputs(prev => ({ ...prev, [label]: value }));
  }, []);

  const submitIntervention = useCallback(async (): Promise<InterveneResponse | null> => {
    if (!trialId || isSubmitting) return null;
    setIsSubmitting(true);
    try {
      const response = await intervene(trialId, phaseRef.current, exogenousInputs);
      setSystemState(response.new_system_state);
      setDisplayState(response.display_state);
      setStepCount(response.step_number);
      setLastVotat(response.is_votat);

      if (response.target_state) {
        setTargetState(response.target_state);
      }
      if (response.target_shifted) {
        setTargetShifted(true);
      }

      setHistory(prev => [
        ...prev,
        {
          step: response.step_number,
          state: response.new_system_state,
          exogenous: { ...exogenousInputs },
          phase: phaseRef.current,
        },
      ]);

      return response;
    } finally {
      setIsSubmitting(false);
    }
  }, [trialId, exogenousInputs, isSubmitting]);

  const resetForControl = useCallback((config: SystemConfig) => {
    setSystemState(config.initial_state);
    setDisplayState({});
    setExogenousInputs(Object.fromEntries(config.exogenous_labels.map(l => [l, 0])));
    setHistory([]);
    setStepCount(0);
    setTargetState(config.target_state ?? null);
    setTargetShifted(false);
    setLastVotat(null);
    phaseRef.current = 'control';
  }, []);

  return {
    systemState,
    displayState,
    exogenousInputs,
    history,
    stepCount,
    targetState,
    targetShifted,
    isSubmitting,
    lastVotat,
    updateExogenous,
    submitIntervention,
    setPhase,
    resetForControl,
  };
}
