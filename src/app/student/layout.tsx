import type { PropsWithChildren } from "react";

import { noIndexMetadata } from "@/lib/seo";
import { StudentAutoLogout } from "@/components/student-auto-logout";

export const metadata = noIndexMetadata;

/**
 * Student portal/login/materials are authenticated surfaces and should not be indexed.
 */
export default function StudentLayout({ children }: PropsWithChildren) {
  return (
    <>
      <StudentAutoLogout />
      {children}
    </>
  );
}
