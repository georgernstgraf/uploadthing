# DOMAIN

## Purpose

This application supports supervised exam workflows where students identify themselves, access materials, upload submissions, and teachers audit activity by machine IP.

## Core Entities

- `users`: known identities, synchronized from LDAP and stored locally.
- `registrations`: current exam mappings of user identity to machine IP.
- `forensic_registrations`: archived past registration mappings for audit history.
- `ipfact`: sightings of active IP addresses during an exam window.
- `abgaben`: submitted files and their metadata.
- `unterlagen`: teacher-provided materials served to authenticated users from the filesystem.

## Exam Flow

1. Machines report active IPs through `/activeips`.
2. A user is searched in LDAP and selected through `/ldap` and `/register`.
3. Registration binds that identity to the current socket IP and creates a session.
4. The authenticated user can access `unterlagen` and upload an exam file.
5. Teachers use `/admin` to correlate sightings, registrations, and submissions.

## Security Model

- Student identity assurance is partly operational: teachers visually confirm the displayed identity at the start of the exam.
- Technical continuity is then enforced through a signed session cookie.
- Auditability is centered on machine IP tracking rather than trusting client-provided identity alone.

## Role Meaning

- `klasse === "LehrendeR"` represents a teacher/admin role in the current model.
- Additional IP restrictions for teacher registration can be configured with `ADMIN_IPS`.

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
