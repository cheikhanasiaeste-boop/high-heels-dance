import TelegramBot from "node-telegram-bot-api";
import { db as drizzleDb } from "./db";
import { sessionDiscountCodes, users, availabilitySlots } from "../drizzle/schema";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { randomBytes } from "crypto";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_IDS = (process.env.TELEGRAM_ADMIN_CHAT_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "HHD-";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

function isAdminChat(chatId: number): boolean {
  return TELEGRAM_ADMIN_CHAT_IDS.includes(chatId.toString());
}

export function setupTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("[Telegram] No TELEGRAM_BOT_TOKEN set — bot disabled");
    return;
  }

  if (TELEGRAM_ADMIN_CHAT_IDS.length === 0) {
    console.log("[Telegram] No TELEGRAM_ADMIN_CHAT_IDS set — bot disabled");
    return;
  }

  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  console.log("[Telegram] Bot started — listening for admin commands");

  // ── /start ──
  bot.onText(/\/start/, (msg) => {
    if (!isAdminChat(msg.chat.id)) {
      bot.sendMessage(msg.chat.id, "Unauthorized. This bot is for admin use only.");
      return;
    }
    bot.sendMessage(
      msg.chat.id,
      `🩰 *High Heels Dance Admin Bot*\n\nAvailable commands:\n\n` +
        `/generate single <session_id> — Create 1 discount code\n` +
        `/generate single any — Create 1 code for any in-person session\n` +
        `/generate package <session_id> — Create 4 discount codes\n` +
        `/generate package any — Create 4 codes for any session\n` +
        `/list — Show recent discount codes\n` +
        `/revoke <code> — Deactivate a code\n` +
        `/sessions — List upcoming in-person sessions`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /generate single|package <session_id|any> ──
  bot.onText(/\/generate\s+(single|package)\s+(\S+)/, async (msg, match) => {
    if (!isAdminChat(msg.chat.id)) return;

    const type = match![1] as "single" | "package";
    const sessionArg = match![2];
    const sessionId = sessionArg === "any" ? null : parseInt(sessionArg, 10);

    if (sessionArg !== "any" && isNaN(sessionId as number)) {
      bot.sendMessage(msg.chat.id, "Invalid session ID. Use a number or 'any'.");
      return;
    }

    // Verify session exists if specific
    if (sessionId !== null) {
      const sessions = await drizzleDb
        .select()
        .from(availabilitySlots)
        .where(eq(availabilitySlots.id, sessionId))
        .limit(1);

      if (sessions.length === 0) {
        bot.sendMessage(msg.chat.id, `Session #${sessionId} not found.`);
        return;
      }

      const session = sessions[0];
      if (session.eventType !== "in-person") {
        bot.sendMessage(msg.chat.id, `Session #${sessionId} is an online session. Discount codes are for in-person only.`);
        return;
      }
    }

    // Get admin user ID (use first admin from DB)
    const admins = await drizzleDb
      .select()
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    const adminId = admins[0]?.id || 1;

    const count = type === "package" ? 4 : 1;
    const packageGroup = type === "package" ? `pkg-${Date.now()}` : null;
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = generateCode();
      await drizzleDb.insert(sessionDiscountCodes).values({
        code,
        type,
        packageGroup,
        sessionId,
        createdByAdminId: adminId,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months
      });
      codes.push(code);
    }

    const sessionLabel = sessionId !== null ? `session #${sessionId}` : "any in-person session";
    const codeList = codes.map((c) => `\`${c}\``).join("\n");
    const expiryDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    bot.sendMessage(
      msg.chat.id,
      `✅ Generated ${count} code${count > 1 ? "s" : ""} for ${sessionLabel}:\n\n${codeList}\n\n_Valid until ${expiryDate}_`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /list ──
  bot.onText(/\/list/, async (msg) => {
    if (!isAdminChat(msg.chat.id)) return;

    const codes = await drizzleDb
      .select()
      .from(sessionDiscountCodes)
      .orderBy(desc(sessionDiscountCodes.createdAt))
      .limit(20);

    if (codes.length === 0) {
      bot.sendMessage(msg.chat.id, "No discount codes found.");
      return;
    }

    const lines = codes.map((c) => {
      const status = !c.isActive
        ? "🚫 Revoked"
        : c.usedByUserId
        ? `✅ Used`
        : "🟢 Active";
      const session = c.sessionId ? `#${c.sessionId}` : "any";
      return `\`${c.code}\` — ${status} — session: ${session}`;
    });

    bot.sendMessage(msg.chat.id, `📋 *Recent Codes:*\n\n${lines.join("\n")}`, {
      parse_mode: "Markdown",
    });
  });

  // ── /revoke <code> ──
  bot.onText(/\/revoke\s+(\S+)/, async (msg, match) => {
    if (!isAdminChat(msg.chat.id)) return;

    const code = match![1].toUpperCase();
    const result = await drizzleDb
      .update(sessionDiscountCodes)
      .set({ isActive: false })
      .where(eq(sessionDiscountCodes.code, code));

    bot.sendMessage(msg.chat.id, `🚫 Code \`${code}\` has been revoked.`, {
      parse_mode: "Markdown",
    });
  });

  // ── /sessions ──
  bot.onText(/\/sessions/, async (msg) => {
    if (!isAdminChat(msg.chat.id)) return;

    const sessions = await drizzleDb
      .select()
      .from(availabilitySlots)
      .where(
        and(
          eq(availabilitySlots.eventType, "in-person"),
          sql`${availabilitySlots.startTime} > NOW()`
        )
      )
      .orderBy(availabilitySlots.startTime)
      .limit(10);

    if (sessions.length === 0) {
      bot.sendMessage(msg.chat.id, "No upcoming in-person sessions.");
      return;
    }

    const lines = sessions.map((s) => {
      const date = new Date(s.startTime).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `#${s.id} — ${s.title} — ${date} — €${s.price || "Free"}`;
    });

    bot.sendMessage(
      msg.chat.id,
      `📍 *Upcoming In-Person Sessions:*\n\n${lines.join("\n")}`,
      { parse_mode: "Markdown" }
    );
  });

  return bot;
}
