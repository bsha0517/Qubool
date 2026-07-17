const crypto = require("crypto");
const axios = require("axios");

/**
 * Thin wrapper around a third-party KYC/liveness provider (Onfido, Persona,
 * or a Pakistan-specific vendor that can validate CNIC + selfie liveness).
 *
 * We deliberately never store the raw CNIC number anywhere in our own DB —
 * only a salted hash for duplicate-account detection, plus the provider's
 * own reference ID so we can poll/receive webhooks about the case.
 *
 * Swap KYC_PROVIDER_BASE_URL / KYC_PROVIDER_API_KEY for your chosen vendor's
 * actual endpoints; the request/response shapes below are illustrative and
 * will need to match whichever provider you sign with.
 */

const PEPPER = process.env.CNIC_HASH_PEPPER || "change-this-pepper";

function hashCnic(cnicNumber) {
  return crypto.createHash("sha256").update(cnicNumber + PEPPER).digest("hex");
}

const isConfigured = !!(process.env.KYC_PROVIDER_BASE_URL && process.env.KYC_PROVIDER_API_KEY);

/**
 * Kicks off a verification case with the provider: CNIC number/front-back
 * images + a selfie for liveness matching. Returns a provider reference ID
 * to poll or receive a webhook against — this call should NOT block for
 * the full decision, since liveness/OCR review can take seconds to minutes.
 */
async function submitIdVerification({ cnicNumber, cnicFrontUrl, cnicBackUrl, selfieUrl }) {
  const cnicHash = hashCnic(cnicNumber);

  if (!isConfigured) {
    // Dev fallback: simulate an async provider by "auto-passing" after
    // creation, so the rest of the flow can be exercised locally.
    console.log(`[KYC DEV FALLBACK] Simulating verification submission for hash=${cnicHash.slice(0, 8)}...`);
    return { providerRefId: `dev-${crypto.randomUUID()}`, cnicHash, status: "PENDING" };
  }

  const response = await axios.post(
    `${process.env.KYC_PROVIDER_BASE_URL}/verifications`,
    { cnic_front: cnicFrontUrl, cnic_back: cnicBackUrl, selfie: selfieUrl },
    { headers: { Authorization: `Bearer ${process.env.KYC_PROVIDER_API_KEY}` } }
  );

  return { providerRefId: response.data.id, cnicHash, status: "PENDING" };
}

/** Polls the provider for a decision on a previously-submitted case. */
async function checkIdVerificationStatus(providerRefId) {
  if (!isConfigured || providerRefId.startsWith("dev-")) {
    // Dev fallback: always resolves to PASSED after being polled once.
    return { status: "PASSED", livenessPassed: true, nameMatchScore: 0.97 };
  }

  const response = await axios.get(`${process.env.KYC_PROVIDER_BASE_URL}/verifications/${providerRefId}`, {
    headers: { Authorization: `Bearer ${process.env.KYC_PROVIDER_API_KEY}` },
  });

  return {
    status: response.data.status, // expect provider to return PASSED | FAILED | PENDING
    livenessPassed: response.data.liveness_passed,
    nameMatchScore: response.data.name_match_score,
    rejectionReason: response.data.rejection_reason,
  };
}

module.exports = { hashCnic, submitIdVerification, checkIdVerificationStatus };
