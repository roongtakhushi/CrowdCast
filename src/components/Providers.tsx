"use client";

import { MotionConfig } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { useUi } from "@/stores/ui";

export function Providers({ children }: { children: ReactNode }) {
  const theme = useUi((s) => s.theme);
  const init = useUi((s) => s.init);
  useEffect(() => init(), [init]);
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster theme={theme} position="top-center" richColors closeButton toastOptions={{ className: "font-sans" }} />
    </MotionConfig>
  );
}
