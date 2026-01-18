/**
 * Session Reminder Job
 * Sends email reminders to users 1 hour before their sessions start
 * 
 * This job should be run every 5-10 minutes to check for upcoming sessions
 */

import * as db from "../db";
import { sendEmail, getSessionReminderEmail } from "../_core/email";

export async function sendSessionReminders(): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;

  try {
    // Get all sessions starting in the next 60-70 minutes
    // (window accounts for job execution frequency)
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const seventyMinutesFromNow = new Date(now.getTime() + 70 * 60 * 1000);

    const allSlots = await db.getAllAvailabilitySlots();
    
    // Filter sessions that start within the reminder window
    const upcomingSessions = allSlots.filter(slot => {
      const startTime = new Date(slot.startTime);
      return startTime >= oneHourFromNow && startTime <= seventyMinutesFromNow;
    });

    console.log(`[Session Reminders] Found ${upcomingSessions.length} sessions starting in 1 hour`);

    for (const session of upcomingSessions) {
      // Get all enrolled users for this session
      const enrollments = await db.getSessionEnrollments(session.id);
      
      console.log(`[Session Reminders] Session "${session.title}" has ${enrollments.length} enrollments`);

      for (const enrollment of enrollments) {
        try {
          const user = await db.getUserById(enrollment.userId);
          
          if (!user || !user.email) {
            console.warn(`[Session Reminders] User ${enrollment.userId} not found or has no email`);
            continue;
          }

          const emailHtml = getSessionReminderEmail({
            userName: user.name || "Student",
            sessionTitle: session.title,
            sessionDate: session.startTime,
            sessionType: session.eventType,
            location: session.location || undefined,
            sessionLink: session.sessionLink || undefined,
          });

          const result = await sendEmail({
            to: user.email,
            subject: `Reminder: ${session.title} starts in 1 hour!`,
            html: emailHtml,
          });

          if (result.success) {
            sent++;
            console.log(`[Session Reminders] Sent reminder to ${user.email} for "${session.title}"`);
          } else {
            errors++;
            console.error(`[Session Reminders] Failed to send to ${user.email}: ${result.error}`);
          }
        } catch (error) {
          errors++;
          console.error(`[Session Reminders] Error processing enrollment ${enrollment.id}:`, error);
        }
      }
    }

    console.log(`[Session Reminders] Complete. Sent: ${sent}, Errors: ${errors}`);
    return { sent, errors };
  } catch (error) {
    console.error("[Session Reminders] Job failed:", error);
    return { sent, errors };
  }
}

// If running as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  sendSessionReminders()
    .then(result => {
      console.log("Session reminders job completed:", result);
      process.exit(0);
    })
    .catch(error => {
      console.error("Session reminders job failed:", error);
      process.exit(1);
    });
}
