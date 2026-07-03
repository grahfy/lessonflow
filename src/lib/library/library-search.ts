/**
 * Shared-Library Search Query Builder
 *
 * Pure helper that translates the admin Library's faceted filters + free-text
 * query into a Prisma `where` clause. This is the single contract for AC3/AC3b:
 *
 *  - Values selected WITHIN one category are OR-combined (a `value: { in: [...] }`
 *    existence probe): picking `80s` and `90s` under Decade widens to items in
 *    EITHER decade — the natural meaning of ticking two chips in one facet group.
 *  - Categories are AND-combined: one independent `tags.some` probe per selected
 *    category, so an item must carry a matching tag in EVERY selected category
 *    (set INTERSECTION across categories, union within one).
 *  - The free-text `q` is nested as a DISCRETE AND element alongside the
 *    category clauses. It matches the title OR the `Artist` tag value, but it
 *    can only ever NARROW within the category intersection — a title/artist
 *    text match must NEVER widen the result set past the selected facets.
 *
 * Because every constraint is a sibling inside a single top-level `AND`, there
 * is no top-level `OR` that could bypass the facet intersection.
 */

import type { Prisma } from "@/generated/prisma/client";

export type LibraryTagFilter = {
  category: string;
  value: string;
};

export type LibrarySearchInput = {
  tagFilters: LibraryTagFilter[];
  q?: string;
};

/**
 * Escapes SQL `LIKE` wildcards so a literal query is matched literally.
 *
 * Prisma's `contains` compiles to a parameterized `LIKE '%…%'`; the value is
 * safely bound (no injection), but `%` and `_` inside it are still treated as
 * wildcards. We escape them (and the `\` escape char itself) so a search for
 * `50%` matches the literal text rather than "50 followed by anything".
 */
function escapeLikeWildcards(value: string): string {
  // Single pass over `\`, `%`, and `_` — matching one char at a time means the
  // backslash branch can't double-escape a wildcard's own escape prefix.
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Builds the Prisma `where` for a Library list/search query.
 *
 * @returns `{}` when there are no facets and no query (match all items);
 *   otherwise `{ AND: [...] }` where each element is one independent constraint.
 */
export function buildLibrarySearchWhere(input: LibrarySearchInput): Prisma.LibraryItemWhereInput {
  const tagFilters = input.tagFilters ?? [];
  const q = input.q?.trim();

  // Group selected values under their category, preserving first-seen order and
  // de-duplicating, so each category yields exactly one existence probe.
  const valuesByCategory = new Map<string, string[]>();
  for (const { category, value } of tagFilters) {
    const values = valuesByCategory.get(category);
    if (values) {
      if (!values.includes(value)) values.push(value);
    } else {
      valuesByCategory.set(category, [value]);
    }
  }

  // One existence probe per selected category → logical AND across categories.
  // Within a category, multiple values OR together via `value: { in: [...] }`;
  // a single value stays a plain equality probe.
  const categoryTagClauses: Prisma.LibraryItemWhereInput[] = [];
  for (const [category, values] of valuesByCategory) {
    const valueMatch: Prisma.StringFilter | string = values.length === 1 ? values[0] : { in: values };
    categoryTagClauses.push({
      tags: {
        some: {
          tag: { category, value: valueMatch }
        }
      }
    });
  }

  const andClauses: Prisma.LibraryItemWhereInput[] = [...categoryTagClauses];

  if (q) {
    // Free-text is a single AND element: title OR Artist-tag value. Nesting the
    // OR here (rather than at the top level) keeps it scoped WITHIN the category
    // intersection — it can only narrow, never widen (AC3b). Wildcards in the
    // query are escaped so `%`/`_` match literally.
    const pattern = escapeLikeWildcards(q);
    andClauses.push({
      OR: [
        { title: { contains: pattern } },
        {
          tags: {
            some: {
              tag: { category: "Artist", value: { contains: pattern } }
            }
          }
        }
      ]
    });
  }

  if (andClauses.length === 0) {
    return {};
  }

  return { AND: andClauses };
}
