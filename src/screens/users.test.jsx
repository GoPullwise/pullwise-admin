import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import { UsersScreen } from "./users.jsx";

vi.mock("../api/pullwise.js", () => ({
  pullwiseApi: {
    system: {
      listUsers: vi.fn(),
      resetUserQuota: vi.fn(),
      deleteUser: vi.fn(),
    },
  },
}));

describe("UsersScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullwiseApi.system.listUsers.mockResolvedValue({
      users: [
        {
          id: "usr_admin",
          name: "Admin User",
          email: "admin@example.com",
          admin: true,
          current: true,
          repositoryCount: 1,
          scanCount: 3,
          issueCount: 2,
          quota: { scope: "user", used: 1, reserved: 0, limit: 70, remaining: 69 },
          subscription: {
            provider: "creem",
            status: "active",
            plan: "pro",
            effectivePlan: "pro",
            interval: "year",
            currentPeriodEnd: 4102444800,
          },
        },
        {
          id: "usr_user",
          name: "Authorized User",
          email: "user@example.com",
          githubLogin: "authorized",
          repositoryCount: 2,
          scanCount: 4,
          issueCount: 5,
          quota: { scope: "user", used: 4, reserved: 1, limit: 90, remaining: 85 },
          subscription: {
            provider: "creem",
            status: "active",
            plan: "max",
            effectivePlan: "max",
            interval: "month",
            currentPeriodEnd: 4102444800,
          },
        },
      ],
    });
    pullwiseApi.system.resetUserQuota.mockResolvedValue({
      reset: true,
      quota: { scope: "user", used: 0, reserved: 0, limit: 90, remaining: 90 },
      user: {
        id: "usr_user",
        name: "Authorized User",
        email: "user@example.com",
        githubLogin: "authorized",
        repositoryCount: 2,
        scanCount: 4,
        issueCount: 5,
        quota: { scope: "user", used: 0, reserved: 0, limit: 90, remaining: 90 },
        subscription: {
          provider: "creem",
          status: "active",
          plan: "max",
          effectivePlan: "max",
          interval: "month",
          currentPeriodEnd: 4102444800,
        },
      },
    });
    pullwiseApi.system.deleteUser.mockResolvedValue({ deleted: true });
  });

  it("lists authorized users and disables deleting the current admin", async () => {
    render(<UsersScreen />);

    expect(await screen.findByText("Admin User")).toBeInTheDocument();
    expect(await screen.findByText("Authorized User")).toBeInTheDocument();
    expect(screen.getByText("Pro Active")).toBeInTheDocument();
    expect(screen.getByText("Max Active")).toBeInTheDocument();
    expect(screen.getByText(/Yearly/)).toBeInTheDocument();
    expect(screen.getByText(/Monthly/)).toBeInTheDocument();
    expect(screen.getByText("Quota 4/90 used, 1 reserved")).toBeInTheDocument();
    expect(screen.getByText("2 repos")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /delete user/i })[0]).toBeDisabled();
  });

  it("does not show an empty user state when loading users fails", async () => {
    pullwiseApi.system.listUsers.mockRejectedValueOnce(new Error("users down"));

    render(<UsersScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent("users down");
    expect(screen.queryByText("No authorized users found.")).not.toBeInTheDocument();
  });

  it("resets a user quota from the row action", async () => {
    const user = userEvent.setup();
    render(<UsersScreen />);

    await screen.findByText("Authorized User");
    await user.click(screen.getAllByRole("button", { name: /reset quota/i })[1]);

    await waitFor(() => expect(pullwiseApi.system.resetUserQuota).toHaveBeenCalledWith("usr_user"));
    expect(screen.getByText("Quota 0/90 used")).toBeInTheDocument();
    expect(screen.queryByText("Quota 4/90 used, 1 reserved")).not.toBeInTheDocument();
    expect(screen.getByText(/user quota was reset/i)).toBeInTheDocument();
  });

  it("deletes a user after confirmation", async () => {
    const user = userEvent.setup();
    render(<UsersScreen />);

    await screen.findByText("Authorized User");
    const buttons = screen.getAllByRole("button", { name: /delete user/i });
    await user.click(buttons.find((button) => !button.disabled));
    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => expect(pullwiseApi.system.deleteUser).toHaveBeenCalledWith("usr_user"));
    expect(screen.queryByText("Authorized User")).not.toBeInTheDocument();
    expect(screen.getByText(/related pullwise records were deleted/i)).toBeInTheDocument();
  });

  it("coalesces same-frame user deletion confirmations", async () => {
    const user = userEvent.setup();
    let resolveDelete;
    pullwiseApi.system.deleteUser.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );
    render(<UsersScreen />);

    await screen.findByText("Authorized User");
    await user.click(screen.getAllByRole("button", { name: /delete user/i }).find((button) => !button.disabled));
    const confirm = screen.getByRole("button", { name: /confirm delete/i });
    act(() => {
      confirm.click();
      confirm.click();
    });

    expect(pullwiseApi.system.deleteUser).toHaveBeenCalledTimes(1);
    await act(async () => resolveDelete({ deleted: true }));
  });

  it("coalesces same-frame user refreshes", async () => {
    render(<UsersScreen />);
    await screen.findByText("Authorized User");
    let resolveUsers;
    pullwiseApi.system.listUsers.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUsers = resolve;
      })
    );

    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    act(() => {
      refresh.click();
      refresh.click();
    });

    expect(pullwiseApi.system.listUsers).toHaveBeenCalledTimes(2);
    await act(async () => resolveUsers({ users: [] }));
  });
});
