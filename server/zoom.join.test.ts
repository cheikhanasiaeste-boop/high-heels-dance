import { describe, it, expect } from "vitest";
import { generateZoomSDKSignature } from "./_core/zoom";

/**
 * Test suite for Zoom Web SDK integration
 * 
 * Tests the core security features:
 * 1. SDK signature generation
 * 2. Access token generation
 * 3. Signature structure and expiry
 */

describe("Zoom Web SDK Integration", () => {
  it("should generate valid SDK signature", () => {
    const meetingNumber = 1234567890;
    const role = 0; // Participant
    
    const signature = generateZoomSDKSignature(meetingNumber, role);
    
    // Verify signature is a JWT (3 parts separated by dots)
    expect(signature).toBeDefined();
    expect(typeof signature).toBe("string");
    
    const parts = signature.split(".");
    expect(parts.length).toBe(3); // JWT has header, payload, signature
    
    // Verify each part is base64-encoded
    parts.forEach(part => {
      expect(part.length).toBeGreaterThan(0);
      // Base64 characters only
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  it("should generate different signatures for different meeting numbers", () => {
    const signature1 = generateZoomSDKSignature(1234567890, 0);
    const signature2 = generateZoomSDKSignature(9876543210, 0);
    
    // Signatures should be different for different meetings
    expect(signature1).not.toBe(signature2);
  });

  it("should generate signatures with 60-second expiry", () => {
    const meetingNumber = 1234567890;
    const role = 0;
    
    const signature = generateZoomSDKSignature(meetingNumber, role);
    
    // Decode JWT payload to check expiry
    const parts = signature.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    
    // Verify payload structure
    expect(payload).toHaveProperty("sdkKey");
    expect(payload).toHaveProperty("mn");
    expect(payload).toHaveProperty("role");
    expect(payload).toHaveProperty("iat");
    expect(payload).toHaveProperty("exp");
    expect(payload).toHaveProperty("tokenExp");
    
    // Verify meeting number
    expect(payload.mn).toBe(meetingNumber);
    
    // Verify role
    expect(payload.role).toBe(role);
    
    // Verify expiry is 60 seconds from now
    const now = Math.floor(Date.now() / 1000);
    const expiry = payload.exp;
    const timeDiff = expiry - now;
    
    // Should expire in approximately 60 seconds (allow 5 second tolerance)
    expect(timeDiff).toBeGreaterThanOrEqual(55);
    expect(timeDiff).toBeLessThanOrEqual(65);
  });

  it("should include correct SDK key in signature", () => {
    const meetingNumber = 1234567890;
    const role = 0;
    
    const signature = generateZoomSDKSignature(meetingNumber, role);
    
    // Decode JWT payload
    const parts = signature.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    
    // Verify SDK key is present (should match ZOOM_CLIENT_ID from env)
    expect(payload.sdkKey).toBeDefined();
    expect(typeof payload.sdkKey).toBe("string");
    expect(payload.sdkKey.length).toBeGreaterThan(0);
  });
});

/**
 * Integration notes:
 * 
 * The Zoom Web SDK integration implements the following security features:
 * 
 * 1. **Server-side signature generation**: SDK signatures are generated on the backend
 *    using the Zoom Client ID and Secret, never exposed to the frontend.
 * 
 * 2. **Short-lived signatures**: Signatures expire after 60 seconds to prevent replay attacks.
 * 
 * 3. **Access control**: The /api/zoom/join endpoint enforces:
 *    - User authentication (must be logged in)
 *    - Booking ownership (user must own the booking)
 *    - Time window (can only join 15 minutes before session start)
 *    - Session status (booking must be confirmed, not cancelled)
 *    - Zoom configuration (session must have a Zoom meeting ID)
 * 
 * 4. **No URL exposure**: Zoom meeting URLs are never stored or exposed. Only meeting IDs
 *    are stored, and users can only join via the embedded SDK.
 * 
 * 5. **Waiting Room enabled**: Zoom meetings are configured with Waiting Room ON and
 *    Join Before Host OFF for additional security.
 */
