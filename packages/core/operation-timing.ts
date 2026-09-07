export type OperationPhase = {
  name:
    | "storage.read"
    | "storage.write"
    | "decode"
    | "parse.normalize"
    | "analytics"
    | "ai.plan"
    | "ai.tools"
    | "ai.explain";
  startedAt: number;
  endedAt: number;
  failed: boolean;
};

// Bounded phase metadata only. Do not attach payloads, filenames or error messages.
export function operationTiming() {
  const phases: OperationPhase[] = [];
  function record(
    name: OperationPhase["name"],
    startedAt: number,
    failed: boolean,
  ) {
    if (phases.length < 32)
      phases.push({ name, startedAt, endedAt: Date.now(), failed });
  }
  return {
    phases,
    async measure<T>(
      name: OperationPhase["name"],
      run: () => Promise<T>,
    ): Promise<T> {
      const startedAt = Date.now();
      try {
        const result = await run();
        record(name, startedAt, false);
        return result;
      } catch (error) {
        record(name, startedAt, true);
        throw error;
      }
    },
    sync<T>(name: OperationPhase["name"], run: () => T): T {
      const startedAt = Date.now();
      try {
        const result = run();
        record(name, startedAt, false);
        return result;
      } catch (error) {
        record(name, startedAt, true);
        throw error;
      }
    },
  };
}
