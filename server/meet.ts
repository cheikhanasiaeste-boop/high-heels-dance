/**
 * Google Meet Integration
 * 
 * This module provides functions for generating Google Meet links for sessions.
 * Unlike Zoom, Google Meet doesn't require API integration - we generate simple meet links.
 */

/**
 * Generate a Google Meet link for a session
 * Format: https://meet.google.com/xxx-xxxx-xxx
 * 
 * @returns Google Meet link string
 */
export function generateMeetLink(): string {
  // Generate a random meet code in the format: xxx-xxxx-xxx
  const part1 = generateRandomString(3);
  const part2 = generateRandomString(4);
  const part3 = generateRandomString(3);
  
  return `https://meet.google.com/${part1}-${part2}-${part3}`;
}

/**
 * Generate a random string of lowercase letters
 * 
 * @param length - Length of the string to generate
 * @returns Random lowercase string
 */
function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Validate if a string is a valid Google Meet link
 * 
 * @param link - The link to validate
 * @returns True if valid Google Meet link
 */
export function isValidMeetLink(link: string): boolean {
  const meetPattern = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
  return meetPattern.test(link);
}
