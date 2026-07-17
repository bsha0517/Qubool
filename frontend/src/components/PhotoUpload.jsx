import React, { useState, useRef } from "react";
import { Camera, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { api } from "../api/client.js";

const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#5A5347", marginTop: 14, marginBottom: 6, display: "block" };

function StatusPill({ status }) {
  const map = {
    PENDING: { icon: <Clock size={12} />, color: "#C9A24B", bg: "#FBF6E9", label: "Reviewing" },
    PASSED: { icon: <CheckCircle2 size={12} />, color: "#1E7A4C", bg: "#E7F5EC", label: "Approved" },
    REJECTED: { icon: <XCircle size={12} />, color: "#B5574B", bg: "#FBEAE6", label: "Rejected" },
  };
  const s = map[status] || map.PENDING;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, padding: "3px 8px", borderRadius: 20 }}>
      {s.icon} {s.label}
    </span>
  );
}

// One tile per photo slot. Handles the whole upload lifecycle: pick file →
// request signed URL → PUT to storage → register with the backend →
// backend runs moderation synchronously and returns the verdict.
function PhotoSlot({ order, photo, onUploaded }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPEG, PNG, or WEBP image");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Keep it under 8MB");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { publicUrl, key } = await api.uploadFile(file, "profile-photo");
      const registered = await api.registerPhoto({ url: publicUrl, s3Key: key, order });
      onUploaded(registered);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div
        onClick={() => !loading && inputRef.current?.click()}
        style={{
          width: "100%", aspectRatio: "3/4", borderRadius: 14, border: "1.5px dashed #C9A24B",
          background: photo ? `url(${photo.url}) center/cover` : "#FBF6E9",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", overflow: "hidden",
        }}
      >
        {loading ? (
          <Loader2 size={24} color="#0F3D3E" style={{ animation: "spin 1s linear infinite" }} />
        ) : !photo ? (
          <Camera size={26} color="#C9A24B" />
        ) : null}
        {photo && (
          <div style={{ position: "absolute", bottom: 6, left: 6 }}>
            <StatusPill status={photo.moderationStatus} />
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleFile} />
      {error && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#B5574B", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function PhotoUpload({ initialPhotos = [], onContinue, showContinue = true }) {
  const [photos, setPhotos] = useState(() => {
    const bySlot = [null, null, null];
    initialPhotos.forEach((p) => { if (p.order < 3) bySlot[p.order] = p; });
    return bySlot;
  });

  const handleUploaded = (order, photo) => {
    setPhotos((prev) => prev.map((p, i) => (i === order ? photo : p)));
  };

  const hasAtLeastOnePassed = photos.some((p) => p?.moderationStatus === "PASSED");
  const hasRejected = photos.some((p) => p?.moderationStatus === "REJECTED");

  return (
    <div>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: "#5A5347", lineHeight: 1.5, marginBottom: 4 }}>
        Add up to 3 photos. Each one is reviewed automatically before it appears on your profile.
      </p>
      {hasRejected && (
        <div style={{ background: "#FBEAE6", color: "#B5574B", padding: "10px 14px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12.5, marginTop: 12 }}>
          One photo was rejected by review. Try a different one — clear, front-facing photos of just you work best.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
        {photos.map((photo, i) => (
          <PhotoSlot key={i} order={i} photo={photo} onUploaded={(p) => handleUploaded(i, p)} />
        ))}
      </div>
      {showContinue && (
        <div style={{ marginTop: 22 }}>
          <button
            onClick={onContinue}
            disabled={!hasAtLeastOnePassed}
            style={{
              width: "100%", padding: "13px 22px", borderRadius: 10, border: "none",
              background: "#0F3D3E", color: "#F7F3EA", fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15,
              cursor: hasAtLeastOnePassed ? "pointer" : "not-allowed", opacity: hasAtLeastOnePassed ? 1 : 0.5,
            }}
          >
            Continue
          </button>
          {!hasAtLeastOnePassed && (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#8A8375", marginTop: 8, textAlign: "center" }}>
              Add at least one approved photo to continue
            </p>
          )}
        </div>
      )}
    </div>
  );
}
