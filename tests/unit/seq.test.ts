import { describe, expect, it } from "vitest";
import { isSequenced } from "@/shared/events";
import { classifySeq, planResync, MAX_REPLAY } from "@/shared/seq";

describe("sequence / resync logic", () => {
  it("applies in-order events exactly once", () => {
    let last = 0;
    const applied: number[] = [];
    for (const seq of [1, 2, 2, 3, 1, 4, 4]) {
      if (classifySeq(last, seq) === "apply") {
        last = seq;
        applied.push(seq);
      }
    }
    expect(applied).toEqual([1, 2, 3, 4]);
  });
  it("detects gaps", () => {
    expect(classifySeq(5, 7)).toBe("gap");
    expect(classifySeq(5, 6)).toBe("apply");
    expect(classifySeq(5, 5)).toBe("duplicate");
    expect(classifySeq(0, 9)).toBe("apply");
  });
  it("plans the sync handshake", () => {
    expect(planResync(0, 10)).toBe("snapshot");
    expect(planResync(10, 10)).toBe("none");
    expect(planResync(7, 10)).toBe("replay");
    expect(planResync(50, 10)).toBe("snapshot"); // server lost state
    expect(planResync(1, MAX_REPLAY + 10)).toBe("snapshot");
    expect(planResync(Number.NaN, 3)).toBe("snapshot");
  });
  it("knows which events are sequenced", () => {
    expect(isSequenced("content_added")).toBe(true);
    expect(isSequenced("pointer_moved")).toBe(false);
    expect(isSequenced("reaction_batch")).toBe(false);
  });
});
