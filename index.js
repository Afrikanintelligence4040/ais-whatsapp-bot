const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

// ─── CONFIG (set these in your .env or hosting platform) ────────────────────
const {
  VERIFY_TOKEN,          // any string you choose — used to verify webhook with Meta
  WHATSAPP_TOKEN,        // WhatsApp Cloud API permanent token from Meta
  WHATSAPP_PHONE_ID,     // Phone Number ID from Meta Developer dashboard
  ANTHROPIC_API_KEY,     // Your Anthropic API key
  PORT = 3000
} = process.env;

// ─── AIS SYSTEM PROMPT ───────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the friendly AI assistant for Afrikan Intelligence Solutions (AIS), an AI consulting business that helps African entrepreneurs and businesses use artificial intelligence and automation to grow and operate smarter.

About Afrikan Intelligence Solutions:
- Founded by Muleza Tembo (MTee), an entrepreneur based in Pennsylvania with deep roots in Zambia
- We help African businesses implement practical, affordable AI tools
- We specialize in WhatsApp-first solutions because that's how African businesses communicate
- We use tools like Make.com, Voiceflow, and Claude AI

Our Core Services:
1. AI Strategy Consultation — We map out exactly where AI can save you time and money. Free initial consultation available.
2. WhatsApp Chatbot Development — Custom chatbots for customer service, FAQs, lead capture, and order taking.
3. Business Automation — Automate invoicing, appointment reminders, follow-ups, and data entry using Make.com.
4. AI Training & Workshops — Hands-on training so your team can use AI tools confidently.

Who We Help:
- Small and medium businesses in Zambia and across Africa
- Any business tired of doing manual, repetitive work
- Businesses that want to serve customers 24/7 without hiring more staff

Why Choose AIS:
- African-owned and led — we understand local business realities
- Affordable pricing with solutions for every budget
- We train your team and offer ongoing support

Getting Started:
- Book a free 30-minute consultation
- We identify 2-3 quick wins for your business
- Most projects kick off within 1-2 weeks

Be warm, encouraging, and concise — this is WhatsApp. Use the occasional emoji. If asked about pricing, explain it depends on project scope and invite them to book a free consultation. Respond in whatever language the customer writes in.`;

// ─── IN-MEMORY CONVERSATION STORE ────────────────────────────────────────────
// Stores last 10 messages per phone number so the bot has context
const conversations = new Map();

function getHistory(phone) {
  if (!conversations.has(phone)) conversations.set(phone, []);
  return conversations.get(phone);
}

function addToHistory(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });
  if (history.length > 20) history.splice(0, 2); // keep last 10 exchanges
}

// ─── CALL CLAUDE ─────────────────────────────────────────────────────────────
async function askClaude(phone, userMessage) {
  addToHistory(phone, "user", userMessage);
  const history = getHistory(phone);

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: history
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      }
    }
  );

  const reply = response.data.content?.[0]?.text || "Sorry, I couldn't process that. Please try again.";
  addToHistory(phone, "assistant", reply);
  return reply;
}

// ─── SEND WHATSAPP MESSAGE ────────────────────────────────────────────────────
async function sendWhatsApp(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ─── WEBHOOK VERIFICATION (Meta requires this) ────────────────────────────────
app.get("/webhook", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified by Meta");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── INCOMING MESSAGE HANDLER ─────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  // Acknowledge immediately — Meta requires a 200 within 5 seconds
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message || message.type !== "text") return; // ignore non-text for now

    const from = message.from;         // sender's phone number
    const text = message.text?.body;   // message content

    console.log(`📩 From ${from}: ${text}`);

    const reply = await askClaude(from, text);
    await sendWhatsApp(from, reply);

    console.log(`✉️  Sent to ${from}: ${reply.slice(0, 80)}...`);
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("AIS WhatsApp Bot is running ✅"));

app.listen(PORT, () => console.log(`🚀 AIS bot listening on port ${PORT}`));
