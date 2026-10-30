# Project State

Current status as of 2026-10-30.

## Current Focus

**Epic #141 — Exam-Infrastruktur 2026/27.** Die Planung ist abgeschlossen und
vollständig in Tickets abgelegt; die Ausführungsreihenfolge steht im Epic.

Kernentscheidungen: Firewall-Steuerung ausschließlich über die OPNsense-API
(kein `sudo`, kein `exammode.sh`), IP-Präsenz per Tik-REST direkt im
App-Prozess, und die App verlässt die Sense vollständig — Dell = Hypervisor +
App, Sense = Firewall/DNS/DHCP. Runtime bleibt Deno, htmx bleibt 2.0.10 bis
Februar 2027.

Nächster Schritt: **#143** — die App verlässt die Sense. #142
(OPNsense-API-Client) ist umgesetzt: die Sperre läuft über die Firewall-API,
`exammode.sh`/`EXAMMODE_COMMAND`/`INTERNET_ACTIVE` sind aus dem Code
verschwunden.

## Offene Punkte aus #142

- Die im Ticket genannte Regel-UUID
  `e3e720e6-27fb-4565-b8cf-3a73cf682b54` (`descr=doku`) ist auf der
  laufenden Sense **nicht** in der Regelliste (`searchRule` findet sie
  nicht; 26 Regeln, keine mit `descr=doku`). Vor der Abnahme im
  Prüfungsnetz muss die Regel angelegt und die UUID in die
  Produktions-`.env` übernommen werden.
- TLS: Das GUI-Zertifikat deckt nur `tst.spengergasse.at`, nicht
  `192.168.21.1`. Der App-Start braucht deshalb entweder einen passenden
  Hostnamen (Hosts-Eintrag, Thema #149) oder
  `--unsafely-ignore-certificate-errors=192.168.21.1`.

## Reihenfolge (Epic #141)

1. #142 OPNsense-API-Client + Exam-Mode-Toggle
2. #143 Umzug der App auf den Dell (systemd)
3. #144 Appliance-Cleanup (Root-Skripte, Cron, examsense)
4. #145 Tik-Polling in der App
5. #146 Schülerseite (eine Seite, zwei Spalten, Namenssuche)
6. #133 Drizzle (Schema + Migrationen)
7. #134 Admin-Upload Unterlagen
8. #147 MAC-Admin-Freigabe
9. #148 Backups & Secrets (gpg/pass)
10. #149 Netz-, DNS- und Ops-Hygiene
11. #135 Playwright (zuletzt)
12. #150 htmx-4-Migration (Backlog, Februar 2027)

## Completed (this cycle)

- [x] #142 OPNsense-API-Client: Exam-Sperre ausschließlich über die
      Firewall-API (`service/opnsense.ts`, `searchRule`/`toggleRule`/`apply`),
      Zustand wird bei jedem Panel-Rendern gelesen, Fehler- und
      Unbekannt-Zustand inkl. nicht wegklickbarem Modal, Start sperrt
      implizit. `EXAMMODE_COMMAND`, `INTERNET_ACTIVE` und der
      Subprozess-Pfad sind entfernt; 252 Tests grün.

- [x] Planungssession 2026-10-30: Ist-Zustand auf `sense`, `tik` und im
      Schul-LDAP erhoben; Epic #141 plus zwölf Sub-Issues angelegt, jedes mit
      Abschnitt „Entscheidungen".
- [x] #140 in #142 (Firewall-API) und #145 (Tik-Polling) aufgeteilt und
      geschlossen.
- [x] #136 geschlossen: Code gemergt, Deployment 2026-10-16 erfolgt; Restpunkte
      (Renewal, DNS) nach #149 verschoben.
- [x] `.env.example`, TLS-Deploy-Abschnitt, natives TLS via `Deno.serve` (#137)
- [x] Prisma-Modell `examstate`, Exam-State-Machine, `requireAdmin`,
      Router-Split, Exam-Admin-API, Startup-Reset, Gating (#131)
- [x] Admin-Prüfungs-Panel und Schüler-Countdown (#131)
- [x] TLS-Betrieb auf `sense`: `.env` final, GUI 8443 mit LE-Zertifikat,
      DNAT 443→8000, Smoke-Tests (#137)

## Pending

- [ ] Der Epic-Plan oben; #142 ist abgeschlossen.
- [ ] Deno-Hygiene auf `sense`: laufende 2.9.6 (`~/.deno/bin/deno`)
      konsolidieren, kaputtes `~/deno` (liblcms2 fehlt) und altes `~/tmp/deno`
      (2.2.15 LTS) entfernen; optional Patch-Bump auf 2.9.7.
- [ ] Runtime-Frage nach der Saison 2026/27 neu stellen (Deno-Deprecation;
      Ziel wäre Node auf einem Linux-Host, dann `drizzle-orm/better-sqlite3`).

## Erledigt durch den Umzugsplan (nicht mehr separat verfolgen)

- [x] rc.d-Status-Quirk — entfällt mit #143 (systemd statt `rc.d`/`startloop.sh`).
- [x] `appliance/rollout/`-Ausbau — entfällt; `appliance/` schrumpft in #144.

## Blockers

None.

## Next Session Suggestion

Mit #142 beginnen. Der API-Key liegt in `~/sense.internal_root_apikey.txt`;
die verifizierten Endpunkte stehen im Ticket. Abnahme für die Sperre ist ein
Client im Prüfungs-WLAN (Handy), nicht der Dell.
