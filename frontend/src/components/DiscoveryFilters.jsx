import React, { useState } from "react";
import { api } from "../api/client.js";

const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#5A5347", marginTop: 14, marginBottom: 6, display: "block" };
const inputStyle = { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #E4DCC9", fontFamily: "'Inter', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };

function ToggleRow({ title, desc, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 14, border: "1.5px solid #E4DCC9", borderRadius: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: "#16211F" }}>{title}</div>
        {desc && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#8A8375", marginTop: 3 }}>{desc}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{ cursor: "pointer", width: 42, height: 24, borderRadius: 12, background: value ? "#C9A24B" : "#E4DCC9", position: "relative", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 3, left: value ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
      </div>
    </div>
  );
}

export default function DiscoveryFilters({ profile }) {
  const [draft, setDraft] = useState({
    preferredGender: profile.preferredGender || "ANY",
    ageMin: String(profile.ageMin ?? 18),
    ageMax: String(profile.ageMax ?? 60),
    sameCityOnly: !!profile.sameCityOnly,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const ageMinNum = Number(draft.ageMin);
  const ageMaxNum = Number(draft.ageMax);
  const valid = ageMinNum >= 18 && ageMaxNum >= 18 && ageMinNum <= ageMaxNum && ageMaxNum <= 80;

  const save = async () => {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      await api.updateProfile({
        preferredGender: draft.preferredGender,
        ageMin: ageMinNum,
        ageMax: ageMaxNum,
        sameCityOnly: draft.sameCityOnly,
      });
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: "#5A5347", lineHeight: 1.5, marginBottom: 4 }}>
        Narrow who shows up in your Discover feed.
      </p>
      {error && <div style={{ background: "#FBEAE6", color: "#B5574B", padding: "10px 14px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12.5, marginTop: 12 }}>{error}</div>}
      {saved && (
        <div style={{ background: "#E7F5EC", color: "#1E7A4C", padding: "10px 14px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12.5, marginTop: 12 }}>
          Saved.
        </div>
      )}

      <label style={labelStyle}>Show me</label>
      <div style={{ display: "flex", gap: 8 }}>
        {[{ v: "MALE", l: "Men" }, { v: "FEMALE", l: "Women" }, { v: "ANY", l: "Everyone" }].map((o) => (
          <div key={o.v} onClick={() => setDraft({ ...draft, preferredGender: o.v })}
            style={{ flex: 1, textAlign: "center", padding: 10, borderRadius: 10, border: draft.preferredGender === o.v ? "2px solid #C9A24B" : "1.5px solid #E4DCC9", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#0F3D3E" }}>
            {o.l}
          </div>
        ))}
      </div>

      <label style={labelStyle}>Age range</label>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input style={inputStyle} value={draft.ageMin} onChange={(e) => setDraft({ ...draft, ageMin: e.target.value.replace(/\D/g, "") })} placeholder="Min" />
        <span style={{ color: "#8A8375", fontFamily: "'Inter', sans-serif" }}>to</span>
        <input style={inputStyle} value={draft.ageMax} onChange={(e) => setDraft({ ...draft, ageMax: e.target.value.replace(/\D/g, "") })} placeholder="Max" />
      </div>
      {!valid && (
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#B5574B", marginTop: 6 }}>
          Ages must be 18–80, and minimum can't be greater than maximum.
        </p>
      )}

      <div style={{ marginTop: 14 }}>
        <ToggleRow title="Same city only" desc="Only show people in your city." value={draft.sameCityOnly} onChange={(v) => setDraft({ ...draft, sameCityOnly: v })} />
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={save}
          disabled={loading || !valid}
          style={{ width: "100%", padding: "13px 22px", borderRadius: 10, border: "none", background: "#0F3D3E", color: "#F7F3EA", fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, cursor: loading || !valid ? "not-allowed" : "pointer", opacity: loading || !valid ? 0.6 : 1 }}
        >
          {loading ? "Saving..." : "Save filters"}
        </button>
      </div>
    </div>
  );
}
