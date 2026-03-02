import { describe, it, expect } from "vitest";
import { interpolatePlaceholders } from "@/lib/email/placeholders";

describe("Email Placeholders", () => {
  it("should replace single placeholder", () => {
    const template = "Hello {{customerName}}!";
    const context = { customerName: "John" };
    expect(interpolatePlaceholders(template, context)).toBe("Hello John!");
  });

  it("should replace multiple placeholders", () => {
    const template = "Hi {{customerName}}, your lesson is at {{lessonTime}} with {{brandName}}.";
    const context = {
      customerName: "Jane",
      lessonTime: "2:00 PM",
      brandName: "Music School"
    };
    expect(interpolatePlaceholders(template, context)).toBe("Hi Jane, your lesson is at 2:00 PM with Music School.");
  });

  it("should handle missing context values gracefully", () => {
    const template = "Welcome to {{brandName}}!";
    const context = {};
    expect(interpolatePlaceholders(template, context)).toBe("Welcome to !");
  });

  it("should ignore malformed placeholders", () => {
    const template = "Hello {customerName} and {{userName}}";
    const context = { customerName: "John", userName: "Jane" };
    expect(interpolatePlaceholders(template, context)).toBe("Hello {customerName} and Jane");
  });
});
