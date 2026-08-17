import React, { useState, useRef } from "react";
import { Camera, Loader2, CheckCircle2, XCircle, Clock, X as XIcon, ChevronLeft as ArrowLeft, ChevronRight as ArrowRight } from "lucide-react";
import { api } from "../api/client.js";

const MAX_PHOTOS = 6;

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

// A filled tile: shows the photo, its moderation status, a delete button,
// and left/right arrows to reorder (first photo = primary/profile photo).
function PhotoTile({ photo, isFirst, isLast, onDelete, onMoveLeft, onMoveRight, busy }) {
  return (
    <div>
      <div style={{ width: "100%", aspectRatio: "3/4", borderRadius: 14, position: "relative", overflow: "hidden", background: `url(${photo.url}) center/cover, #E4DCC9` }}>
        <button
          onClick={onDelete}
          disabled={busy}
          title="Remove photo"
          style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "rgba(15,61,62,0.85)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "not-allowed" : "pointer" }}
        >
          <XIcon size={13} />
        </button>
        <div style={{ position: "absolute", bottom: 6, left: 6 }}>
          <StatusPill status={photo.moderationStatus} />
        </div>
        {isFirst && (
          <div style={{ position: "absolute", top: 6, left: 6, background: "#C9A24B", color: "#16211F", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10 }}>
            MAIN
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 4 }}>
        <button onClick={onMoveLeft} disabled={isFirst || busy} style={{ background: "none", border: "none", cursor: isFirst || busy ? "not-allowed" : "pointer", opacity: isFirst ? 0.3 : 1, padding: 2 }}>
          <ArrowLeft size={16} color="#0F3D3E" />
        </button>
        <button onClick={onMoveRight} disabled={isLast || busy} style={{ background: "none", border: "none", cursor: isLast || busy ? "not-allowed" : "pointer", opacity: isLast ? 0.3 : 1, padding: 2 }}>
          <ArrowRight size={16} color="#0F3D3E" />
        </button>
      </div>
    </div>
  );
}

// The empty "add a photo" tile. Handles the whole upload lifecycle: pick
// file → request signed URL → PUT to storage → register with the backend →
// backend runs moderation synchronously and returns the verdict.
function AddPhotoTile({ nextOrder, onUploaded }) {
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
      const registered = await api.registerPhoto({ url: publicUrl, s3Key: key, order: nextOrder });
      onUploaded(registered);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <div
        onClick={() => !loading && inputRef.current?.click()}
        style={{ width: "100%", aspectRatio: "3/4", borderRadius: 14, border: "1.5px dashed #C9A24B", background: "#FBF6E9", display: "flex", alignItems: "center", justifyContent: "center", cursor: loading ? "not-allowed" : "pointer" }}
      >
        {loading ? <Loader2 size={24} color="#0F3D3E" style={{ animation: "spin 1s linear infinite" }} /> : <Camera size={26} color="#C9A24B" />}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleFile} />
      {error && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#B5574B", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function PhotoUpload({ initialPhotos = [], onContinue, showContinue = true }) {
  const [photos, setPhotos] = useState(() => [...initialPhotos].sort((a, b) => a.order - b.order));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleUploaded = (photo) => setPhotos((prev) => [...prev, photo]);

  const handleDelete = async (photoId) => {
    setBusy(true);
    setError("");
    try {
      await api.deletePhoto(photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const reordered = [...photos];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setBusy(true);
    setError("");
    try {
      const saved = await api.reorderPhotos(reordered.map((p) => p.id));
      setPhotos(saved);
    } catch (e) {
      setError(e.message);
      setPhotos(photos); // revert on failure
    } finally {
      setBusy(false);
    }
  };

  const hasAtLeastOnePassed = photos.some((p) => p.moderationStatus === "PASSED");
  const hasRejected = photos.some((p) => p.moderationStatus === "REJECTED");

  return (
    <div>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: "#5A5347", lineHeight: 1.5, marginBottom: 4 }}>
        Add up to {MAX_PHOTOS} photos. Each one is reviewed automatically before it appears on your profile. Your first photo is what people see first — use the arrows to reorder.
      </p>
      {error && <div style={{ background: "#FBEAE6", color: "#B5574B", padding: "10px 14px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12.5, marginTop: 12 }}>{error}</div>}
      {hasRejected && (
        <div style={{ background: "#FBEAE6", color: "#B5574B", padding: "10px 14px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12.5, marginTop: 12 }}>
          One photo was rejected by review. Try a different one — clear, front-facing photos of just you work best.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
        {photos.map((photo, i) => (
          <PhotoTile
            key={photo.id}
            photo={photo}
            isFirst={i === 0}
            isLast={i === photos.length - 1}
            busy={busy}
            onDelete={() => handleDelete(photo.id)}
            onMoveLeft={() => move(i, -1)}
            onMoveRight={() => move(i, 1)}
          />
        ))}
        {photos.length < MAX_PHOTOS && <AddPhotoTile nextOrder={photos.length} onUploaded={handleUploaded} />}
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
