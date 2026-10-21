import { useCallback, useRef } from 'react';

/**
 * Undo / redo over whole snapshots. Each domain (the board, the positions of one project) is
 * restored by its own callback. Edits that arrive in a quick burst (dragging a card) are merged
 * into one step: a new step starts only after a pause.
 */
export interface UndoEntry<K extends string = string> {
  kind: K;
  /** The state before the change */
  state: unknown;
  /** Extra key, e.g. the project the positions belong to */
  scope?: string;
}

const MAX_STEPS = 80;
const MERGE_MS = 600;

export function useUndo() {
  const past = useRef<UndoEntry[]>([]);
  const future = useRef<UndoEntry[]>([]);
  const last = useRef<{ kind: string; scope?: string; at: number } | null>(null);
  const restoring = useRef(false);

  /** Call before applying a change, with the state as it was */
  const record = useCallback((entry: UndoEntry) => {
    if (restoring.current) return;
    const now = Date.now();
    const l = last.current;
    last.current = { kind: entry.kind, scope: entry.scope, at: now };
    if (l && l.kind === entry.kind && l.scope === entry.scope && now - l.at < MERGE_MS) return;
    past.current.push(entry);
    if (past.current.length > MAX_STEPS) past.current.shift();
    future.current = [];
  }, []);

  /**
   * Step back (or forward). `swap` restores the entry and returns the current state of that domain,
   * which goes onto the other stack; returning undefined skips the entry.
   */
  const step = useCallback((direction: 'undo' | 'redo', swap: (entry: UndoEntry) => unknown | undefined): boolean => {
    const from = direction === 'undo' ? past.current : future.current;
    const to = direction === 'undo' ? future.current : past.current;
    const entry = from.pop();
    if (!entry) return false;
    restoring.current = true;
    try {
      const current = swap(entry);
      if (current !== undefined) to.push({ ...entry, state: current });
    } finally {
      restoring.current = false;
      last.current = null;
    }
    return true;
  }, []);

  return { record, step, canUndo: () => past.current.length > 0, canRedo: () => future.current.length > 0 };
}
