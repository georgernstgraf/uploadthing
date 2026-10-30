# DOMAIN

## Purpose

This application supports supervised exam workflows where students identify themselves, access materials, upload submissions, and teachers audit activity by machine IP.

## Core Entities

- `users`: known identities, synchronized from LDAP and stored locally.
- `registrations`: current exam mappings of user identity to machine IP.
- `forensic_registrations`: archived past registration mappings for audit history.
- `ipfact`: sightings of active IP addresses and their MAC address during an exam window (polled from the MikroTik; the MAC column is the basis for later MAC-based admin approval).
- `abgaben`: submitted files and their metadata.
- `unterlagen`: teacher-provided materials served to authenticated users from the filesystem.

## Exam Flow

1. The app itself polls the MikroTik wireless registration table every 60 s and writes each connected client (IP + MAC) to `ipfact`. There is no reporting endpoint and no IP whitelist anymore.
2. `/` is the single student page: materials and documentation links on the left, login (or the submission form once logged in) on the right. Login and upload never leave that page.
3. A person is found by a name search over `givenName`, `sn`, `mail` and `sAMAccountName` (minimum three characters); the search itself registers nobody.
4. Logging in resolves the person against LDAP (local record as fallback), binds that identity to the current socket IP and creates a session.
5. While an exam window is open, non-teachers cannot log in — the name on the submission must not change mid-exam. Teachers are exempt and can release a five-minute login window for everybody else.
6. The authenticated user can access `unterlagen` and upload an exam file; the form stays in place and the success message appears as a toast.
7. Teachers use `/admin/students` to correlate sightings, registrations, cookie presence, anomalies, and submissions, and `/admin/application` for runtime administration settings.

## Network Scan vs Upload Timing

- The IP sightings come from the MikroTik REST polling inside the app process (`service/tik.ts`, every 60 s plus an immediate poll at startup); the upload comes from the student's browser when they submit their exam file.
- These are independent timelines; poll timestamps and submission timestamps should not be assumed to align.
- The ipfact table records per-poll IP/MAC sightings; the abgaben table records per-submission metadata.
- A student's IP must appear in ipfact at every poll timestamp since their last submission for a resubmission to be allowed.
- The Tik credentials are read-only and live only in `.env`; there is no HTTP endpoint, no IP whitelist and no write path to the Tik.
- The admin forensics page distinguishes "Tik not reachable" from "Tik reachable but no clients connected", so a silent polling outage cannot look like an empty WLAN.

## Security Model

- Student identity assurance is partly operational: teachers visually confirm the displayed identity at the start of the exam.
- Technical continuity is then enforced through a signed session cookie.
- Auditability is centered on machine IP tracking rather than trusting client-provided identity alone.

## Role Meaning

- `klasse === "LehrendeR"` represents a teacher/admin role in the current model; it is the only source of admin rights (`service/user.isTeacher()`).
- Additional IP restrictions for teacher registration can be configured with `ADMIN_IPS`.
- A teacher may also register from a device whose MAC address is approved — either in the `adminmac` allowlist maintained under `/admin/application` or via `ADMIN_MACS` in the environment (#147). The MAC is an additional device proof, not a role: it only relaxes the login restriction and never turns a student into an admin.
- The MAC for a request comes from the newest `ipfact` sighting of the socket IP; there is no Tik lookup in the request path.
- In the admin forensics view, IP cards are split by role: the most recent `cookie_presents[0]` user decides whether an IP appears in students or in teachers.
- An IP with no cookie presence stays in the "unknown" section regardless of registration history role.

## Why Admin History Matters

- The admin view is designed to reveal anomalies such as multiple identities from one machine or changes in registration history over time.
- Archived registrations help reconstruct prior exams even after the live registration table is cleared.

## File Upload Context

- Uploads are the primary student-facing output of the app.
- Filenames are sanitized and versioned to avoid collisions and traversal attacks.
- Submission metadata records which user and IP produced the upload.

## Operational Boundaries

- This is not a general consumer web app; it is optimized for local, supervised, exam-network usage.
- Some design choices that would be unusual in a public internet app are intentional here because they support exam operations and forensic review.
