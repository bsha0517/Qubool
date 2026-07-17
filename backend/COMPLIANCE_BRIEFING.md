# Compliance Briefing: PECA 2016 & Data Residency

**This document is not legal advice.** I'm not a lawyer, and Pakistani tech/data
law is an evolving area. Treat this as a starting brief to hand to actual
counsel licensed in Pakistan — it names the right questions, not the answers.

## Why this matters for this app specifically

- The **Prevention of Electronic Crimes Act (PECA) 2016** is Pakistan's primary
  cybercrime law and touches obscenity, defamation, and data handling for
  services operating in or targeting Pakistan.
- PTA (Pakistan Telecommunication Authority) has a history of blocking dating
  apps (Tinder, Grindr, Tagged, and others) over "immoral"/indecent content
  concerns — this is a live regulatory risk, not a hypothetical one.
- This app stores CNIC hashes, phone numbers, private photos, and chat logs —
  all sensitive by any standard, more so given the social/reputational stakes
  of dating/matrimonial data specifically in Pakistan.

## Questions to bring to counsel

1. **Registration & jurisdiction**
   - Should the operating entity be incorporated in Pakistan, or is an
     offshore entity with a local compliance contact advisable?
   - What licensing, if any, applies to a matchmaking service vs. a "dating"
     app under current PTA guidance — does positioning as "matrimonial"
     meaningfully change the regulatory posture?

2. **Data residency**
   - Does Pakistani law require user data (esp. CNIC-derived data) to be
     stored on servers physically within Pakistan, or is regional hosting
     (e.g. UAE/Bahrain) acceptable?
   - Are there different rules for CNIC-derived hashes vs. photos vs. chat
     logs vs. phone numbers?

3. **PECA-specific obligations**
   - What content moderation and reporting obligations does PECA impose on a
     platform hosting user-generated photos and private messaging?
   - What are the data-retention and law-enforcement-request response
     obligations under PECA, and how should the `Report` /
     `IdVerification` tables in this schema be structured to comply
     (retention windows, deletion on request, audit logging)?

4. **Consent & minors**
   - What age-verification standard is defensible given PECA's provisions
     related to minors, beyond this app's own 18+ CNIC check?
   - Is parental/guardian data (the `GuardianLink` feature) itself subject to
     separate consent requirements, since it involves a second person's data?

5. **Cross-border data transfer**
   - If using a KYC vendor, SMS provider, or cloud host headquartered outside
     Pakistan, what transfer mechanism (contractual clauses, adequacy, etc.)
     is required?

6. **Breach notification**
   - What are the obligations if photos, CNIC hashes, or chat logs are
     exposed in a breach — timelines, who must be notified, and in what form?

## What the current schema/backend already does to reduce exposure

- CNIC numbers are never stored — only a salted hash (`cnicHash`), so a
  database compromise doesn't leak raw national ID numbers.
- Precise GPS is never collected — only self-reported city.
- Guardian access is ward-initiated, ward-revocable, and read-only (match
  existence/count, not message content) by default.
- Reports and ID verifications are logged with timestamps for auditability.

## What still needs a decision before launch

- Final hosting region (data residency answer above will decide this)
- Data retention periods for chat logs, rejected ID verifications, and
  banned-user records — currently nothing auto-deletes
- A documented breach-response and law-enforcement-request process
- Terms of Service / Privacy Policy drafted against whatever counsel advises
  above, specific to Pakistani consumer-protection and PECA requirements
