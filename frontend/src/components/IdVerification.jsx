import React, { useState, useEffect, useRef, useCallback } from "react";
import { ShieldCheck, Camera, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { api } from "../api/client.js";

const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "#5A5347", marginTop: 14, marginBottom: 6, display: "block" };
const inputStyle = { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #E4DCC9", fontFamily: "'Inter', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };

function ImagePickerTile({ label, purpose, onFileReady, value }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPEG, PNG, or WEBP image");
      return;
    }
    setError("");
    onFileReady(purpose, file);
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          width: "100%", height: 90, borderRadius: 12, border: "1.5px dashed #C9A24B", background: value ? "#E7F5EC" : "#FBF6E9",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 8,
        }}
      >
        {value ? <CheckCircle2 size={18} color="#1E7A4C" /> : <Camera size={18} color="#C9A24B" />}
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: value ? "#1E7A4C" : "#7A7364", fontWeight: 600 }}>
          {value ? `${label} ready` : `Add ${label}`}
        </span>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleFile} />
      {error && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#B5574B", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const STATUS_INFO = {
  UNVERIFIED: { icon: <Clock size={16} />, color: "#8A8375", label: "Not started" },
  ID_PENDING: { icon: <Clock size={16} />, color: "#C9A24B", label: "Under review — usually takes a few minutes" },
  PENDING: { icon: <Clock size={16} />, color: "#C9A24B", label: "Under review — usually takes a few minutes" },
  PASSED: { icon: <CheckCircle2 size={16} />, color: "#1E7A4C", label: "Verified" },
  ID_VERIFIED: { icon: <CheckCircle2 size={16} />, color: "#1E7A4C", label: "Verified" },
  FAILED: { icon: <XCircle size={16} />, color: "#B5574B", label: "Verification failed — you can try again" },
  REJECTED: { icon: <XCircle size={16} />, color: "#B5574B", label: "Verification failed — you can try again" },
};

export default function IdVerification() {
  const [cnicNumber, setCnicNumber] = useState("");
  const [files, setFiles] = useState({ "cnic-front": null, "cnic-back": null, selfie: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null); // null while loading initial status
  const pollRef = useRef(null);

  const checkStatus = useCallback(async () => {
    try {
      const result = await api.getIdVerificationStatus();
      setStatus(result.status);
      if (result.status === "PENDING") {
        pollRef.current = setTimeout(checkStatus, 4000);
      }
    } catch {
      setStatus("UNVERIFIED"); // no verification submitted yet — that's a normal 404
    }
  }, []);

  useEffect(() => {
    checkStatus();
    return () => clearTimeout(pollRef.current);
  }, [checkStatus]);

  const allFilesReady = Object.values(files).every(Boolean);
  const cnicValid = /^\d{13}$/.test(cnicNumber);

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const uploads = {};
      for (const [purpose, file] of Object.entries(files)) {
        const { publicUrl } = await api.uploadFile(file, purpose);
        uploads[purpose] = publicUrl;
      }
      await api.submitIdVerification({
        cnicNumber,
        cnicFrontUrl: uploads["cnic-front"],
        cnicBackUrl: uploads["cnic-back"],
        selfieUrl: uploads.selfie,
      });
      setStatus("PENDING");
      pollRef.current = setTimeout(checkStatus, 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === null) {
    return <div style={{ padding: 40, textAlign: "center" }}><Loader2 size={22} color="#0F3D3E" style={{ animation: "spin 1s linear infinite" }} /></div>;
  }

  const info = STATUS_INFO[status] || STATUS_INFO.UNVERIFIED;
  const canSubmit = status === "UNVERIFIED" || status === "FAILED" || status === "REJECTED";

  return (
    <div style={{ padding: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <ShieldCheck size={18} color="#0F3D3E" />
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 600, color: "#0F3D3E" }}>ID verification</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: info.color }}>
        {info.icon}
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600 }}>{info.label}</span>
      </div>

      {canSubmit && (
        <>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#5A5347", lineHeight: 1.5, marginTop: 12 }}>
            Verifying with your CNIC adds a badge to your profile and helps keep the community genuine.
            Your CNIC number is never stored — only used to confirm your identity.
          </p>
          {error && <div style={{ background: "#FBEAE6", color: "#B5574B", padding: "10px 14px", borderRadius: 10, fontFamily: "'Inter', sans-serif", fontSize: 12.5, marginTop: 10 }}>{error}</div>}

          <label style={labelStyle}>CNIC number (13 digits, no dashes)</label>
          <input style={inputStyle} value={cnicNumber} onChange={(e) => setCnicNumber(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="3520112345678" />

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            <ImagePickerTile label="CNIC front" purpose="cnic-front" value={files["cnic-front"]} onFileReady={(p, f) => setFiles((prev) => ({ ...prev, [p]: f }))} />
            <ImagePickerTile label="CNIC back" purpose="cnic-back" value={files["cnic-back"]} onFileReady={(p, f) => setFiles((prev) => ({ ...prev, [p]: f }))} />
            <ImagePickerTile label="a selfie" purpose="selfie" value={files.selfie} onFileReady={(p, f) => setFiles((prev) => ({ ...prev, [p]: f }))} />
          </div>

          <button
            onClick={submit}
            disabled={submitting || !allFilesReady || !cnicValid}
            style={{
              width: "100%", marginTop: 18, padding: "13px 22px", borderRadius: 10, border: "none",
              background: "#0F3D3E", color: "#F7F3EA", fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15,
              cursor: submitting || !allFilesReady || !cnicValid ? "not-allowed" : "pointer",
              opacity: submitting || !allFilesReady || !cnicValid ? 0.5 : 1,
            }}
          >
            {submitting ? "Submitting..." : "Submit for verification"}
          </button>
        </>
      )}
    </div>
  );
}
