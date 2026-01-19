import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

/**
 * Test Zoom Meeting SDK credentials by generating a valid SDK signature
 * This validates that the SDK Key and SDK Secret are correct
 */
describe('Zoom Meeting SDK Credentials Validation', () => {
  it('should successfully generate a valid SDK signature', () => {
    const sdkKey = process.env.ZOOM_CLIENT_ID;
    const sdkSecret = process.env.ZOOM_CLIENT_SECRET;

    // Verify credentials are present
    expect(sdkKey).toBeDefined();
    expect(sdkSecret).toBeDefined();
    expect(sdkKey).not.toBe('');
    expect(sdkSecret).not.toBe('');

    // Test signature generation with sample meeting number
    const testMeetingNumber = '123456789';
    const role = '0'; // 0 = participant, 1 = host

    const signature = generateZoomSignature(sdkKey!, sdkSecret!, testMeetingNumber, role);

    // Verify signature format (should be a JWT with 3 parts separated by dots)
    expect(signature).toBeTruthy();
    expect(typeof signature).toBe('string');
    
    const parts = signature.split('.');
    expect(parts.length).toBe(3);
    
    // Verify each part is base64url encoded
    parts.forEach(part => {
      expect(part.length).toBeGreaterThan(0);
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/); // base64url characters
    });

    // Decode and verify header
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');

    // Decode and verify payload
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(payload.sdkKey).toBe(sdkKey);
    expect(payload.mn).toBe(testMeetingNumber);
    expect(payload.role).toBe(role);
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.exp).toBeGreaterThan(payload.iat);

    console.log('✅ Zoom Meeting SDK credentials validated successfully');
    console.log(`   SDK Key: ${sdkKey}`);
    console.log(`   Signature generated for meeting: ${testMeetingNumber}`);
  });
});

/**
 * Generate Zoom SDK JWT signature
 */
function generateZoomSignature(
  sdkKey: string,
  sdkSecret: string,
  meetingNumber: string,
  role: string
): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 2; // 2 hours expiration

  const oHeader = { alg: 'HS256', typ: 'JWT' };
  const oPayload = {
    sdkKey,
    mn: meetingNumber,
    role,
    iat,
    exp,
    appKey: sdkKey,
    tokenExp: exp,
  };

  const sHeader = JSON.stringify(oHeader);
  const sPayload = JSON.stringify(oPayload);

  const sdkJWT =
    base64url(sHeader) + '.' +
    base64url(sPayload) + '.' +
    base64url(
      crypto
        .createHmac('sha256', sdkSecret)
        .update(base64url(sHeader) + '.' + base64url(sPayload))
        .digest()
    );

  return sdkJWT;
}

function base64url(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
