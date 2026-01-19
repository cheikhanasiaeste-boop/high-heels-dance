import { describe, it, expect } from 'vitest';

/**
 * Test Zoom API credentials by attempting to generate an OAuth token
 * This validates that the provided credentials are correct and have API access
 */
describe('Zoom API Credentials Validation', () => {
  it('should successfully generate OAuth token with provided credentials', async () => {
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;

    // Verify credentials are present
    expect(accountId).toBeDefined();
    expect(clientId).toBeDefined();
    expect(clientSecret).toBeDefined();
    expect(accountId).not.toBe('');
    expect(clientId).not.toBe('');
    expect(clientSecret).not.toBe('');

    // Attempt to generate OAuth token
    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'account_credentials',
        account_id: accountId!,
      }),
    });

    // Get response data to see error details
    const tokenData = await tokenResponse.json();
    
    // If not OK, log the error for debugging
    if (!tokenResponse.ok) {
      console.error('❌ Zoom API Error:', tokenData);
      console.error('   Status:', tokenResponse.status, tokenResponse.statusText);
    }
    
    expect(tokenResponse.ok).toBe(true);
    
    // Verify we got a valid access token
    expect(tokenData).toHaveProperty('access_token');
    expect(tokenData.access_token).toBeTruthy();
    expect(typeof tokenData.access_token).toBe('string');
    expect(tokenData.access_token.length).toBeGreaterThan(0);
    
    // Verify token type
    expect(tokenData).toHaveProperty('token_type');
    expect(tokenData.token_type).toBe('bearer');
    
    // Verify expiration
    expect(tokenData).toHaveProperty('expires_in');
    expect(tokenData.expires_in).toBeGreaterThan(0);

    console.log('✅ Zoom credentials validated successfully');
    console.log(`   Token expires in: ${tokenData.expires_in} seconds`);
  }, 15000); // 15 second timeout for API call
});
