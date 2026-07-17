const twilio = require("twilio");

const isConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

const client = isConfigured ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

/**
 * Sends an SMS. Falls back to console logging in dev / when Twilio isn't
 * configured, so local development doesn't require real credentials.
 *
 * Swap this file's internals for a local Pakistani gateway (Zong, Jazz,
 * Telesign, etc.) if Twilio's Pakistan delivery/pricing doesn't work for you —
 * the rest of the app only calls `sendOtpSms`, so the provider is isolated here.
 */
async function sendOtpSms(phone, code) {
  const body = `Your Qubool verification code is ${code}. It expires in 5 minutes. Never share this code with anyone.`;

  if (!isConfigured) {
    console.log(`[SMS DEV FALLBACK] to=${phone} body="${body}"`);
    return { sent: false, dev: true };
  }

  try {
    const message = await client.messages.create({
      to: phone,
      from: process.env.TWILIO_FROM_NUMBER,
      body,
    });
    return { sent: true, sid: message.sid };
  } catch (err) {
    console.error("SMS send failed:", err.message);
    throw new Error("Could not send verification code — try again shortly");
  }
}

module.exports = { sendOtpSms };
