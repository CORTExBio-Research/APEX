import { useRef, useCallback } from 'react';

export interface ClientEvent {
  timestamp: string;
  type: string;
  phase: string;
  data: Record<string, unknown>;
}

export function useEventLogger() {
  const events = useRef<ClientEvent[]>([]);

  const log = useCallback((type: string, phase: string, data: Record<string, unknown> = {}) => {
    events.current.push({
      timestamp: new Date().toISOString(),
      type,
      phase,
      data,
    });
  }, []);

  const getEvents = useCallback(() => [...events.current], []);

  const clear = useCallback(() => {
    events.current = [];
  }, []);

  return { log, getEvents, clear };
}
