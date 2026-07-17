const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

/**
 * Uploads go direct-to-bucket from the client using a short-lived signed
 * URL — the backend never proxies raw image bytes through itself. This
 * scales better and keeps large uploads off the API server.
 *
 * Flow:
 *   1. Client calls POST /uploads/photo-url -> gets { uploadUrl, publicUrl, key }
 *   2. Client PUTs the file bytes directly to uploadUrl
 *   3. Client tells our API the publicUrl (see routes/profile.js, routes/verification.js)
 *   4. A moderation job (see services/imageModeration.js) reviews the object at `key`
 *
 * DEV FALLBACK: when AWS isn't configured (no AWS_ACCESS_KEY_ID / S3_BUCKET_NAME —
 * the default in docker-compose), uploads go to this same server instead,
 * written to local disk and served back statically. This is NOT suitable for
 * production (no durability, no CDN, single instance only) — it exists so
 * the whole app is testable locally with zero external accounts.
 */

const isConfigured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME);
const s3 = isConfigured ? new S3Client({ region: process.env.AWS_REGION || "me-south-1" }) : null; // Bahrain region: closer to PK than us-east
const BUCKET = process.env.S3_BUCKET_NAME;
const SELF_BASE_URL = process.env.SELF_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

const ALLOWED_PURPOSES = ["profile-photo", "cnic-front", "cnic-back", "selfie"];
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function getSignedUploadUrl({ userId, purpose, contentType }) {
  if (!ALLOWED_PURPOSES.includes(purpose)) throw new Error("Invalid upload purpose");
  if (!ALLOWED_TYPES.includes(contentType)) throw new Error("Unsupported file type");

  const key = `${purpose}/${userId}/${crypto.randomUUID()}.${contentType.split("/")[1]}`;

  if (!isConfigured) {
    // A short-lived signed token authorizing exactly this key/user/content-type,
    // so the local PUT endpoint (routes/uploads.js) can't be used to write
    // arbitrary files without going through this function first.
    const uploadToken = jwt.sign({ key, userId, contentType }, process.env.JWT_SECRET, { expiresIn: "5m" });
    return {
      uploadUrl: `${SELF_BASE_URL}/uploads/local/${encodeURIComponent(key)}?token=${uploadToken}`,
      publicUrl: `${SELF_BASE_URL}/uploads/static/${key}`,
      key,
    };
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    // ID documents/selfies go in a private prefix; profile photos are
    // served publicly (still access-controlled at the CDN/bucket-policy level
    // for blur-until-match, handled by the app layer, not S3 ACLs alone).
    ACL: purpose === "profile-photo" ? "public-read" : "private",
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min to upload

  let publicUrl;
  if (purpose === "profile-photo") {
    publicUrl = `https://${BUCKET}.s3.amazonaws.com/${key}`;
  } else {
    // Private objects (CNIC/selfie): return a signed GET so a third-party
    // KYC provider can actually fetch it over HTTP. An s3:// URI (the
    // previous behavior here) isn't fetchable by an external API.
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    publicUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });
  }

  return { uploadUrl, publicUrl, key };
}

async function deleteObject(key) {
  if (!isConfigured) return; // local dev files are left on disk; not worth building cleanup for a fallback path
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { getSignedUploadUrl, deleteObject, isConfigured };
