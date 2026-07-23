import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OnboardingBanner } from "./OnboardingBanner";

// No jsdom in this repo — render to a static HTML string (pure node) and assert
// on it. The component renders in its initial (un-dismissed) state, so this
// exercises exactly the zero-vs-nonzero-predictions gate.

describe("OnboardingBanner", () => {
  it("renders for a brand-new user with zero predictions", () => {
    const html = renderToStaticMarkup(<OnboardingBanner hasAnyPrediction={false} />);
    expect(html).toContain("New here?");
    expect(html).toContain("/how-it-works");
    expect(html).toContain("/predictions/new");
  });

  it("renders nothing once the user has one or more predictions", () => {
    const html = renderToStaticMarkup(<OnboardingBanner hasAnyPrediction={true} />);
    expect(html).toBe("");
  });
});
