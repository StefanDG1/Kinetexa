import { dayKey } from "./dashboard";
import { shiftDay } from "./ai";
import { evaluateTool, type ToolData } from "./ai-tools";
export function findInsight(data: ToolData) {
  const to = dayKey(data.now, data.timezone),
    from = shiftDay(to, -6);
  const evidence = evaluateTool(
    {
      callId: "weekly",
      tool: "getTrainingLoad",
      period: { from, to, comparison: "previous" },
    },
    data,
  );
  const load = evidence.find((e) => e.id === "weekly-load"),
    count = evidence.find((e) => e.id === "weekly-count");
  if (
    data.excluded ||
    !load ||
    load.value === null ||
    load.comparison?.value === null ||
    !load.comparison ||
    load.comparison.percent === null ||
    Math.abs(load.comparison.percent) < 20 ||
    !count ||
    count.value! < 2 ||
    count.comparison?.value === null ||
    (count.comparison?.value ?? 0) < 2
  )
    return null;
  if (load.caveats.some((c) => c.includes("lack this measurement")))
    return null;
  return evidence;
}
