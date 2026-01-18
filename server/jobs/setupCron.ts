/**
 * Cron Job Setup for Automated Tasks
 * 
 * This file sets up scheduled jobs that run automatically:
 * - Session reminders: Every 10 minutes, check for sessions starting in 1 hour
 */

import cron from "node-cron";
import { sendSessionReminders } from "./sessionReminders";

export function setupCronJobs() {
  // Run session reminder check every 10 minutes
  // Cron expression: "*/10 * * * *" = every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    console.log("[Cron] Running session reminders job...");
    try {
      const result = await sendSessionReminders();
      console.log(`[Cron] Session reminders complete: ${result.sent} sent, ${result.errors} errors`);
    } catch (error) {
      console.error("[Cron] Session reminders job failed:", error);
    }
  });

  console.log("[Cron] Jobs scheduled:");
  console.log("  - Session reminders: Every 10 minutes");
}
