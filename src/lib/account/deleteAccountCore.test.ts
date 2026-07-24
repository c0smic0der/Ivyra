import { describe, expect, it, vi } from "vitest";
import { runAccountDeletion } from "./deleteAccountCore";

describe("runAccountDeletion — orchestration", () => {
  it("deletes application rows FIRST, then the auth login", async () => {
    const order: string[] = [];
    const deleteUserRows = vi.fn(async () => {
      order.push("rows");
      return { ai_calls: 2, insights: 1, user_stats: 1, predictions: 3 };
    });
    const deleteAuthUser = vi.fn(async () => {
      order.push("auth");
    });

    const result = await runAccountDeletion("user-1", { deleteUserRows, deleteAuthUser });

    expect(order).toEqual(["rows", "auth"]);
    expect(deleteUserRows).toHaveBeenCalledWith("user-1");
    expect(deleteAuthUser).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      rowsDeleted: { ai_calls: 2, insights: 1, user_stats: 1, predictions: 3 },
      authUserDeleted: true,
    });
  });

  it("does NOT touch the auth login when row deletion fails (no half-delete)", async () => {
    const deleteAuthUser = vi.fn(async () => {});
    const deleteUserRows = vi.fn(async () => {
      throw new Error("db unavailable");
    });

    await expect(runAccountDeletion("user-1", { deleteUserRows, deleteAuthUser })).rejects.toThrow(
      "db unavailable",
    );
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });

  it("propagates an auth-delete failure so the caller can surface it and retry", async () => {
    const deleteUserRows = vi.fn(async () => ({ predictions: 1 }));
    const deleteAuthUser = vi.fn(async () => {
      throw new Error("auth admin failed");
    });

    await expect(runAccountDeletion("user-1", { deleteUserRows, deleteAuthUser })).rejects.toThrow(
      "auth admin failed",
    );
  });
});
