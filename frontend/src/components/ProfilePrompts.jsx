import React, { useState } from "react";
import { Plus, X as XIcon } from "lucide-react";
import { api } from "../api/client.js";

const MAX_PROMPTS = 3;

// A small curated list, Tinder/Hope-style. Kept client-side (not a DB enum)
// so new ones can be added without a migration — the backend just stores
// whatever question string is sent, capped at 3 per profile.
const PROMPT_QUESTIONS = [
  "The key to my heart is",
  "Two truths and a lie",
  "The first item on my bucket list",
  "My simple pleasures",
  "Let's talk about",
  "My most controversial opinion",
  "The way to win me over",
  "A perfect Sunday looks like",
];

const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#5A5347", marginTop: 14, marginBottom: 6, display: "block" };
const inputStyle = { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #E4DCC9", fontFamily: "'Inter', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };

export default function ProfilePrompts({ initialPrompts = [] }) {
  const [prompts, setPrompts] = useState(() => initialPrompts.map((p) => ({ question: p.question, answer: p.answer })));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const availableQuestions = PROMPT_QUESTIONS.filter((q) => !prompts.some((p) => p.question === q));

  const addPrompt = () => {
    if (prompts.length >= MAX_PROMPTS || !availableQuestions.length) return;
    setPrompts((prev) => [...prev, { question: availableQuestions[0], answer: "" }]);
    setSaved(false);
  };

  const updatePrompt = (index, field, value) => {
    setPrompts((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
    setSaved(false);
  };

  const removePrompt = (index) => {
    setPrompts((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  };

  const save = async () => {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const cleaned = prompts.filter((p) => p.answer.trim().length > 0);
      await api.savePrompts(cleaned);
      setPrompts(cleaned);
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
        Add up to {MAX_PROMPTS} prompts — a good conversation starter beats "hey" every time.
      </p>
      {error && <div style={{ background: "#FBEAE6", color: "#B5574B", padding: "10px 14px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12.5, marginTop: 12 }}>{error}</div>}
      {saved && (
        <div style={{ background: "#E7F5EC", color: "#1E7A4C", padding: "10px 14px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12.5, marginTop: 12 }}>
          Saved.
        </div>
      )}

      {prompts.map((p, i) => (
        <div key={i} style={{ border: "1.5px solid #E4DCC9", borderRadius: 12, padding: 14, marginTop: 14, position: "relative" }}>
          <button onClick={() => removePrompt(i)} style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", cursor: "pointer", color: "#B5574B" }}>
            <XIcon size={16} />
          </button>
          <label style={{ ...labelStyle, marginTop: 0 }}>Prompt</label>
          <select
            value={p.question}
            onChange={(e) => updatePrompt(i, "question", e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value={p.question}>{p.question}</option>
            {availableQuestions.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
          <label style={labelStyle}>Your answer</label>
          <input
            style={inputStyle}
            maxLength={300}
            placeholder="Keep it short and specific..."
            value={p.answer}
            onChange={(e) => updatePrompt(i, "answer", e.target.value)}
          />
        </div>
      ))}

      {prompts.length < MAX_PROMPTS && (
        <button
          onClick={addPrompt}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "12px 0", marginTop: 14, borderRadius: 10, border: "1.5px dashed #C9A24B", background: "#FBF6E9", color: "#0F3D3E", fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}
        >
          <Plus size={16} /> Add a prompt
        </button>
      )}

      <div style={{ marginTop: 20 }}>
        <button
          onClick={save}
          disabled={loading}
          style={{ width: "100%", padding: "13px 22px", borderRadius: 10, border: "none", background: "#0F3D3E", color: "#F7F3EA", fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Saving..." : "Save prompts"}
        </button>
      </div>
    </div>
  );
}
