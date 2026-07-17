const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

// Token lives in memory + localStorage so a page refresh doesn't log
// the user out. Swap localStorage for a more secure storage mechanism
// (e.g. httpOnly cookie issued by the backend) before shipping to
// production — localStorage is XSS-readable.
let token = localStorage.getItem("qubool_token") || null;

function setToken(newToken) {
  token = newToken;
  if (newToken) localStorage.setItem("qubool_token", newToken);
  else localStorage.removeItem("qubool_token");
}

function getToken() {
  return token;
}

function getMyUserId() {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub;
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // some endpoints (e.g. 204s) may not return a body
  }

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  // --- auth ---
  requestOtp: (phone) => request("/auth/otp/request", { method: "POST", body: { phone }, auth: false }),
  verifyOtp: (phone, code) => request("/auth/otp/verify", { method: "POST", body: { phone, code }, auth: false }),

  // --- profile ---
  createProfile: (payload) => request("/profile", { method: "POST", body: payload }),
  updateProfile: (payload) => request("/profile", { method: "PATCH", body: payload }),
  getMyProfile: () => request("/profile/me"),
  registerPhoto: (payload) => request("/profile/photos", { method: "POST", body: payload }),

  // --- uploads ---
  getSignedUploadUrl: (purpose, contentType) =>
    request("/uploads/signed-url", { method: "POST", body: { purpose, contentType } }),

  // --- discover / matching ---
  getDiscoverBatch: () => request("/discover"),
  sendAction: (targetUserId, action) => request("/discover/action", { method: "POST", body: { targetUserId, action } }),

  // --- matches / chat ---
  getMatches: () => request("/matches"),
  getMessages: (matchId) => request(`/matches/${matchId}/messages`),
  sendMessage: (matchId, body) => request(`/matches/${matchId}/messages`, { method: "POST", body: { body } }),
  unmatch: (matchId) => request(`/matches/${matchId}/unmatch`, { method: "POST" }),

  // --- guardian ---
  inviteGuardian: (guardianPhone) => request("/guardian/invite", { method: "POST", body: { guardianPhone } }),

  // --- verification ---
  submitIdVerification: (payload) => request("/verification/id", { method: "POST", body: payload }),
  getIdVerificationStatus: () => request("/verification/id/status"),

  // --- reports ---
  fileReport: (reportedUserId, reason, details) =>
    request("/reports", { method: "POST", body: { reportedUserId, reason, details } }),
};

/**
 * Full upload flow: ask the backend for a signed URL, PUT the raw file
 * bytes directly to storage (bypassing our own server), and return the
 * { publicUrl, key } the caller needs to register the upload afterwards
 * (via registerPhoto or submitIdVerification).
 */
async function uploadFile(file, purpose) {
  const { uploadUrl, publicUrl, key } = await api.getSignedUploadUrl(purpose, file.type);
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload to storage failed — try a different photo");
  return { publicUrl, key };
}

api.uploadFile = uploadFile;

export { setToken, getToken, getMyUserId, API_BASE };
