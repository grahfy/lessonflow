import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getContent } from "@/lib/cms";

describe("CMS Content Retrieval", () => {
  beforeEach(async () => {
    await prisma.publicPageContent.deleteMany();
  });

  it("should return fallback content when no DB record exists", async () => {
    const fallback = { title: "Default Title", lead: "Default Lead" };
    const content = await getContent("/", "hero", fallback);
    expect(content).toEqual(fallback);
  });

  it("should return merged content when DB record exists", async () => {
    const fallback = { title: "Default Title", lead: "Default Lead", extra: "Keep Me" };
    
    await prisma.publicPageContent.create({
      data: {
        pagePath: "/",
        sectionKey: "hero",
        content: { title: "Custom Title", lead: "Custom Lead" }
      }
    });

    const content = await getContent("/", "hero", fallback);
    expect(content).toEqual({
      title: "Custom Title",
      lead: "Custom Lead",
      extra: "Keep Me"
    });
  });
});
