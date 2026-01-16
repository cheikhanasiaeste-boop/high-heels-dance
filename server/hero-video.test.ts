import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Hero Video Settings", () => {
  it("should allow admin to set hero video URL", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const testVideoUrl = "https://example.com/dance-video.mp4";

    // Set the hero video URL
    const result = await caller.admin.settings.update({
      key: "heroVideoUrl",
      value: testVideoUrl,
    });

    expect(result).toEqual({ success: true });

    // Verify it was saved
    const savedValue = await caller.admin.settings.get({ key: "heroVideoUrl" });
    expect(savedValue).toBe(testVideoUrl);
  });

  it("should allow admin to remove hero video", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // First set a video
    await caller.admin.settings.update({
      key: "heroVideoUrl",
      value: "https://example.com/video.mp4",
    });

    // Then remove it
    await caller.admin.settings.update({
      key: "heroVideoUrl",
      value: "",
    });

    // Verify it was removed
    const savedValue = await caller.admin.settings.get({ key: "heroVideoUrl" });
    expect(savedValue).toBe("");
  });

  it("should return null for non-existent settings", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.admin.settings.get({ key: "nonExistentKey" });
    expect(result).toBeNull();
  });
});
