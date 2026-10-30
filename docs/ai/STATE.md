# Project State

Current status as of 2026-10-30.

## Current Focus

**Epic #141 — Exam-Infrastruktur 2026/27 — abgeschlossen am 2026-10-30.**
Alle zwölf Sub-Issues sind zu (#133, #134, #142–#149, #135, #151); #150
(htmx-4-Migration) wurde aus dem Epic gelöst und ist ein eigenständiges
Backlog-Ticket für Februar 2027.

Das System läuft so, wie es das Epic beschrieben hat:

- **Dell** = Hypervisor + App: User-Unit aus `~/repos/georgernstgraf/uploadthing`,
  Env in `~/.config/uploadthing/uploadthing.env`, Daten in
  `~/uploadthing-data/`, gebunden auf `192.168.21.2:443`,
  `tst.spengergasse.at` per Unbound dorthin.
- **Sense** = Firewall/DNS/DHCP, ohne eigene Skripte, ohne Cronjob, ohne
  `rc.d`-Eintrag; das GitHub-Repo `examsense` ist gelöscht.
- **Steuerung** ausschließlich über die OPNsense-API als eigener Benutzer
  `uploadthing-api` mit dem Privileg `page-filter-api`; der Root-Key ist
  nur noch für den Menschen.
- **IP-/MAC-Präsenz** per Tik-REST im App-Prozess (`service/tik.ts`);
  MikroTik-Konto `uploadthing`, strikt auf `192.168.21.2/32`, nur
  `monitoring-rest`.
- **Tests**: 336 Deno-Tests (~5 s) plus sechs Playwright-Smoke-Tests in
  `deno task e2e` (~9 s, Chromium, eigene Wegwerf-DB auf Port 8099).

## Erledigt am 2026-10-30 (Abschlusssession)

- **#144:** Appliance-Cleanup auf der Sense (Cronjob `scan scan` per API,
  `/root/examsense`, `/root/bin`, `exammode.sh`, `actions_*.conf`,
  `nmap_cron.sh`, `rc.d/uploadthing`, `/home/georg/uploadthing`,
  veraltete DB) und im Repo; `examsense` auf GitHub gelöscht, Historie
  als Bundle in `~/uploadthing-archive/`.
- **#148:** `scripts/backup-config.sh`, gpg-Chiffrat in
  `appliance/backups/` + `MANIFEST`, Doku; Restore-Probe auf XML-Ebene
  (byte-identisch zur Live-Config). Die Redaktion
  (`appliance/bin/redact-opnsense.sed`) deckt jetzt auch `<apikeys>`,
  `<user_apitoken>`, `<ldap_bindpw>`, `<bindpw>`, `<pre-shared-key>`
  und `<community>` ab — vorher lagen die API-Key-Hälften im
  öffentlichen Snapshot.
- **#149:** eigener API-Benutzer + Minimalrechtsprobe, `/root` 750,
  dnsmasq-`dell`-Eintrag auf die USB-MAC, Zertifikats-Checkliste,
  DNS-/IP-Übersicht.
- **#135:** Playwright-Smoke-Suite (`deno task e2e`), sechs Tests.
- **#151:** gefunden von der E2E-Suite und gleich behoben —
  `hx-disabled-elt="this"` war an Formular-Submits wirkungslos; jetzt
  `hx-disabled-elt="find button[type='submit']"` am Formular.

## Pending

- [ ] **#150 htmx-4-Migration** (Februar 2027, wenn htmx 4 `latest`
      wird, und erst nach grüner E2E-Suite — die ist jetzt da).
- [ ] **Restore-Probe auf einer Wegwerf-VM** (XML-Ebene ist geprüft,
      Rückspielen in eine laufende Box nicht). Checkliste steht in
      `docs/ai/OPERATIONS.md`. Achtung: erster Start nur mit
      „Not attached", sonst kollidiert `192.168.21.1`.
- [ ] **GPG-Key ohne Passphrase** — bewusst offen: Passphrase heißt,
      dass ein Restore nicht mehr unbeaufsichtigt läuft. Entscheidung
      steht aus.
- [ ] **Zertifikatserneuerung `tst.spengergasse.at`** bis 2027-01-12;
      Erinnerung im Dezember, Checkliste in `OPERATIONS.md`.
- [ ] **Handy-Abnahme der Sperre** im Prüfungs-WLAN: `doku` scharf →
      `example.com` scheitert, `learn.microsoft.com` geht; danach aus.
- [ ] **Lehrer-Login vom Dell** einmal mit echten LDAP-Daten bestätigen
      (`.2` steht in `ADMIN_IPS`).
- [ ] Deno-Hygiene auf der Sense ist mit dem Cleanup entfallen; auf dem
      Dell läuft 2.9.7.
- [ ] Runtime-Frage nach der Saison 2026/27 neu stellen (Deno-Deprecation;
      Ziel wäre Node auf Linux, dann `drizzle-orm/better-sqlite3`).

## Completed (Epic #141, chronologisch)

- [x] #142 OPNsense-API-Client: Exam-Sperre ausschließlich über die
      Firewall-API (`searchRule`/`toggleRule`/`apply`), kein
      `exammode.sh`, kein Subprozess.
- [x] #143 Umzug auf den Dell als systemd-User-Unit; Daten und DB
      migriert, End-to-End mit gültigem Zertifikat geprüft.
- [x] #145 Tik-Polling im App-Prozess (`tik.ts` → `ipfact` mit MAC),
      `POST /activeips` und `routes/machine.ts` entfernt.
- [x] #146 Eine Schülerseite (`/`): Angaben + Doku-Links links,
      Anmeldung/Abgabe rechts, Namenssuche ab drei Zeichen,
      Registrierungssperre im Examenfenster mit Admin-Freigabe.
- [x] #133 Drizzle als Schema- und Migrationsautorität, Prisma-Rückbau,
      Migrationen beim App-Start (`BEGIN EXCLUSIVE`).
- [x] #134 Admin-Upload für Unterlagen (`/admin/application`),
      eigene Env `UNTERLAGEN_PERMITTED_FILETYPES`.
- [x] #147 MAC-basierte Admin-Freigabe (Tabelle `adminmac`, Migration
      `0002_adminmac`), `ADMINS` entfernt.
- [x] #144, #148, #149, #135, #151 — siehe oben.

## Erledigt aus früheren Sitzungen (Auszug)

- #142/#137 TLS, #131 Exam-State-Machine, #136 natives TLS (geschlossen),
  #140 in #142/#145 aufgeteilt.

## Blockers

None.

## Next Session Suggestion

Der Betrieb ist vollständig; die nächsten Schritte sind Abnahmen, keine
Umbauten: Handy-Test der Sperre im Prüfungsnetz, Lehrer-Login vom Dell,
Zertifikatserneuerung im Dezember. Wer Code anfassen will, nimmt #150 —
aber erst, wenn htmx 4 `latest` ist.
