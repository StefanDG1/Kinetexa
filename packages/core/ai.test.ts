import { it, expect } from "vitest";
import { planSchema, validateExplanation, medicalQuestion } from "./ai";
it("rejects arbitrary tools and invented evidence", () => {
  expect(() =>
    planSchema.parse({
      tool: "executeSQL",
      from: "2026-01-01",
      to: "2026-02-01",
    }),
  ).toThrow();
  expect(() =>
    validateExplanation(
      { summary: "Improving.", evidenceIds: ["another-athlete"] },
      [],
    ),
  ).toThrow();
});
it("keeps numerical claims in deterministic evidence and blocks medical certainty", () => {
  expect(() =>
    validateExplanation(
      { summary: "Your training doubled.", evidenceIds: ["x"] },
      [{ id: "x", value: 1 }],
    ),
  ).toThrow();
  expect(() =>
    validateExplanation({ summary: "You ran 400 km.", evidenceIds: [] }, []),
  ).toThrow();
  expect(() =>
    validateExplanation(
      { summary: "You have a disease.", evidenceIds: [] },
      [],
    ),
  ).toThrow();
  expect(medicalQuestion("I have chest pain after running")).toBe(true);
});
