/**
 * Sequence / resync logic shared by server and client.
 *
 * Every state-changing broadcast carries a per-room, monotonically
 * increasing `seq`. The client remembers the last seq it applied.
 */
export type SeqVerdict = "apply" | "duplicate" | "gap";

/** Decide what a client should do with an incoming sequenced event. */
export function classifySeq(lastSeq: number, incoming: number): SeqVerdict {
  if (incoming <= lastSeq) return "duplicate";
  if (incoming === lastSeq + 1) return "apply";
  // lastSeq === 0 means "nothing yet": snapshot will establish the baseline.
  return lastSeq === 0 ? "apply" : "gap";
}

export type ResyncPlan = "snapshot" | "replay" | "none";

export const MAX_REPLAY = 500;

/**
 * Server-side: how should a (re)connecting client be brought up to date?
 *  - snapshot: first join, impossible lastSeq (server lost state) or too far behind
 *  - replay:   send only the missed events from event_log (lastSeq, currentSeq]
 *  - none:     client is already current
 */
export function planResync(lastSeq: number, currentSeq: number, maxReplay = MAX_REPLAY): ResyncPlan {
  if (!Number.isFinite(lastSeq) || lastSeq <= 0) return "snapshot";
  if (lastSeq > currentSeq) return "snapshot";
  if (lastSeq === currentSeq) return "none";
  if (currentSeq - lastSeq > maxReplay) return "snapshot";
  return "replay";
}
