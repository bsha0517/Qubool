const axios = require("axios");

// Two-layer message screening:
//  1. A fast local regex pre-filter for known abuse patterns specific to
//     this product (contact-info smuggling, payment solicitation, phishing).
//  2. A hosted classifier call for general harassment/hate/sexual-content
//     detection, which regex alone can't reliably catch.
//
// Layer 1 always runs (near-zero latency/cost). Layer 2 is best-effort —
// if the classifier API is unreachable, we fail open on classification but
// still rely on layer 1, and log the outage so it gets noticed.

const RED_FLAG_PATTERNS = [
  /\bwhatsapp\b.*\d{10,}/i, // phone number smuggling attempts early on
  /\b(?:easypaisa|jazzcash)\b.*\bsend\b/i, // payment solicitation patterns
  /\bpassword\b|\bcnic\s*number\b|\botp\b/i, // credential/ID phishing
];

const isClassifierConfigured = !!process.env.MODERATION_API_URL;

async function classifyWithHostedModel(body) {
  if (!isClassifierConfigured) return { categories: [], scoresAvailable: false };

  try {
    // Shape here matches a generic moderation-endpoint convention
    // (OpenAI-style `/moderations` or a self-hosted Perspective API proxy).
    // Point MODERATION_API_URL at whichever service you provision.
    const response = await axios.post(
      process.env.MODERATION_API_URL,
      { input: body },
      { headers: { Authorization: `Bearer ${process.env.MODERATION_API_KEY}` }, timeout: 3000 }
    );
    const result = response.data?.results?.[0];
    if (!result) return { categories: [], scoresAvailable: false };

    const flaggedCategories = Object.entries(result.categories || {})
      .filter(([, isFlagged]) => isFlagged)
      .map(([category]) => category);

    return { categories: flaggedCategories, scoresAvailable: true };
  } catch (err) {
    console.error("Hosted moderation call failed, falling back to regex-only:", err.message);
    return { categories: [], scoresAvailable: false };
  }
}

async function screenMessage(body) {
  const regexFlagged = RED_FLAG_PATTERNS.some((re) => re.test(body));
  const { categories, scoresAvailable } = await classifyWithHostedModel(body);

  const flagged = regexFlagged || categories.length > 0;
  const severity = categories.some((c) => ["sexual/minors", "harassment/threatening", "self-harm/intent"].includes(c))
    ? "HIGH"
    : flagged
    ? "MEDIUM"
    : "NONE";

  return { flagged, severity, categories, classifierAvailable: scoresAvailable };
}

module.exports = { screenMessage };
