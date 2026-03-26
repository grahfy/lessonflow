import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

/**
 * Converts a plain text string into a TipTap ProseMirror JSON document.
 * Splits on newlines to create separate paragraphs. Empty strings produce
 * an empty doc.
 */
function textToTipTapDoc(text: string): TipTapDoc {
  const trimmed = text.trim();
  if (!trimmed) {
    return { type: "doc", content: [] };
  }

  const paragraphs = trimmed.split(/\n/).map((line): TipTapNode => {
    if (!line) {
      return { type: "paragraph" };
    }
    return {
      type: "paragraph",
      content: [{ type: "text", text: line }],
    };
  });

  return { type: "doc", content: paragraphs };
}

/**
 * Converts a plain text string into a TipTap doc, embedding material links
 * as marks on the appropriate text ranges.
 */
function textToTipTapDocWithLinks(
  text: string,
  links: MaterialLinkRow[]
): TipTapDoc {
  const trimmed = text.trim();
  if (!trimmed) {
    return { type: "doc", content: [] };
  }

  if (links.length === 0) {
    return textToTipTapDoc(trimmed);
  }

  // Split text into lines first, tracking character offsets per line.
  const lines = trimmed.split("\n");
  const paragraphs: TipTapNode[] = [];
  let lineStart = 0;

  for (const line of lines) {
    const lineEnd = lineStart + line.length;

    // Find links that fall within this line.
    const lineLinks = links
      .filter((l) => l.startOffset < lineEnd && l.endOffset > lineStart)
      .map((l) => ({
        ...l,
        // Clamp to line boundaries and adjust to line-relative offsets.
        startOffset: Math.max(0, l.startOffset - lineStart),
        endOffset: Math.min(line.length, l.endOffset - lineStart),
      }))
      .sort((a, b) => a.startOffset - b.startOffset);

    if (!line) {
      paragraphs.push({ type: "paragraph" });
    } else if (lineLinks.length === 0) {
      paragraphs.push({
        type: "paragraph",
        content: [{ type: "text", text: line }],
      });
    } else {
      // Build text nodes with materialLink marks at link positions.
      const content: TipTapNode[] = [];
      let cursor = 0;

      for (const link of lineLinks) {
        // Plain text before this link.
        if (link.startOffset > cursor) {
          content.push({
            type: "text",
            text: line.slice(cursor, link.startOffset),
          });
        }

        // Linked text with materialLink mark.
        const linkedText = line.slice(link.startOffset, link.endOffset);
        if (linkedText) {
          content.push({
            type: "text",
            text: linkedText,
            marks: [
              {
                type: "materialLink",
                attrs: { materialId: link.materialId },
              },
            ],
          });
        }

        cursor = link.endOffset;
      }

      // Remaining text after last link.
      if (cursor < line.length) {
        content.push({ type: "text", text: line.slice(cursor) });
      }

      paragraphs.push({
        type: "paragraph",
        content: content.length > 0 ? content : undefined,
      });
    }

    // +1 for the newline character.
    lineStart = lineEnd + 1;
  }

  return { type: "doc", content: paragraphs };
}

interface TipTapDoc {
  type: "doc";
  content: TipTapNode[];
}

interface TipTapNode {
  type: string;
  text?: string;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
}

interface MaterialLinkRow {
  materialId: string;
  fieldKey: string;
  startOffset: number;
  endOffset: number;
  linkedText: string;
}

interface Section {
  key: string;
  title: string;
  visibility: "student_visible" | "teacher_only";
  content: TipTapDoc;
}

const SECTION_DEFS: ReadonlyArray<{
  key: string;
  title: string;
  visibility: "student_visible" | "teacher_only";
}> = [
  { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible" },
  { key: "goals", title: "Goals", visibility: "student_visible" },
  { key: "activities", title: "Activities", visibility: "teacher_only" },
  { key: "homework", title: "Homework", visibility: "student_visible" },
  { key: "sharedNotes", title: "Shared Notes", visibility: "student_visible" },
  { key: "privateNotes", title: "Private Notes", visibility: "teacher_only" },
];

async function migrate() {
  const adapter = new PrismaMariaDb(connectionString!);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("Starting lesson plan TipTap migration...\n");

    // ── Templates ──────────────────────────────────────────────
    const templates = await prisma.lessonPlanTemplate.findMany({
      where: { sections: { equals: Prisma.DbNull } },
    });
    console.log(`Found ${templates.length} templates to migrate.`);

    let templateOk = 0;
    let templateFail = 0;
    for (const tpl of templates) {
      try {
        const sections: Section[] = SECTION_DEFS.map((def) => ({
          key: def.key,
          title: def.title,
          visibility: def.visibility,
          content: textToTipTapDoc(
            (tpl as unknown as Record<string, string>)[def.key] ?? ""
          ),
        }));

        await prisma.lessonPlanTemplate.update({
          where: { id: tpl.id },
          data: {
            sections: JSON.parse(JSON.stringify(sections)),
          },
        });
        templateOk++;
      } catch (err) {
        templateFail++;
        console.error(`  FAIL template ${tpl.id}: ${err}`);
      }
    }
    console.log(
      `  Templates: ${templateOk} migrated, ${templateFail} failed.\n`
    );

    // ── Lesson Plans ───────────────────────────────────────────
    const plans = await prisma.lessonPlan.findMany({
      where: { sections: { equals: Prisma.DbNull } },
    });
    console.log(`Found ${plans.length} lesson plans to migrate.`);

    let planOk = 0;
    let planFail = 0;
    for (const plan of plans) {
      try {
        // Fetch material links for this plan.
        const materialLinks = await prisma.lessonPlanMaterialLink.findMany({
          where: { lessonPlanId: plan.id },
          orderBy: [
            { fieldKey: "asc" },
            { startOffset: "asc" },
            { endOffset: "asc" },
          ],
        });

        // Group material links by field key.
        const linksByField = new Map<string, MaterialLinkRow[]>();
        for (const link of materialLinks) {
          const existing = linksByField.get(link.fieldKey) ?? [];
          existing.push(link);
          linksByField.set(link.fieldKey, existing);
        }

        const sections: Section[] = SECTION_DEFS.map((def) => {
          const fieldText =
            (plan as unknown as Record<string, string>)[def.key] ?? "";
          const fieldLinks = linksByField.get(def.key) ?? [];

          return {
            key: def.key,
            title: def.title,
            visibility: def.visibility,
            content:
              fieldLinks.length > 0
                ? textToTipTapDocWithLinks(fieldText, fieldLinks)
                : textToTipTapDoc(fieldText),
          };
        });

        await prisma.lessonPlan.update({
          where: { id: plan.id },
          data: {
            sections: JSON.parse(JSON.stringify(sections)),
            status: "complete",
          },
        });
        planOk++;
      } catch (err) {
        planFail++;
        console.error(`  FAIL plan ${plan.id}: ${err}`);
      }
    }
    console.log(
      `  Lesson plans: ${planOk} migrated, ${planFail} failed.\n`
    );

    console.log("Migration complete.");
    if (templateFail > 0 || planFail > 0) {
      console.log(
        `WARNING: ${templateFail + planFail} item(s) failed. Review errors above.`
      );
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
