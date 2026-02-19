import type { Metadata } from "next";
import { PropsWithChildren } from "react";

import { MotionProvider } from "@/components/motion/tween-orchestrator";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Melbourne Guitar School",
  description: "Modern guitar lessons in Northcote for beginners through advanced players."
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
