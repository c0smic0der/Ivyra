import { describe, expect, it } from "vitest";
import manifest from "./manifest";

// PWA installability is shelved (docs/04 §6). The manifest is kept only to carry
// theme_color / name for the browser; it must NOT advertise an installable icon
// set or a standalone display, or browsers will re-offer installation.
describe("web app manifest", () => {
  const m = manifest();

  it("does not declare icons (installability de-listed)", () => {
    expect(m.icons).toBeUndefined();
  });

  it("uses browser display, not standalone", () => {
    expect(m.display).toBe("browser");
  });

  it("still carries the brand metadata browsers read", () => {
    expect(m.name).toBe("Ivyra");
    expect(m.theme_color).toBe("#4f46e5");
  });
});
