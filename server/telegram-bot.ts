import TelegramBot from "node-telegram-bot-api";
import { db as drizzleDb } from "./db";
import { sessionDiscountCodes, users, availabilitySlots } from "../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
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
      `🩰 *High Heels Dance Admin Bot*\n\nCommands:\n\n` +
        `/generate single — Create 1 discount code\n` +
        `/generate package — Create 4 discount codes (monthly pack)\n` +
        `/list — Show recent codes\n` +
        `/revoke <code> — Deactivate a code\n` +
        `/sessions — List in-person sessions with discount codes enabled\n\n` +
        `_Codes work on any in-person session where "Allow Discount Codes" is enabled in the admin panel._`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /generate single|package ──
  bot.onText(/\/generate\s+(single|package)/, async (msg, match) => {
    if (!isAdminChat(msg.chat.id)) return;

    const type = match![1] as "single" | "package";
    const count = type === "package" ? 4 : 1;
    const packageGroup = type === "package" ? `pkg-${Date.now()}` : null;

    // Get admin user ID
    const admins = await drizzleDb
      .select()
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    const adminId = admins[0]?.id || 1;

    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = generateCode();
      await drizzleDb.insert(sessionDiscountCodes).values({
        code,
        type,
        packageGroup,
        createdByAdminId: adminId,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months
      });
      codes.push(code);
    }

    const codeList = codes.map((c) => `\`${c}\``).join("\n");
    const expiryDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });

    bot.sendMessage(
      msg.chat.id,
      `✅ Generated ${count} code${count > 1 ? "s" : ""}:\n\n${codeList}\n\n_Valid for any in-person session with discount codes enabled. Expires ${expiryDate}_`,
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
      const status = !c.isActive ? "🚫 Revoked" : c.usedByUserId ? "✅ Used" : "🟢 Active";
      return `\`${c.code}\` — ${status}`;
    });

    bot.sendMessage(msg.chat.id, `📋 *Recent Codes:*\n\n${lines.join("\n")}`, {
      parse_mode: "Markdown",
    });
  });

  // ── /revoke <code> ──
  bot.onText(/\/revoke\s+(\S+)/, async (msg, match) => {
    if (!isAdminChat(msg.chat.id)) return;
    const code = match![1].toUpperCase();
    await drizzleDb
      .update(sessionDiscountCodes)
      .set({ isActive: false })
      .where(eq(sessionDiscountCodes.code, code));
    bot.sendMessage(msg.chat.id, `🚫 Code \`${code}\` has been revoked.`, { parse_mode: "Markdown" });
  });

  // ── /sessions — show in-person sessions with discount codes enabled ──
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

    const lines = sessions.map((s: any) => {
      const date = new Date(s.startTime).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const discountFlag = s.allowDiscountCodes ? "✅ Codes ON" : "❌ Codes OFF";
      return `#${s.id} — ${s.title} — ${date} — €${s.price || "Free"} — ${discountFlag}`;
    });

    bot.sendMessage(msg.chat.id, `📍 *Upcoming In-Person Sessions:*\n\n${lines.join("\n")}`, {
      parse_mode: "Markdown",
    });
  });

  return bot;
}
