const { RekognitionClient, DetectModerationLabelsCommand } = require("@aws-sdk/client-rekognition");

/**
 * Screens uploaded profile photos for explicit/violent/graphic content
 * before they ever go live on a profile.
 */

const isConfigured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME);

const rekognition = isConfigured ? new RekognitionClient({ region: process.env.AWS_REGION || "me-south-1" }) : null;
const BUCKET = process.env.S3_BUCKET_NAME;

// Rekognition's built-in moderation taxonomy — block anything at or above
// these top-level categories rather than trying to enumerate every label.
const BLOCKED_CATEGORIES = ["Explicit Nudity", "Violence", "Visually Disturbing", "Weapons", "Drugs", "Hate Symbols"];
const MIN_CONFIDENCE = 80;

async function moderateImage(s3Key) {
  if (!isConfigured) {
    // Dev fallback: auto-pass so local/demo environments (e.g. the default
    // docker-compose setup, which has no AWS credentials) aren't permanently
    // stuck unable to complete onboarding. Never falls back this way once
    // AWS_ACCESS_KEY_ID + S3_BUCKET_NAME are set.
    console.log(`[MODERATION DEV FALLBACK] Auto-passing image at key=${s3Key}`);
    return { passed: true, reason: null };
  }

  try {
    const result = await rekognition.send(
      new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: BUCKET, Name: s3Key } },
        MinConfidence: MIN_CONFIDENCE,
      })
    );

    const hit = result.ModerationLabels.find((l) => BLOCKED_CATEGORIES.includes(l.ParentName || l.Name));
    if (hit) {
      return { passed: false, reason: `Flagged for: ${hit.Name} (${hit.Confidence.toFixed(0)}% confidence)` };
    }
    return { passed: true, reason: null };
  } catch (err) {
    console.error("Image moderation failed:", err.message);
    // Fail to PENDING (human review), not REJECTED — a transient API error
    // is not evidence the photo is unsafe, and permanently rejecting it
    // would be indistinguishable from an actual policy violation to the user.
    return { passed: null, reason: "Automated review unavailable — pending manual check" };
  }
}

module.exports = { moderateImage };
