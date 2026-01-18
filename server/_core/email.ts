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
