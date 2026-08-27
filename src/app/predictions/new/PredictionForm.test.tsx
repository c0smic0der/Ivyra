// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// The real Server Action touches Supabase/Drizzle — stub it so these tests exercise
// only client-side form behavior, never a real submission. The stub delegates to the
// REAL validateCreatePredictionInput (pure, no I/O) so the rejection tests below
// exercise the actual required-field rule end to end (fill → submit → see the error
// in the DOM), not just a statically-asserted schema call. Same stubbing approach as
// ResolutionHistory.filters.test.tsx.
vi.mock("./actions", async () => {
  const { validateCreatePredictionInput } = await import("@/lib/predictions/validation");
  return {
    createPrediction: async (_prevState: unknown, formData: FormData) => {
      const validated = validateCreatePredictionInput({
        decision: formData.get("decision"),
        criterion: formData.get("criterion"),
        reasoning: formData.get("reasoning"),
        planOrDisconfirm: formData.get("planOrDisconfirm"),
        confidencePercent: formData.get("confidencePercent"),
        resolutionDate: formData.get("resolutionDate"),
      });
      return validated.success ? {} : { fieldErrors: validated.fieldErrors };
    },
  };
});
// The track-record panel debounces a Server Action call keyed on the criterion
// text; stub it so no real call fires during these interactions.
vi.mock("./trackRecordAction", () => ({
  getTrackRecordPanel: async () => ({ kind: "none" }),
}));

import { PredictionForm } from "./PredictionForm";

afterEach(cleanup);

function fillValidDate(container: HTMLElement) {
  const dateInput = container.querySelector("#resolutionDate") as HTMLInputElement;
  fireEvent.change(dateInput, { target: { value: "2099-01-01" } });
}

describe("PredictionForm — capture requires both above-the-fold fields, independently", () => {
  it("rejects a whitespace-only decision while a valid criterion is untouched", async () => {
    const { container } = render(<PredictionForm />);
    fillValidDate(container);
    fireEvent.change(screen.getByLabelText(/what are you deciding/i), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText(/how will you know it went well/i), {
      target: { value: "They send an offer by Friday" },
    });
    fireEvent.submit(container.querySelector("form")!);

    const decisionField = screen.getByLabelText(/what are you deciding/i).closest("div")!;
    const criterionField = screen.getByLabelText(/how will you know it went well/i).closest("div")!;
    await within(decisionField).findByText(/this field is required/i);
    expect(within(criterionField).queryByText(/this field is required/i)).not.toBeInTheDocument();
  });

  it("rejects a whitespace-only criterion while a valid decision is untouched", async () => {
    const { container } = render(<PredictionForm />);
    fillValidDate(container);
    fireEvent.change(screen.getByLabelText(/what are you deciding/i), {
      target: { value: "I turn down the contract" },
    });
    fireEvent.change(screen.getByLabelText(/how will you know it went well/i), { target: { value: "   " } });
    fireEvent.submit(container.querySelector("form")!);

    const decisionField = screen.getByLabelText(/what are you deciding/i).closest("div")!;
    const criterionField = screen.getByLabelText(/how will you know it went well/i).closest("div")!;
    await within(criterionField).findByText(/this field is required/i);
    expect(within(decisionField).queryByText(/this field is required/i)).not.toBeInTheDocument();
  });

  it("rejects an empty decision", async () => {
    const { container } = render(<PredictionForm />);
    fillValidDate(container);
    fireEvent.change(screen.getByLabelText(/how will you know it went well/i), {
      target: { value: "They send an offer by Friday" },
    });
    fireEvent.submit(container.querySelector("form")!);

    const decisionField = screen.getByLabelText(/what are you deciding/i).closest("div")!;
    await within(decisionField).findByText(/this field is required/i);
  });

  it("succeeds with both fields filled, above-fold-only (no reasoning/plan)", async () => {
    const { container } = render(<PredictionForm />);
    fillValidDate(container);
    fireEvent.change(screen.getByLabelText(/what are you deciding/i), {
      target: { value: "I turn down the contract" },
    });
    fireEvent.change(screen.getByLabelText(/how will you know it went well/i), {
      target: { value: "They send an offer by Friday" },
    });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save prediction/i })).not.toBeDisabled();
    });
    expect(screen.queryByText(/this field is required/i)).not.toBeInTheDocument();
  });
});

describe("PredictionForm — planOrDisconfirm label, decisions-only capture", () => {
  it("always reads \"What's your plan?\" — every new entry is a decision (kindFor)", () => {
    const { container } = render(<PredictionForm />);
    const planLabel = container.querySelector('label[for="planOrDisconfirm"]')!;
    expect(planLabel.textContent).toMatch(/what's your plan\?/i);
  });
});

describe("PredictionForm — layout contract", () => {
  it("keeps reasoning and planOrDisconfirm optional so an above-fold-only save isn't client-blocked", () => {
    const { container } = render(<PredictionForm />);
    expect(screen.getByLabelText(/why do you think so/i)).not.toBeRequired();
    expect(container.querySelector("#planOrDisconfirm")).not.toBeRequired();
  });

  it("requires the above-the-fold fields, with §2.1's copy verbatim", () => {
    render(<PredictionForm />);
    const decision = screen.getByLabelText(/what are you deciding\?/i);
    const criterion = screen.getByLabelText(/how will you know it went well\?/i);
    expect(decision).toBeRequired();
    expect(criterion).toBeRequired();
    expect(screen.getByLabelText(/resolution date/i)).toBeRequired();
  });
});
