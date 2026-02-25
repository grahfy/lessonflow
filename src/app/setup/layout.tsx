import type { PropsWithChildren } from "react";

import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

/**
 * First-run setup is internal operational UI and must stay out of search indexes.
 */
export default function SetupLayout({ children }: PropsWithChildren) {
  return children;
}
