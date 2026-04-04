import crypto from "crypto";
import { Resend } from "resend";
import { ENV } from "./env";

// Initialize Resend client (will be undefined if API key not set)
let resend: Resend | null = null;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email using Resend
 * @param params Email parameters
 * @returns Promise with send result
 */
export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("Email service not configured. Set RESEND_API_KEY environment variable.");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const from = params.from || EMAIL_FROM || "High Heels Dance <noreply@elizabethzolotova.com>";
    
    await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Email template for session enrollment notification
 */
export function getSessionEnrollmentEmail(params: {
  userName: string;
  sessionTitle: string;
  sessionDate: Date;
  sessionType: "online" | "in-person";
  location?: string;
  sessionLink?: string;
}): string {
  const dateStr = params.sessionDate.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const locationInfo = params.sessionType === "online"
    ? `<p><strong>Session Type:</strong> Online</p>
       <p><strong>Join Link:</strong> <a href="${params.sessionLink}">${params.sessionLink}</a></p>`
    : `<p><strong>Session Type:</strong> In-Person</p>
       <p><strong>Location:</strong> ${params.location}</p>`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ec4899 0%, #a855f7 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #ec4899; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You're Enrolled! 🎉</h1>
          </div>
          <div class="content">
            <p>Hi ${params.userName},</p>
            <p>Great news! You've been successfully enrolled in:</p>
            <h2 style="color: #ec4899;">${params.sessionTitle}</h2>
            <p><strong>Date & Time:</strong> ${dateStr}</p>
            ${locationInfo}
            <p>We're excited to see you there! If you have any questions, please don't hesitate to reach out.</p>
            <p>See you soon!</p>
            <p><strong>Elizabeth Zolotova</strong><br>High Heels Dance</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} High Heels Dance. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Email template for session reminder (1 hour before)
 */
export function getSessionReminderEmail(params: {
  userName: string;
  sessionTitle: string;
  sessionDate: Date;
  sessionType: "online" | "in-person";
  location?: string;
  sessionLink?: string;
}): string {
  const dateStr = params.sessionDate.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const locationInfo = params.sessionType === "online"
    ? `<p><strong>Join Link:</strong> <a href="${params.sessionLink}" class="button">Join Session Now</a></p>`
    : `<p><strong>Location:</strong> ${params.location}</p>`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ec4899 0%, #a855f7 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #ec4899; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Session Starting Soon! ⏰</h1>
          </div>
          <div class="content">
            <p>Hi ${params.userName},</p>
            <div class="alert">
              <strong>Reminder:</strong> Your session starts in 1 hour!
            </div>
            <h2 style="color: #ec4899;">${params.sessionTitle}</h2>
            <p><strong>Starts at:</strong> ${dateStr}</p>
            ${locationInfo}
            <p>Make sure you're ready to join. We can't wait to see you!</p>
            <p><strong>Elizabeth Zolotova</strong><br>High Heels Dance</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} High Heels Dance. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Email template for new message notification
 */
export function getMessageNotificationEmail(params: {
  userName: string;
  senderName: string;
  messagePreview: string;
  messagesUrl: string;
}): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ec4899 0%, #a855f7 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .message-preview { background: white; border-left: 4px solid #ec4899; padding: 15px; margin: 20px 0; border-radius: 4px; font-style: italic; }
          .button { display: inline-block; background: #ec4899; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Message 💬</h1>
          </div>
          <div class="content">
            <p>Hi ${params.userName},</p>
            <p>You have a new message from <strong>${params.senderName}</strong>:</p>
            <div class="message-preview">
              ${params.messagePreview}
            </div>
            <a href="${params.messagesUrl}" class="button">View Message</a>
            <p>Log in to your account to read and reply to this message.</p>
            <p><strong>High Heels Dance Team</strong></p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} High Heels Dance. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// ─── Newsletter helpers ────────────────────────────────────────────────────

const NEWSLETTER_SECRET = process.env.NEWSLETTER_SECRET || "default-newsletter-secret";
if (!process.env.NEWSLETTER_SECRET) {
  console.warn(
    "WARNING: NEWSLETTER_SECRET env var is not set — using insecure default. " +
    "Unsubscribe tokens are predictable. Set NEWSLETTER_SECRET in production!"
  );
}
const SITE_URL = process.env.VITE_SITE_URL || "https://www.elizabeth-zolotova.com";

/**
 * Generate an HMAC-SHA256 unsubscribe token for the given email address.
 */
export function generateUnsubscribeToken(email: string): string {
  return crypto
    .createHmac("sha256", NEWSLETTER_SECRET)
    .update(email.toLowerCase())
    .digest("hex");
}

/**
 * Verify an unsubscribe token using a timing-safe comparison.
 */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
  } catch {
    return false;
  }
}

/**
 * Build the HTML body for a newsletter email.
 */
export function getNewsletterEmailHtml(params: {
  title: string;
  excerpt: string;
  thumbnailUrl: string;
  slug: string;
  recipientEmail: string;
}): string {
  const { title, excerpt, thumbnailUrl, slug, recipientEmail } = params;
  const postUrl = `${SITE_URL}/blog/${slug}`;
  const token = generateUnsubscribeToken(recipientEmail);
  const unsubscribeUrl = `${SITE_URL}/unsubscribe?email=${encodeURIComponent(recipientEmail)}&token=${token}`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f0f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f0f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

            <!-- Thumbnail -->
            <tr>
              <td style="padding:0;">
                <img src="${thumbnailUrl}" alt="" width="600" style="display:block;width:100%;height:auto;border:0;" />
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:36px 40px 28px;">
                <h1 style="margin:0 0 16px;font-size:26px;line-height:1.3;color:#1a0525;">${title}</h1>
                <p style="margin:0 0 28px;font-size:16px;line-height:1.7;color:#555555;">${excerpt}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:999px;background-color:#C026D3;">
                      <a href="${postUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Read Full Post</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 40px 32px;border-top:1px solid #f0e8f5;">
                <p style="margin:0;font-size:13px;color:#888888;line-height:1.6;text-align:center;">
                  You received this because you subscribed to the High Heels Dance newsletter.<br />
                  <a href="${unsubscribeUrl}" style="color:#C026D3;text-decoration:underline;">Unsubscribe</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ─── Course completion ─────────────────────────────────────────────────────

/**
 * Email template for course completion congratulations
 */
export function getCourseCompletionEmail(params: {
  userName: string;
  courseTitle: string;
  completionDate: Date;
}): string {
  const dateStr = params.completionDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ec4899 0%, #a855f7 100%); color: white; padding: 40px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .certificate { background: white; border: 3px solid #ec4899; padding: 30px; margin: 20px 0; text-align: center; border-radius: 8px; }
          .trophy { font-size: 48px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Congratulations! 🎉</h1>
          </div>
          <div class="content">
            <p>Hi ${params.userName},</p>
            <div class="certificate">
              <div class="trophy">🏆</div>
              <h2 style="color: #ec4899; margin: 20px 0;">Course Completed!</h2>
              <h3>${params.courseTitle}</h3>
              <p style="color: #6b7280;">Completed on ${dateStr}</p>
            </div>
            <p>We're so proud of your dedication and hard work! You've successfully completed the course and mastered new skills.</p>
            <p>Keep dancing, keep growing, and remember - this is just the beginning of your journey!</p>
            <p>We'd love to hear about your experience. Consider leaving a testimonial to inspire other dancers!</p>
            <p>With pride and admiration,</p>
            <p><strong>Elizabeth Zolotova</strong><br>High Heels Dance</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} High Heels Dance. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
