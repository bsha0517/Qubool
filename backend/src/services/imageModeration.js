const { RekognitionClient, DetectModerationLabelsCommand, CompareFacesCommand } = require("@aws-sdk/client-rekognition");

/**
 * Screens uploaded profile photos for explicit/violent/graphic content
 * before they ever go live on a profile. Also exposes a face-match helper
 * used to confirm the CNIC photo and the liveness selfie are the same person
 * (defense-in-depth alongside whatever the KYC provider already checks).
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

/** Confirms the CNIC photo and the liveness selfie show the same face. */
async function compareFaces(sourceKey, targetKey) {
  if (!isConfigured) {
    console.log("[MODERATION DEV FALLBACK] Auto-passing face comparison");
    return { matched: true, similarity: 100 };
  }

  try {
    const result = await rekognition.send(
      new CompareFacesCommand({
        SourceImage: { S3Object: { Bucket: BUCKET, Name: sourceKey } },
        TargetImage: { S3Object: { Bucket: BUCKET, Name: targetKey } },
        SimilarityThreshold: 85,
      })
    );
    const bestMatch = result.FaceMatches?.[0];
    return { matched: !!bestMatch, similarity: bestMatch?.Similarity || 0 };
  } catch (err) {
    console.error("Face comparison failed:", err.message);
    return { matched: false, similarity: 0 };
  }
}

module.exports = { moderateImage, compareFaces };
