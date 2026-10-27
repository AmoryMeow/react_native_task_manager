export interface DebouncedAction {
  cancel: () => void;
  flush: () => boolean;
  schedule: (action: () => void) => void;
}

export function createDebouncedAction(delayMs: number): DebouncedAction {
  let pendingAction: (() => void) | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timeoutId === null) return;

    clearTimeout(timeoutId);
    timeoutId = null;
  };

  const runPendingAction = () => {
    const action = pendingAction;

    clearTimer();
    pendingAction = null;
    action?.();
  };

  return {
    cancel() {
      clearTimer();
      pendingAction = null;
    },
    flush() {
      if (!pendingAction) return false;

      runPendingAction();
      return true;
    },
    schedule(action) {
      clearTimer();
      pendingAction = action;
      timeoutId = setTimeout(runPendingAction, delayMs);
    },
  };
}
