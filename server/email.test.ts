import { describe, expect, it } from "vitest";
import { sendEmail } from "./_core/email";

describe("Email service", () => {
  it("should successfully send a test email with valid API key", async () => {
    // This test validates that the RESEND_API_KEY is configured correctly
    // We send a test email to verify the API key works
    
    const result = await sendEmail({
      to: "test@resend.dev", // Resend's test email address
      subject: "Test Email - API Key Validation",
      html: "<p>This is a test email to validate the Resend API key configuration.</p>",
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  }, 10000); // 10 second timeout for API call
});
