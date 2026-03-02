import { prisma } from "@/lib/db";

/**
 * Fetches dynamic content for a specific page section from the database.
 * 
 * @param pagePath - The URL path of the page (e.g. "/")
 * @param sectionKey - The unique key for the section (e.g. "hero")
 * @param fallback - The default content to return if no DB record exists
 */
export async function getContent<T>(
  pagePath: string,
  sectionKey: string,
  fallback: T
): Promise<T> {
  const record = await prisma.publicPageContent.findUnique({
    where: {
      pagePath_sectionKey: {
        pagePath,
        sectionKey
      }
    }
  });

  if (!record || !record.content) {
    return fallback;
  }

  // Merge database content with fallback to ensure all required fields exist
  return {
    ...fallback,
    ...(record.content as object)
  } as T;
}
