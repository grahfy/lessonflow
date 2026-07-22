import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { jsonUnexpectedError } from "@/lib/api-errors";
import { chordDiagramDataSchema } from "@/lib/chords/chord-contract";
import { prisma } from "@/lib/db";
import { requireStudentFromRequest } from "@/lib/student-portal/session";

/**
 * Query params for GET /api/student/chords. `root`/`quality` are exact-match
 * dropdown filters (mirrors the `createChordInputSchema` field lengths in
 * chord-contract.ts); `search` is a free-text name search. `page`/`pageSize`
 * follow the same coercion pattern as listCustomersQuerySchema.
 */
const listStudentChordsQuerySchema = z.object({
  search: z.string().trim().max(50).optional(),
  root: z.string().trim().max(3).optional(),
  quality: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped well under chord-lookup.ts's 529+ bundled voicings so a browse
  // request can never pull the whole library in one response.
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

/**
 * Read-only chord list for the student chord browser (AC-1..AC-5, AC-11).
 * Every non-archived chord is visible to every authenticated student — there
 * is no per-student assignment and no per-student filter. GET-only by design:
 * no write handler exists here, and none should (chords/AGENTS.md documents
 * students as read-only on all chord data).
 *
 * Search/root/quality all filter inside the Prisma `where`, never by fetching
 * everything and filtering in JS, so lookups can use the existing
 * `@@index([root, quality, isArchived])` (and `@@index([isArchived, name])`
 * for the search term).
 */
export async function GET(request: NextRequest) {
  try {
    const student = await requireStudentFromRequest(request);
    if (!student) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = listStudentChordsQuerySchema.safeParse({
      search: request.nextUrl.searchParams.get("search") ?? undefined,
      root: request.nextUrl.searchParams.get("root") ?? undefined,
      quality: request.nextUrl.searchParams.get("quality") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { search, root, quality, page, pageSize } = parsed.data;
    const where = {
      isArchived: false,
      ...(root ? { root } : {}),
      ...(quality ? { quality } : {}),
      ...(search ? { name: { contains: search } } : {})
    };

    const [rows, total] = await Promise.all([
      prisma.chord.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, name: true, root: true, quality: true, diagram: true }
      }),
      prisma.chord.count({ where })
    ]);

    const chords = rows.map((row) => ({
      id: row.id,
      name: row.name,
      root: row.root,
      quality: row.quality,
      diagram: chordDiagramDataSchema.parse(row.diagram)
    }));

    return NextResponse.json({
      ok: true,
      chords,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    return jsonUnexpectedError(error, "Unable to load chords.");
  }
}
