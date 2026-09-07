import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseOrThrow, SchemaValidationError } from "../../../src/shared/schemas/parse";

const testSchema = z.object({
  name: z.string(),
  age: z.number().min(0),
});

describe("parseOrThrow", () => {
  it("returns the parsed value for valid data", () => {
    const result = parseOrThrow(testSchema, { name: "Ada", age: 30 }, "test-context");
    expect(result).toEqual({ name: "Ada", age: 30 });
  });

  it("throws a SchemaValidationError for invalid data", () => {
    expect(() => parseOrThrow(testSchema, { name: "Ada", age: -1 }, "test-context")).toThrow(
      SchemaValidationError,
    );
  });

  it("includes the context in the thrown error", () => {
    try {
      parseOrThrow(testSchema, { name: "Ada" }, "candidate-answer-evaluation");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect((error as SchemaValidationError).message).toContain("candidate-answer-evaluation");
    }
  });

  it("never echoes the raw invalid input's sensitive values in the error message", () => {
    const sensitiveCvText = "TOP-SECRET-CANDIDATE-CV-CONTENT-12345";
    try {
      parseOrThrow(testSchema, { name: sensitiveCvText, age: "not-a-number" }, "cv-analysis");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect((error as SchemaValidationError).message).not.toContain(sensitiveCvText);
    }
  });
});
