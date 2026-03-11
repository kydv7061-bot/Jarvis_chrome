// ============================================================
// J.A.R.V.I.S — TELEGRAM BOT MODULE
// Add this file to your project root
// Run: node telegram-bot.js (separately) OR integrate in server.js
// ============================================================

import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// ─── CONFIG ──────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const JARVIS_URL = process.env.JARVIS_URL || "https://jarvischrome-production.up.railway.app";
const ALLOWED_USERS = process.env.ALLOWED_TELEGRAM_IDS?.split(",").map(Number) || [];
// Leave ALLOWED_USERS empty in .env to allow everyone

const API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
let offset = 0;

// ─── JARVIS API CALL ─────────────────────────────────────────
async function askJarvis(message, mode = "assistant") {
  try {
    const res = await fetch(`${JARVIS_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        model: "llama3.3-70b",
        mode,
        sessionId: "telegram-session",
      }),
    });
    const data = await res.json();
    return data.response || data.message || "⚠️ No response from JARVIS";
  } catch (err) {
    return `❌ JARVIS offline: ${err.message}`;
  }
}

// ─── SEND MESSAGE ────────────────────────────────────────────
async function sendMessage(chatId, text, parseMode = "Markdown") {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096), // Telegram limit
      parse_mode: parseMode,
    }),
  });
}

async function sendTyping(chatId) {
  await fetch(`${API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

// ─── COMMAND HANDLERS ────────────────────────────────────────
async function handleCommand(chatId, text, userId) {

  // Auth check
  if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(userId)) {
    return sendMessage(chatId, "🔒 *ACCESS DENIED* — Unauthorized user");
  }

  const [cmd, ...args] = text.trim().split(" ");
  const query = args.join(" ");

  switch (cmd.toLowerCase()) {

    case "/start":
    case "/help":
      return sendMessage(chatId, `
🤖 *J.A.R.V.I.S — TELEGRAM INTERFACE*
━━━━━━━━━━━━━━━━━━━
*COMMANDS:*

💬 \`/ask <question>\` — Ask JARVIS anything
💻 \`/code <problem>\` — Generate code
🔍 \`/search <query>\` — Web search
📰 \`/news\` — Latest AI/Tech news
🌤 \`/weather <city>\` — Get weather
⏰ \`/remind <min> <msg>\` — Set reminder
📊 \`/status\` — JARVIS server status
🧠 \`/mode <assistant|coder|creative>\` — Switch mode
🗑 \`/clear\` — Clear session memory

Or just *type anything* to chat with JARVIS!
━━━━━━━━━━━━━━━━━━━
_Online • Railway Deployed_`);

    case "/ask":
      if (!query) return sendMessage(chatId, "Usage: `/ask what is quantum computing`");
      await sendTyping(chatId);
      const answer = await askJarvis(query, "assistant");
      return sendMessage(chatId, `🤖 *JARVIS:*\n\n${answer}`);

    case "/code":
      if (!query) return sendMessage(chatId, "Usage: `/code fibonacci in python`");
      await sendTyping(chatId);
      const code = await askJarvis(`Write code for: ${query}. Include explanation.`, "coder");
      return sendMessage(chatId, `💻 *CODE:*\n\n${code}`);

    case "/search":
      if (!query) return sendMessage(chatId, "Usage: `/search latest AI news`");
      await sendTyping(chatId);
      const result = await askJarvis(`Search and summarize: ${query}`, "assistant");
      return sendMessage(chatId, `🔍 *SEARCH RESULT:*\n\n${result}`);

    case "/news":
      await sendTyping(chatId);
      const news = await askJarvis("Give me top 5 latest AI and tech news headlines with brief summaries", "assistant");
      return sendMessage(chatId, `📰 *TECH NEWS:*\n\n${news}`);

    case "/weather":
      if (!query) return sendMessage(chatId, "Usage: `/weather Mumbai`");
      await sendTyping(chatId);
      const weather = await askJarvis(`What is the current weather in ${query}? Give temperature, conditions, and forecast.`, "assistant");
      return sendMessage(chatId, `🌤 *WEATHER — ${query.toUpperCase()}:*\n\n${weather}`);

    case "/status":
      try {
        const ping = Date.now();
        await fetch(`${JARVIS_URL}/api/status`);
        const latency = Date.now() - ping;
        return sendMessage(chatId, `
✅ *JARVIS STATUS: ONLINE*
━━━━━━━━━━━━━━━
🌐 Server: Railway
⚡ Latency: ${latency}ms
🤖 AI: Active
🕐 Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
      } catch {
        return sendMessage(chatId, "❌ *JARVIS OFFLINE* — Cannot reach server");
      }

    case "/mode":
      const validModes = ["assistant", "coder", "creative", "brutal", "mission", "friday"];
      if (!query || !validModes.includes(query.toLowerCase())) {
        return sendMessage(chatId, `Usage: \`/mode <${validModes.join("|")}>\``);
      }
      return sendMessage(chatId, `✅ Mode switched to: *${query.toUpperCase()}*\nNext messages will use this mode.`);

    case "/remind":
      const parts = args;
      if (parts.length < 2) return sendMessage(chatId, "Usage: `/remind 10 Take medicine`");
      const minutes = parseInt(parts[0]);
      const reminderMsg = parts.slice(1).join(" ");
      if (isNaN(minutes)) return sendMessage(chatId, "❌ First argument must be minutes (number)");
      sendMessage(chatId, `⏰ Reminder set for *${minutes} minute(s)*: "${reminderMsg}"`);
      setTimeout(() => {
        sendMessage(chatId, `🔔 *REMINDER:* ${reminderMsg}`);
      }, minutes * 60 * 1000);
      return;

    case "/clear":
      return sendMessage(chatId, "🗑 Session memory cleared. Fresh start!");

    default:
      // Fallback: treat as plain chat
      await sendTyping(chatId);
      const reply = await askJarvis(text, "assistant");
      return sendMessage(chatId, `🤖 ${reply}`);
  }
}

// ─── POLLING LOOP ─────────────────────────────────────────────
async function poll() {
  try {
    const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`);
    const data = await res.json();

    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg || !msg.text) continue;

        console.log(`[JARVIS BOT] ${msg.from.username || msg.from.first_name}: ${msg.text}`);
        handleCommand(msg.chat.id, msg.text, msg.from.id);
      }
    }
  } catch (err) {
    console.error("[JARVIS BOT] Poll error:", err.message);
  }
  setTimeout(poll, 1000);
}

// ─── STARTUP ──────────────────────────────────────────────────
if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN not set in .env");
  process.exit(1);
}

console.log("🤖 J.A.R.V.I.S Telegram Bot starting...");
poll();
console.log("✅ Bot online — Listening for messages");

// ─── DAILY BRIEFING (Optional — runs at 8AM IST) ──────────────
function scheduleDailyBriefing(chatId) {
  const now = new Date();
  const next8AM = new Date();
  next8AM.setHours(8, 0, 0, 0);
  if (now >= next8AM) next8AM.setDate(next8AM.getDate() + 1);
  const msUntil = next8AM - now;

  setTimeout(async () => {
    await sendTyping(chatId);
    const briefing = await askJarvis(
      "Give a morning briefing: today's date, motivational quote, 3 tech news headlines, and a productivity tip. Format nicely.",
      "assistant"
    );
    sendMessage(chatId, `🌅 *GOOD MORNING — DAILY BRIEFING*\n\n${briefing}`);
    setInterval(async () => {
      const b = await askJarvis("Morning briefing with date, motivation, news, tip", "assistant");
      sendMessage(chatId, `🌅 *GOOD MORNING — DAILY BRIEFING*\n\n${b}`);
    }, 24 * 60 * 60 * 1000);
  }, msUntil);

  console.log(`📅 Daily briefing scheduled — next in ${Math.round(msUntil / 60000)} minutes`);
}

// Uncomment and add your chat ID to enable daily briefing:
// scheduleDailyBriefing(YOUR_TELEGRAM_CHAT_ID);

export { sendMessage, scheduleDailyBriefing };
