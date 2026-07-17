import React, { useState, useEffect, useCallback } from "react";
import { Heart, Shield, Users, MessageCircle, X, EyeOff, ChevronLeft, Send, Flag, Lock, Loader2, Settings as SettingsIcon, ShieldCheck, Camera } from "lucide-react";
import { api, setToken, getToken, getMyUserId } from "./api/client.js";
import { connectSocket, disconnectSocket } from "./api/socket.js";
import PhotoUpload from "./components/PhotoUpload.jsx";
import IdVerification from "./components/IdVerification.jsx";
import GuardianInvite from "./components/GuardianInvite.jsx";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#5A5347", marginTop: 14, marginBottom: 6, display: "block" };
const inputStyle = { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #E4DCC9", fontFamily: "'Inter', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };

function PaisleyDivider() {
  return (
    <svg width="120" height="16" viewBox="0 0 120 16" fill="none" style={{ display: "block", margin: "0 auto" }}>
      <path d="M2 8 C 20 -4, 30 20, 48 8 S 78 -4, 96 8 S 110 16, 118 8" stroke="#C9A24B" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="60" cy="8" r="2.5" fill="#C9A24B" />
    </svg>
  );
}

function TopBar({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid #E4DCC9" }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", marginRight: 12, color: "#0F3D3E" }}>
          <ChevronLeft size={22} />
        </button>
      )}
      <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 600, color: "#0F3D3E" }}>{title}</span>
    </div>
  );
}

