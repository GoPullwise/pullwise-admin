import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import { UsersScreen } from "./users.jsx";

vi.mock("../api/pullwise.js", () => ({
  pullwiseApi: {
    system: {
      listUsers: vi.fn(),
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
    expect(screen.getByText("2 repos")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /delete user/i })[0]).toBeDisabled();
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
});
