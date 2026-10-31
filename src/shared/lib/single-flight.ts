export interface SingleFlight<T> {
  /**
   * Returns the current attempt if one exists (in flight, or settled and not
   * yet released); otherwise starts `attempt` and remembers it.
   */
  run: (attempt: () => Promise<T>) => Promise<T>;
  /** Forgets the current attempt only if it has settled, allowing a retry. */
  releaseSettled: () => void;
  /** Forgets the current attempt unconditionally. */
  reset: () => void;
}

export function createSingleFlight<T>(): SingleFlight<T> {
  // Settlement is tracked per attempt so an older attempt finishing late can
  // never mark a newer in-flight attempt as settled.
  let current: { promise: Promise<T>; settled: boolean } | null = null;

  return {
    run(attempt) {
      if (current) return current.promise;

      let settled = false;
      const promise = (async () => attempt())().finally(() => {
        settled = true;
      });

      current = {
        promise,
        get settled() {
          return settled;
        },
      };

      return promise;
    },
    releaseSettled() {
      if (current?.settled) current = null;
    },
    reset() {
      current = null;
    },
  };
}
