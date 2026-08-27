// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// The real Server Action touches Supabase/Drizzle — stub it so these tests exercise
// only client-side form state (the auto-mirror machine and the live label), never a
// real submission. Same stubbing approach as ResolutionHistory.filters.test.tsx.
vi.mock("./actions", () => ({
  createPrediction: async () => ({}),
}));
// The track-record panel debounces a Server Action call keyed on the criterion
// text; stub it so no real call fires during these interactions.
vi.mock("./trackRecordAction", () => ({
  getTrackRecordPanel: async () => ({ kind: "none" }),
}));

import { PredictionForm } from "./PredictionForm";

afterEach(cleanup);

describe("PredictionForm — auto-mirror between decisionOrClaim and criterion", () => {
  it("engages: typing into the first field propagates to the second while mirrored", () => {
    render(<PredictionForm />);
    const decisionInput = screen.getByLabelText(/what are you deciding, or what do you expect/i);
    const criterionInput = screen.getByLabelText(/how will you know it went well/i);

    fireEvent.change(decisionInput, { target: { value: "I move to Denver" } });
    expect(criterionInput).toHaveValue("I move to Denver");

    fireEvent.change(decisionInput, { target: { value: "I move to Denver this fall" } });
    expect(criterionInput).toHaveValue("I move to Denver this fall");
  });

  it("breaks permanently once the second field is edited directly", () => {
    render(<PredictionForm />);
    const decisionInput = screen.getByLabelText(/what are you deciding, or what do you expect/i);
    const criterionInput = screen.getByLabelText(/how will you know it went well/i);

    fireEvent.change(decisionInput, { target: { value: "I move to Denver" } });
    expect(criterionInput).toHaveValue("I move to Denver");

    // Editing the second field directly breaks the link.
    fireEvent.change(criterionInput, { target: { value: "I sign a lease within 60 days" } });
    expect(criterionInput).toHaveValue("I sign a lease within 60 days");

    // Further edits to the first field no longer touch the second.
    fireEvent.change(decisionInput, { target: { value: "I move to Denver and buy a car" } });
    expect(decisionInput).toHaveValue("I move to Denver and buy a car");
    expect(criterionInput).toHaveValue("I sign a lease within 60 days");
  });
});

describe("PredictionForm — planOrDisconfirm label follows kindFor live", () => {
  it("switches to the decision label as decisionOrClaim fills, and back as it clears", () => {
    const { container } = render(<PredictionForm initialKind="world" />);
    const decisionInput = screen.getByLabelText(/what are you deciding, or what do you expect/i);
    const planLabel = () => container.querySelector('label[for="planOrDisconfirm"]')!;

    // Starts on the world branch (no decision typed yet).
    expect(planLabel().textContent).toMatch(/what would change your mind\?/i);

    fireEvent.change(decisionInput, { target: { value: "I turn down the offer" } });
    expect(planLabel().textContent).toMatch(/what's your plan\?/i);

    fireEvent.change(decisionInput, { target: { value: "" } });
    expect(planLabel().textContent).toMatch(/what would change your mind\?/i);
  });
});

describe("PredictionForm — layout contract", () => {
  it("keeps reasoning and planOrDisconfirm optional so an above-fold-only save isn't client-blocked", () => {
    const { container } = render(<PredictionForm />);
    expect(screen.getByLabelText(/why do you think so/i)).not.toBeRequired();
    expect(container.querySelector("#planOrDisconfirm")).not.toBeRequired();
  });

  it("requires the four above-the-fold fields", () => {
    render(<PredictionForm />);
    expect(screen.getByLabelText(/what are you deciding, or what do you expect/i)).toBeRequired();
    expect(screen.getByLabelText(/how will you know it went well/i)).toBeRequired();
    expect(screen.getByLabelText(/resolution date/i)).toBeRequired();
  });
});