function Button({ children, onClick, variant = "primary", disabled, style }) {
  const base = { padding: "13px 22px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer", border: "none", opacity: disabled ? 0.5 : 1, width: "100%" };
  const variants = {
    primary: { background: "#0F3D3E", color: "#F7F3EA" },
    gold: { background: "#C9A24B", color: "#16211F" },
    outline: { background: "transparent", color: "#0F3D3E", border: "1.5px solid #0F3D3E" },
    ghost: { background: "transparent", color: "#8A8375" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{ background: "#FBEAE6", color: "#B5574B", padding: "10px 14px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 13, marginBottom: 14 }}>
      {message}
    </div>
  );
}

/* ---------- Onboarding screens ---------- */

function Welcome({ onNext }) {
  return (
    <div style={{ padding: "60px 28px 40px", textAlign: "center", minHeight: 560, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 42, color: "#0F3D3E" }}>Qubool</div>
        <div style={{ marginTop: 6, marginBottom: 22 }}><PaisleyDivider /></div>
        <p style={{ fontFamily: "'Inter', sans-serif", color: "#5A5347", fontSize: 15, lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>
          A considerate way to meet someone — built around intention, family, and privacy.
        </p>
      </div>
      <Button onClick={onNext}>Get started</Button>
    </div>
  );
}

function PhoneVerify({ onVerified }) {
  const [phone, setPhone] = useState("+92");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async () => {
    setLoading(true);
    setError("");
    try {
      await api.requestOtp(phone);
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.verifyOtp(phone, code);
      setToken(result.token);
      onVerified();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <TopBar title="Verify your number" />
      <div style={{ padding: 24 }}>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#5A5347", marginBottom: 20 }}>
          We verify every profile by phone number to keep the community genuine.
        </p>
        <ErrorBanner message={error} />
        {!sent ? (
          <>
            <label style={labelStyle}>Mobile number</label>
            <input style={inputStyle} placeholder="+923001234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <div style={{ marginTop: 18 }}>
              <Button onClick={sendCode} disabled={loading || phone.length < 10}>
                {loading ? "Sending..." : "Send code"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <label style={labelStyle}>Enter the 6-digit code</label>
            <input style={inputStyle} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
            <div style={{ marginTop: 18 }}>
              <Button onClick={verify} disabled={loading || code.length < 6}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IntentionSelect({ onNext, draft, setDraft }) {
  const options = [
    { key: "MARRIAGE", label: "Marriage", desc: "Looking for a life partner, with family involved when ready." },
    { key: "SERIOUS_RELATIONSHIP", label: "Serious relationship", desc: "Getting to know someone with long-term intent." },
    { key: "FRIENDSHIP", label: "Friendship first", desc: "Open to where a genuine connection leads." },
  ];
  return (
    <div>
      <TopBar title="What are you looking for?" />
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {options.map((o) => (
            <div key={o.key} onClick={() => setDraft({ ...draft, intention: o.key })}
              style={{ padding: 16, borderRadius: 12, border: draft.intention === o.key ? "2px solid #C9A24B" : "1.5px solid #E4DCC9", background: draft.intention === o.key ? "#FBF6E9" : "#fff", cursor: "pointer" }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: "#0F3D3E", fontWeight: 600 }}>{o.label}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#7A7364", marginTop: 4 }}>{o.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <label style={labelStyle}>I am a</label>
          <div style={{ display: "flex", gap: 10 }}>
            {["MALE", "FEMALE"].map((g) => (
              <div key={g} onClick={() => setDraft({ ...draft, gender: g })}
                style={{ flex: 1, textAlign: "center", padding: 10, borderRadius: 10, border: draft.gender === g ? "2px solid #C9A24B" : "1.5px solid #E4DCC9", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: "#0F3D3E" }}>
                {g === "MALE" ? "Man" : "Woman"}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 24 }}>
          <Button onClick={onNext} disabled={!draft.intention || !draft.gender}>Continue</Button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ icon, title, desc, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 14, border: "1.5px solid #E4DCC9", borderRadius: 12 }}>
      <div style={{ marginTop: 2 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: "#16211F" }}>{title}</div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "#8A8375", marginTop: 3 }}>{desc}</div>
      </div>
      <div onClick={() => onChange(!value)} style={{ cursor: "pointer", width: 42, height: 24, borderRadius: 12, background: value ? "#C9A24B" : "#E4DCC9", position: "relative", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 3, left: value ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
      </div>
    </div>
  );
}

function PrivacySetup({ onNext, draft, setDraft }) {
  return (
    <div>
      <TopBar title="Privacy & family settings" />
      <div style={{ padding: 24 }}>
        <ToggleRow icon={<EyeOff size={18} color="#0F3D3E" />} title="Blur my photos until we match" desc="Only matched, mutually-interested users see your clear photo."
          value={draft.blurPhotosDefault} onChange={(v) => setDraft({ ...draft, blurPhotosDefault: v })} />
        <div style={{ height: 14 }} />
        <ToggleRow icon={<Users size={18} color="#0F3D3E" />} title="Enable guardian mode" desc="A parent or guardian you choose can see match notifications. Fully optional and revocable anytime."
          value={draft.guardianModeOn} onChange={(v) => setDraft({ ...draft, guardianModeOn: v })} />
        <div style={{ marginTop: 24 }}>
          <Button onClick={onNext}>Continue</Button>
        </div>
      </div>
    </div>
  );
}

function ProfileSetup({ onNext, draft, setDraft }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const finish = async () => {
    setLoading(true);
    setError("");
    try {
      await api.createProfile({
        name: draft.name,
        age: Number(draft.age),
        gender: draft.gender,
        city: draft.city,
        intention: draft.intention,
        bio: draft.bio || undefined,
        blurPhotosDefault: draft.blurPhotosDefault,
        guardianModeOn: draft.guardianModeOn,
      });
      onNext();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <TopBar title="Tell us about you" />
      <div style={{ padding: 24 }}>
        <ErrorBanner message={error} />
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Your name" />
        <label style={labelStyle}>Age</label>
        <input style={inputStyle} value={draft.age} onChange={(e) => setDraft({ ...draft, age: e.target.value })} placeholder="e.g. 27" />
        <label style={labelStyle}>City</label>
        <input style={inputStyle} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="e.g. Lahore" />
        <label style={labelStyle}>A little about you</label>
        <textarea style={{ ...inputStyle, height: 80, resize: "none" }} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} placeholder="What matters to you..." />
        <div style={{ marginTop: 18 }}>
          <Button onClick={finish} disabled={loading || !draft.name || !draft.age || !draft.city}>
            {loading ? "Saving..." : "Finish setup"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main app screens ---------- */

function Tag({ children }) {
  return <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, fontWeight: 600, color: "#0F3D3E", background: "#F0EAD6", padding: "4px 10px", borderRadius: 20 }}>{children}</span>;
}

function CircleButton({ children, onClick, color, filled, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: 56, height: 56, borderRadius: "50%", border: `2px solid ${color}`, background: filled ? color : "#fff", color: filled ? "#fff" : color, display: "flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

function Discover({ onMatched }) {
  const [candidates, setCandidates] = useState(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const batch = await api.getDiscoverBatch();
      setCandidates(batch);
      setIndex(0);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <div style={{ padding: 24 }}><ErrorBanner message={error} /></div>;
  if (candidates === null) return <div style={{ padding: 60, textAlign: "center" }}><Loader2 className="spin" size={24} color="#0F3D3E" /></div>;

  const current = candidates[index];

  if (!current) {
    return (
      <div style={{ padding: 24, textAlign: "center", minHeight: 500, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#0F3D3E" }}>That's today's batch</div>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8A8375", marginTop: 8 }}>New curated matches arrive tomorrow morning.</p>
      </div>
    );
  }

  const act = async (action) => {
    setActing(true);
    try {
      const result = await api.sendAction(current.userId, action);
      if (result.matched) onMatched();
      setIndex((i) => i + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setActing(false);
    }
  };

  const primaryPhoto = current.photos?.[0];

  return (
    <div style={{ padding: 20 }}>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#8A8375", marginBottom: 10, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>Today's curated match</div>
      <div style={{ borderRadius: 18, overflow: "hidden", border: "1.5px solid #E4DCC9", background: "#fff" }}>
        <div style={{ position: "relative", height: 280, background: "#E4DCC9" }}>
          {primaryPhoto && !primaryPhoto.blurred && (
            <img src={primaryPhoto.url} alt={current.name} style={{ width: "100%", height: 280, objectFit: "cover" }} />
          )}
          {primaryPhoto?.blurred && (
            <div style={{ width: "100%", height: 280, filter: "blur(18px)", background: "linear-gradient(135deg,#C9A24B,#0F3D3E)" }} />
          )}
          {current.verified && (
            <div style={{ position: "absolute", top: 12, right: 12, background: "#0F3D3E", color: "#F7F3EA", fontSize: 11, padding: "4px 9px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
              <Shield size={11} /> Verified
            </div>
          )}
          {primaryPhoto?.blurred && (
            <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(15,61,62,0.85)", color: "#F7F3EA", fontSize: 11, padding: "4px 9px", borderRadius: 20 }}>
              Revealed after mutual match
            </div>
          )}
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, color: "#16211F", fontWeight: 600 }}>{current.name}, {current.age}</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8A8375", marginTop: 2 }}>{current.city}{current.education ? ` · ${current.education}` : ""}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <Tag>{current.intention?.replace("_", " ")}</Tag>
            {current.sect && <Tag>{current.sect}</Tag>}
          </div>
          {current.bio && <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: "#5A5347", marginTop: 12, lineHeight: 1.5 }}>{current.bio}</p>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 18, justifyContent: "center" }}>
        <CircleButton onClick={() => act("PASS")} color="#B5574B" disabled={acting}><X size={22} /></CircleButton>
        <CircleButton onClick={() => act("LIKE")} color="#0F3D3E" filled disabled={acting}><Heart size={22} /></CircleButton>
      </div>
    </div>
  );
}

function Matches({ onOpenChat, refreshKey }) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMatches().then(setMatches).catch((e) => setError(e.message));
  }, [refreshKey]);

  if (error) return <div style={{ padding: 24 }}><ErrorBanner message={error} /></div>;
  if (matches === null) return <div style={{ padding: 60, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#0F3D3E", marginBottom: 14 }}>Your matches</div>
      {matches.length === 0 ? (
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8A8375" }}>No matches yet — they'll appear here once there's mutual interest.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {matches.map((m) => (
            <div key={m.matchId} onClick={() => onOpenChat(m)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, border: "1.5px solid #E4DCC9", borderRadius: 12, cursor: "pointer" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#E4DCC9", flexShrink: 0, backgroundImage: m.otherUser.photo ? `url(${m.otherUser.photo})` : undefined, backgroundSize: "cover" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: "#16211F" }}>{m.otherUser.name}</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "#8A8375" }}>{m.lastMessage || "Say hello 👋"}</div>
              </div>
              <MessageCircle size={18} color="#C9A24B" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chat({ match, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMessages(match.matchId).then(setMessages).catch((e) => setError(e.message));

    const socket = connectSocket();
    socket.emit("match:join", match.matchId);
    const handler = (msg) => setMessages((prev) => [...prev, msg]);
    socket.on("message:new", handler);

    return () => {
      socket.off("message:new", handler);
      socket.emit("match:leave", match.matchId);
    };
  }, [match.matchId]);

  const send = async () => {
    if (!text.trim()) return;
    const body = text;
    setText("");
    try {
      await api.sendMessage(match.matchId, body);
      // message will also arrive via socket for the recipient; sender
      // appends optimistically via the POST response for instant feedback
    } catch (e) {
      setError(e.message);
    }
  };

  const report = async () => {
    try {
      await api.fileReport(match.otherUser.userId, "HARASSMENT", "Reported from chat");
      alert("Report sent to our safety team.");
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 560 }}>
      <TopBar title={match.otherUser.name} onBack={onBack} />
      <div style={{ flex: 1, padding: 18, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <ErrorBanner message={error} />
        {messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.senderId === match.myUserId ? "flex-end" : "flex-start", maxWidth: "75%", background: m.senderId === match.myUserId ? "#0F3D3E" : "#F0EAD6", color: m.senderId === match.myUserId ? "#F7F3EA" : "#16211F", padding: "10px 14px", borderRadius: 14, fontFamily: "'Inter', sans-serif", fontSize: 14 }}>
            {m.body}
          </div>
        ))}
      </div>
      <div style={{ padding: 14, borderTop: "1px solid #E4DCC9", display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={report} style={{ background: "none", border: "none", cursor: "pointer", color: "#B5574B" }} title="Report"><Flag size={18} /></button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message..." style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: "1.5px solid #E4DCC9", fontFamily: "'Inter', sans-serif", fontSize: 14, outline: "none" }} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button onClick={send} style={{ background: "#C9A24B", border: "none", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Send size={16} color="#16211F" /></button>
      </div>
    </div>
  );
}

function OnboardingPhotoStep({ onDone }) {
  return (
    <div>
      <TopBar title="Add your photos" />
      <div style={{ padding: 24 }}>
        <PhotoUpload onContinue={onDone} />
      </div>
    </div>
  );
}

function Settings() {
  const [section, setSection] = useState("menu"); // menu | photos | id | guardian
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMyProfile().then(setProfile).catch((e) => setError(e.message));
  }, []);

  const items = [
    { key: "photos", label: "Manage photos", icon: <Camera size={18} color="#0F3D3E" /> },
    { key: "id", label: "ID verification", icon: <ShieldCheck size={18} color="#0F3D3E" /> },
    { key: "guardian", label: "Guardian mode", icon: <Users size={18} color="#0F3D3E" /> },
  ];

  if (section !== "menu") {
    return (
      <div>
        <TopBar title="Settings" onBack={() => setSection("menu")} />
        <div style={{ padding: 24 }}>
          {section === "photos" && <PhotoUpload initialPhotos={profile?.photos || []} showContinue={false} />}
          {section === "id" && <IdVerification />}
          {section === "guardian" && <GuardianInvite guardianModeOn={!!profile?.guardianModeOn} />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#0F3D3E", marginBottom: 14 }}>Settings</div>
      {error && <ErrorBanner message={error} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item) => (
          <div key={item.key} onClick={() => setSection(item.key)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, border: "1.5px solid #E4DCC9", borderRadius: 12, cursor: "pointer" }}>
            {item.icon}
            <span style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: "#16211F" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ flex: 1, background: "none", border: "none", padding: "12px 0", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: active ? "#0F3D3E" : "#B7AF9C" }}>
      {icon}
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

/* ---------- App shell ---------- */

export default function App() {
  const [step, setStep] = useState(getToken() ? "checking" : "welcome");
  const [onboardSub, setOnboardSub] = useState(0);
  const [tab, setTab] = useState("discover");
  const [activeChat, setActiveChat] = useState(null);
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0);
  const [draft, setDraft] = useState({ name: "", age: "", city: "", bio: "", intention: null, gender: null, blurPhotosDefault: true, guardianModeOn: false });

  // On load, if we already have a token, check whether a profile exists
  // and skip straight to the app instead of re-running onboarding.
  useEffect(() => {
    if (step !== "checking") return;
    api.getMyProfile()
      .then(() => setStep("app"))
      .catch(() => setStep("onboarding"));
  }, [step]);

  useEffect(() => () => disconnectSocket(), []);

  const shellStyle = { maxWidth: 400, margin: "0 auto", minHeight: 640, background: "#F7F3EA", borderRadius: 20, boxShadow: "0 8px 40px rgba(15,61,62,0.15)", overflow: "hidden", fontFamily: "'Inter', sans-serif", position: "relative" };

  if (step === "checking") {
    return <div style={shellStyle}><style>{FONT_IMPORT}</style><div style={{ padding: 60, textAlign: "center" }}>Loading...</div></div>;
  }

  if (step === "welcome") {
    return <div style={shellStyle}><style>{FONT_IMPORT}</style><Welcome onNext={() => setStep("onboarding")} /></div>;
  }

  if (step === "onboarding") {
    return (
      <div style={shellStyle}>
        <style>{FONT_IMPORT}</style>
        {onboardSub === 0 && <PhoneVerify onVerified={() => setOnboardSub(1)} />}
        {onboardSub === 1 && <IntentionSelect onNext={() => setOnboardSub(2)} draft={draft} setDraft={setDraft} />}
        {onboardSub === 2 && <PrivacySetup onNext={() => setOnboardSub(3)} draft={draft} setDraft={setDraft} />}
        {onboardSub === 3 && <ProfileSetup onNext={() => setOnboardSub(4)} draft={draft} setDraft={setDraft} />}
        {onboardSub === 4 && <OnboardingPhotoStep onDone={() => setStep("app")} />}
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <style>{FONT_IMPORT}</style>
      {activeChat ? (
        <Chat match={activeChat} onBack={() => { setActiveChat(null); setMatchesRefreshKey((k) => k + 1); }} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #E4DCC9" }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: "#0F3D3E", fontWeight: 600 }}>Qubool</span>
            <Lock size={16} color="#C9A24B" />
          </div>
          {tab === "discover" && <Discover onMatched={() => setMatchesRefreshKey((k) => k + 1)} />}
          {tab === "matches" && <Matches onOpenChat={(m) => setActiveChat({ ...m, myUserId: getMyUserId() })} refreshKey={matchesRefreshKey} />}
          {tab === "settings" && <Settings />}
          <div style={{ display: "flex", borderTop: "1px solid #E4DCC9", position: "absolute", bottom: 0, left: 0, right: 0, background: "#F7F3EA" }}>
            <TabButton active={tab === "discover"} onClick={() => setTab("discover")} icon={<Heart size={18} />} label="Discover" />
            <TabButton active={tab === "matches"} onClick={() => setTab("matches")} icon={<MessageCircle size={18} />} label="Matches" />
            <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<SettingsIcon size={18} />} label="Settings" />
          </div>
        </>
      )}
    </div>
  );
}
