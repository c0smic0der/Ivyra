import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS_SEEN_KEY, readSeen, writeSeen } from "./howItWorksSeen";

// A minimal in-memory Storage stand-in, so the pure core can be exercised in the
// node environment without jsdom.
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => map.delete(k),
    setItem: (k: string, v: string) => map.set(k, v),
  };
}

// A Storage whose access always throws — models private mode / disabled storage.
function throwingStorage(): Storage {
  const boom = () => {
    throw new Error("storage disabled");
  };
  return {
    length: 0,
    clear: boom,
    getItem: boom,
    key: () => null,
    removeItem: boom,
    setItem: boom,
  };
}

describe("readSeen — defaults to skipping, never looping", () => {
  it("treats missing storage (SSR) as seen", () => {
    expect(readSeen(null)).toBe(true);
    expect(readSeen(undefined)).toBe(true);
  });

  it("returns false for a fresh (empty) storage — the user has not seen it", () => {
    expect(readSeen(fakeStorage())).toBe(false);
  });

  it("returns true once the flag is set to '1'", () => {
    expect(readSeen(fakeStorage({ [HOW_IT_WORKS_SEEN_KEY]: "1" }))).toBe(true);
  });

  it("returns false for any non-'1' value", () => {
    expect(readSeen(fakeStorage({ [HOW_IT_WORKS_SEEN_KEY]: "0" }))).toBe(false);
    expect(readSeen(fakeStorage({ [HOW_IT_WORKS_SEEN_KEY]: "true" }))).toBe(false);
  });

  it("treats a throwing storage as seen (skip, never loop)", () => {
    expect(readSeen(throwingStorage())).toBe(true);
  });
});

describe("writeSeen", () => {
  it("records the flag as '1', making a later read return true", () => {
    const storage = fakeStorage();
    writeSeen(storage);
    expect(storage.getItem(HOW_IT_WORKS_SEEN_KEY)).toBe("1");
    expect(readSeen(storage)).toBe(true);
  });

  it("is a no-op on missing storage and does not throw", () => {
    expect(() => writeSeen(null)).not.toThrow();
    expect(() => writeSeen(undefined)).not.toThrow();
  });

  it("swallows a throwing storage without propagating", () => {
    expect(() => writeSeen(throwingStorage())).not.toThrow();
  });
});
