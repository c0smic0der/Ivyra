import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevPasswordSignIn, devSignInEnabled } from "./DevPasswordSignIn";

// Renders the same gate the sign-in modal uses: `devSignInEnabled() && <form/>`.
// In production the gate is false, so nothing renders and (in a real build) the
// component's code path is dead-code-eliminated from the client bundle.
function GatedDevSignIn() {
  return <>{devSignInEnabled() && <DevPasswordSignIn />}</>;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dev-only password sign-in", () => {
  it("is ABSENT from a production render (magic-link only in prod)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(devSignInEnabled()).toBe(false);
    expect(renderToStaticMarkup(<GatedDevSignIn />)).toBe("");
  });

  it("renders in development, wired to a password field", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(devSignInEnabled()).toBe(true);
    const html = renderToStaticMarkup(<GatedDevSignIn />);
    expect(html).toContain('type="password"');
    expect(html).toContain("Dev only");
  });

  it("is absent in the test/CI environment too (only 'development' enables it)", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(devSignInEnabled()).toBe(false);
    expect(renderToStaticMarkup(<GatedDevSignIn />)).toBe("");
  });
});
