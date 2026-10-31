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

## 2026-10-30 (SUPERSEDED 2026-10-30, origin: OPERATIONS.md, reason: #144 — Appliance- und Repo-Cleanup): Appliance Setup und Appliance State 2026-10-21

- The `appliance/` tree was installed as a checkout under `/root/examdns`
  with `ln -s /root/examdns/bin /root/bin` (later the old `examsense`
  checkout `/root/examsense`), plus `files/` copies into `/usr/local/…`,
  an rc.d service, configd `actions.d` snippets and a per-minute NMAP scan
  cron job (`scan scan`).
- Live state 2026-10-21: `/root/examsense` at `9583565` (2026-06-03) with
  local changes; the live `actions_scan.conf` was untracked and identical
  to `actions_exampy.conf`; the repo's `actions_exampy.conf` had never
  been deployed; `enable/disable_doku_rule.sh` no longer existed on the
  box; the devd rule was deployed with `em[0-9]+` while the repo said
  `ue[0-9]+`; `service uploadthing status` reported "not running"
  although the app listened on `127.0.0.1:8000` (rc pidfile quirk).
- Deno on `sense`: 2.9.6 stable from `~/.deno/bin/deno` via `startloop.sh`
  + `.deno/env`, plus two stray copies (`~/tmp/deno` 2.2.15 LTS, and
  `~/deno`, broken since the 2026-10-20 upgrade: `liblcms2.so.2 not
  found`). Version inventory: OPNsense 26.7.3_11, FreeBSD
  15.1-RELEASE-p3, Python 3.13.15, Nmap 7.991.
- **Origin**: OPERATIONS.md, sections „Appliance Setup" und „Appliance
  State 2026-10-21"
- **Reason**: Die App läuft seit #143 auf dem Dell; #144 hat die Skripte,
  Symlinks, configd-Snippets, den Cronjob und das `examsense`-Checkout auf
  der Sense sowie `appliance/bin/` und fast alle `appliance/files/` aus
  dem Repo entfernt. Im Repo bleibt nur Nachschlage- und Belegmaterial.

## 2026-10-31 (SUPERSEDED 2026-10-31, origin: DECISIONS.md, reason: #161 — Server-Push statt Polling): On-Demand statt Polling im Abgabe-Panel

- **Choice**: No `hx-trigger="every Ns"` on the submission panel; the
  closed card re-checked the exam state on `mouseenter throttle:3s` and
  `click` against `GET /abgabe-panel` and swapped itself for the form.
- **Reason (damals)**: a timer would swap the panel under the cursor every
  N seconds and cost two requests per minute per student; a mouse move or
  a tap was enough.
- **Origin**: DECISIONS.md, section „2026-10-31: Abgabe-Panel prüft bei
  Hover und Klick, ob das Examen läuft (#160)"
- **Reason**: Since #161 the state is pushed over SSE
  (`/events/exam` → `static/events.js` → `GET /abgabe-panel` on an
  `open` transition). The hover/click trigger was removed from
  `templates/abgabe.hbs`; the fragment endpoint and `buildPanel` stay.
  One-time "on demand instead of polling" is history.

## 2026-10-31 (SUPERSEDED 2026-10-31, origin: DECISIONS.md, reason: #161 — Anmelde-Freigabe als Schalter): Notausgang nur im Speicher (5-Minuten-Fenster)

- **Choice**: `service.exam.openRegistrationWindow()` opened student
  registration for five minutes; the permission lived in process memory
  only, expired after the window and was reset on exam start and exam end.
  Endpoint: `POST /api/exam/registration-window` with `action=open|close`.
- **Reason (damals)**: a short, self-expiring escape hatch so a student who
  lost the session could log in again during an exam.
- **Origin**: DECISIONS.md, section „2026-10-30: Eine Schülerseite —
  Anmeldung und Abgabe auf / (#146)"
- **Reason**: The duration was never right (too short for a lost session,
  too long as a permanent state) and the panel claimed "open" after
  expiry. Replaced on 2026-10-31 by the admin switch in #161
  (`registrationAllowed`, no deadline, reset only in `start()` and
  `finishExam()`); the endpoint, `buildRegistrationWindowPanel()` and
  `templates/admin-registration-window.hbs` are gone.
