
const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const { ANTHROPIC_API_KEY, PORT = 3000 } = process.env;
const SYSTEM_PROMPT = "You are the friendly AI assistant for Afrikan Intelligence Solutions (AIS). We help African businesses use AI and automation. Services: 1. AI Strategy Consultation (free first session), 2. WhatsApp Chatbot Development, 3. Business Automation with Make.com, 4. AI Training. African-owned, affordable, ongoing support included. For pricing questions, invite them to book a free consultation. Be warm, concise, use occasional emojis.";
const conversations = new Map();
function getHistory(phone) {
  if (!conversations.has(phone)) conversations.set(phone, []);
  return conversations.get(phone);
}
function addToHistory(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });
  if (history.length > 20) history.splice(0, 2);
}
async function askClaude(phone, userMessage) {
  addToHistory(phone, "user", userMessage);
  const history = getHistory(phone);
  const response = await axios.post("https://api.anthropic.com/v1/messages", { model: "claude-sonnet-4-6", max_tokens: 1000, system: SYSTEM_PROMPT, messages: history }, { headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } });
  const reply = response.data.content[0].text || "Sorry, please try again.";
  addToHistory(phone, "assistant", reply);
  return reply;
}
function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
app.post("/webhook", async (req, res) => {
  const from = req.body.From;
  const text = req.body.Body;
  console.log("From " + from + ": " + text);
  try {
    const reply = await askClaude(from, text);
    res.set("Content-Type", "text/xml");
    res.send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>" + escapeXml(reply) + "</Message></Response>");
  } catch (err) {
    console.error("Error:", err.message);
    res.set("Content-Type", "text/xml");
    res.send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>Sorry, something went wrong.</Message></Response>");
  }
});
app.get("/", (req, res) => res.send("AIS WhatsApp Bot is running"));
app.listen(PORT, () => console.log("Bot running on port " + PORT));
