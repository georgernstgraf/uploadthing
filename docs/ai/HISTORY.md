# History

Chronological archive of superseded decisions and pruned entries.
Entries here are no longer active truth. Never delete from this file.

## 2026-10-30 (SUPERSEDED 2026-10-30, origin: DECISIONS.md, reason: #143 — App verlässt die Sense): Native TLS, final topology on `sense`

- Final topology on `sense` (2026-10-16): Deno listens on **loopback 8000
  only** (`LISTEN_HOST=127.0.0.1`); the OPNsense GUI moved from 443 to
  **8443** with the real Let's Encrypt certificate imported into the
  OPNsense cert store; a DNAT port forward on LAN translates
  `192.168.21.1:443` → `127.0.0.1:8000` (pf rdr with auto-generated
  associated pass rule, **no SNAT**, so client IPs are preserved). Result:
  `https://tst.spengergasse.at` works without a port, TLS stays
  end-to-end in `Deno.serve`, and port 8000 is unreachable from the
  network. Privileged-port workarounds (`mac_portacl`, lowering
  `net.inet.ip.portrange.reservedhigh`) were discarded — the loopback
  binding plus DNAT makes them unnecessary. First upgrade-proof: the
  OPNsense upgrade to 26.7.3_11 (2026-10-20, with reboot) left the DNAT
  rule, GUI port 8443 + imported certificate, and the boot-started
  loopback listener untouched.
- **Origin**: DECISIONS.md, section „Native TLS, No Proxy"
- **Reason**: The app runs on the Dell since 2026-10-30 and binds 443
  itself (`CAP_NET_BIND_SERVICE`). DNAT and the 8443 GUI port are gone;
  the Sense GUI is back on 443.

## 2026-10-30 (SUPERSEDED 2026-10-30, origin: DECISIONS.md, reason: #145 — Endpoint entfernt): IP Whitelist for POST /activeips

- The `/activeips` endpoint is now protected by an IP whitelist via `ACTIVEIPS_ALLOWED_IPS`.
- Only requests from whitelisted source IPs can report active IPs.
- The whitelist is independent from `ADMIN_IPS` since the WLAN device and admin machines may be on different IPs.
- **Origin**: DECISIONS.md
- **Reason**: `POST /activeips`, `ACTIVEIPS_ALLOWED_IPS`, `routes/machine.ts`
  and `service/ipfact.ts` were deleted in #145; the app polls the MikroTik
  itself. A dead endpoint with an IP whitelist would be attack surface
  without benefit.

## 2026-10-30 (SUPERSEDED 2026-10-30, origin: OPERATIONS.md, reason: #143 — Umzug auf den Dell): Production Host: OPNsense Firewall

- Uploadthing runs in production on the **OPNsense firewall**, reachable
  via the SSH host alias `sense` (see `Makefile`: `ssh sense copydb`,
  `scp ... sense:uploadthing/`).
- This is not a regular server: the app shares the machine with the
  firewall itself, so resource footprint and failure behavior matter.
- **Origin**: OPERATIONS.md, section „Production Host"
- **Reason**: Replaced by „Production Host: Dell" — systemd service in
  `~/uploadthing-app`, bound to `192.168.21.2:443`.

## 2026-10-30 (SUPERSEDED 2026-10-30, origin: PITFALLS.md, reason: #142/#143 — TLS gelöst): Firewall-API ohne passendes Zertifikat

- `Deno.fetch` prüft den Hostnamen immer; `Deno.createHttpClient` kennt in
  Deno 2.9 keine Option zum Abschalten (wird still ignoriert). Wenn das
  Zertifikat den API-Host nicht abdeckt, bleibt nur
  `--unsafely-ignore-certificate-errors=<host>` beim Prozessstart oder ein
  Hostname, den das Zertifikat abdeckt.
- **Origin**: PITFALLS.md, Abschnitt „Firewall-API (Exam-Sperre)"
- **Reason**: Das GUI-Zertifikat der Sense hat jetzt
  `SAN DNS:sense.internal, IP:192.168.21.1` und wird von der internen CA
  signiert; Deno vertraut ihr über `DENO_CERT`. Keine Abschaltung der
  TLS-Prüfung mehr.

## 2026-10-30 (SUPERSEDED 2026-10-30, origin: DECISIONS.md, reason: Korrektur — falsche DB geprüft): Produktions-DB stand bei Prisma-Migration 20260307191214

- Die Produktions-DB auf der Sense stand vor dem Umstieg noch bei der
  Prisma-Migration `20260307191214` (ohne `examstate`, ohne
  Composite-Indizes); der erste Start der neuen Version glich das an.
- **Origin**: DECISIONS.md, Abschnitt „Drizzle ersetzt Prisma…"
- **Reason**: Falsche Datei geprüft. Die echte DB liegt in
  `/home/georg/uploadthing/uploadthing.db` (relativ zu `prisma/`) und
  hatte alle Tabellen, `examstate` und alle Composite-Indizes. Beim Umzug
  wurden nur `ipfact.mac` und `adminmac` ergänzt.
