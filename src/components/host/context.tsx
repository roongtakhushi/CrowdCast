"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { isApiError } from "@/lib/socket";
import type { ActionInput, ActionResult } from "@/shared/schemas";

interface HostCtx {
  code: string;
  token: string;
  send: (a: ActionInput) => Promise<ActionResult>;
  /** Send with error toast; resolves to undefined on failure. */
  run: (a: ActionInput, successMessage?: string) => Promise<ActionResult | undefined>;
}

const Ctx = createContext<HostCtx | null>(null);

export function HostProvider({
  code,
  token,
  send,
  children,
}: {
  code: string;
  token: string;
  send: HostCtx["send"];
  children: ReactNode;
}) {
  const run = useCallback<HostCtx["run"]>(
    async (a, msg) => {
      try {
        const r = await send(a);
        if (msg) toast.success(msg);
        return r;
      } catch (e) {
        toast.error(isApiError(e) ? e.message : "Action failed");
        return undefined;
      }
    },
    [send],
  );
  const value = useMemo(() => ({ code, token, send, run }), [code, token, send, run]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHost(): HostCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHost outside HostProvider");
  return v;
}
