import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// auth.logout was removed — Supabase handles sign-out client-side via supabase.auth.signOut().
// This file is kept as a placeholder; auth.me is tested instead.
describe("auth (Supabase)", () => {
  it("auth.me returns null for unauthenticated context", async () => {
    const ctx: TrpcContext = {
      user: null,
      supabaseUid: null,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("auth.me returns user for authenticated context", async () => {
    const user: AuthenticatedUser = {
      id: 1,
      supabaseId: "00000000-0000-0000-0000-000000000001",
      email: "sample@example.com",
      name: "Sample User",
      role: "user",
      hasSeenWelcome: false,
      membershipStatus: "free",
      membershipStartDate: null,
      membershipEndDate: null,
      stripeSubscriptionId: null,
      lastViewedByAdmin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const ctx: TrpcContext = {
      user,
      supabaseUid: "00000000-0000-0000-0000-000000000001",
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.id).toBe(1);
  });
});
