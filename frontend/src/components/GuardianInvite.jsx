import React, { useState } from "react";
import { Users, CheckCircle2 } from "lucide-react";
import { api } from "../api/client.js";

const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#5A5347", marginTop: 14, marginBottom: 6, display: "block" };
const inputStyle = { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #E4DCC9", fontFamily: "'Inter', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };

export default function GuardianInvite({ guardianModeOn }) {
  const [phone, setPhone] = useState("+92");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [invited, setInvited] = useState([]); // list of phones invited this session

  const valid = /^\+92\d{10}$/.test(phone);

  const invite = async () => {
    setSubmitting(true);
    setError("");
    try {
      await api.inviteGuardian(phone);
      setInvited((prev) => [...prev, phone]);
      setPhone("+92");
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!guardianModeOn) {
    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Users size={18} color="#0F3D3E" />
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 600, color: "#0F3D3E" }}>Guardian mode</span>
        </div>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5A5347", lineHeight: 1.5 }}>
          Guardian mode is currently off. Turn it on in your privacy settings first, then come back here to invite someone.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Users size={18} color="#0F3D3E" />
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 600, color: "#0F3D3E" }}>Guardian mode</span>
      </div>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5A5347", lineHeight: 1.5, marginTop: 8 }}>
        Invite a parent or guardian to see that you have matches — never message content.
        You can revoke this at any time from settings.
      </p>

      {error && <div style={{ background: "#FBEAE6", color: "#B5574B", padding: "10px 14px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12.5, marginTop: 12 }}>{error}</div>}

      <label style={labelStyle}>Guardian's phone number</label>
      <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+923001234567" />

      <button
        onClick={invite}
        disabled={submitting || !valid}
        style={{
          width: "100%", marginTop: 14, padding: "13px 22px", borderRadius: 10, border: "none",
          background: "#0F3D3E", color: "#F7F3EA", fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15,
          cursor: submitting || !valid ? "not-allowed" : "pointer", opacity: submitting || !valid ? 0.5 : 1,
        }}
      >
        {submitting ? "Sending invite..." : "Invite guardian"}
      </button>

      {invited.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#8A8375", marginBottom: 6 }}>Invited this session</div>
          {invited.map((p) => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
              <CheckCircle2 size={14} color="#1E7A4C" />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#16211F" }}>{p}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
