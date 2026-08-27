// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// The real Server Action touches Supabase/Drizzle — stub it so these tests
// exercise only client-side behavior (what gets sent, what renders), never a
// real submission. Never resolving the promise keeps the component in its
// "open" state, so the post-save branch (which renders next/link) never
// mounts and needs no router mocking.
const resolvePredictionMock = vi.fn((input: unknown) => {
  void input;
  return new Promise(() => {});
});
vi.mock("./actions", () => ({
  resolvePrediction: (input: unknown) => resolvePredictionMock(input),
}));

import { ResolveClient } from "./ResolveClient";

afterEach(() => {
  cleanup();
  resolvePredictionMock.mockClear();
});

describe("ResolveClient — subjective layer is decision-gated (docs/06-decision-layer.md §2.2)", () => {
  it("renders nothing of the subjective section for a legacy forecast row (decision null)", () => {
    render(<ResolveClient id="pred-1" hasDecision={false} />);

    expect(screen.queryByText(/knowing what you know now/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Stand by it")).not.toBeInTheDocument();
    expect(screen.queryByText("Mixed")).not.toBeInTheDocument();
    expect(screen.queryByText("Wouldn't again")).not.toBeInTheDocument();
  });

  it("renders the heading, free-text reflection, and three stance options for a decision entry", () => {
    render(<ResolveClient id="pred-1" hasDecision={true} />);

    expect(
      screen.getByText("Knowing what you know now — was this the decision you wanted to have made?"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("As much or as little as you like.")).toHaveLength(2);
    expect(screen.getByLabelText(/knowing what you know now/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stand by it" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mixed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wouldn't again" })).toBeInTheDocument();
  });

  it("a stance button is optional and one-tap toggles: clicking again deselects", () => {
    render(<ResolveClient id="pred-1" hasDecision={true} />);
    const standBy = screen.getByRole("button", { name: "Stand by it" });

    expect(standBy).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(standBy);
    expect(standBy).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(standBy);
    expect(standBy).toHaveAttribute("aria-pressed", "false");
  });

  it("neither field gates the Save button — it's enabled once a verdict is picked, with no reflection or stance", () => {
    render(<ResolveClient id="pred-1" hasDecision={true} />);
    const save = screen.getByRole("button", { name: /save/i });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(save).not.toBeDisabled();
  });

  it("persists the verdict, outcome note, reflection, and stance together in one call", () => {
    render(<ResolveClient id="pred-1" hasDecision={true} />);

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    fireEvent.change(screen.getByLabelText(/how did it actually go/i), {
      target: { value: "It closed a week early." },
    });
    fireEvent.change(screen.getByLabelText(/knowing what you know now/i), {
      target: { value: "Still the read I'd make." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Stand by it" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(resolvePredictionMock).toHaveBeenCalledWith({
      id: "pred-1",
      choice: "yes",
      outcomeNote: "It closed a week early.",
      reflection: "Still the read I'd make.",
      stance: "stand_by",
    });
  });

  it("omits stance when none was tapped, sending an empty-string reflection rather than undefined", () => {
    render(<ResolveClient id="pred-1" hasDecision={true} />);
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(resolvePredictionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ reflection: "", stance: undefined }),
    );
  });

  it("never sends reflection or stance for a legacy row, even though a verdict alone is enough to save", () => {
    render(<ResolveClient id="pred-2" hasDecision={false} />);
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(resolvePredictionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ reflection: undefined, stance: undefined }),
    );
  });
});
