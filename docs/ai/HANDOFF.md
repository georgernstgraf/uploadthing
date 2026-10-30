Last updated: 2026-10-30 (#142 umgesetzt — OPNsense-API-Client).

## Sofort weiter mit

**#143 — Umzug der App auf den Dell (systemd).** Voraussetzung ist erfüllt:
die Exam-Sperre läuft über die OPNsense-API, `EXAMMODE_COMMAND`,
`INTERNET_ACTIVE`, `exammode.sh` und der Subprozess-Pfad sind aus der App
verschwunden.

- Regel-UUID `e3e720e6-27fb-4565-b8cf-3a73cf682b54` (`descr=doku`,
  `type=reject`) steht in `OPNSENSE_EXAMMODE_RULE_UUID`. **Achtung:** Diese
  Regel existiert auf der laufenden Sense derzeit nicht — `searchRule`
  listet 26 Regeln, keine mit `descr=doku`. Vor der Prüfungs-Abnahme
  anlegen und die echte UUID in die Produktions-`.env` übernehmen.
- Verifiziert (nur lesend, 2026-10-30): `POST /api/firewall/filter/searchRule`
  liefert den Regelzustand, Basic-Auth gegen `https://192.168.21.1:8443`
  funktioniert. **`GET getRule/{uuid}` antwortet mit `[]`** und ist als
  Lesequelle unbrauchbar.
- TLS: Das GUI-Zertifikat ist `CN=tst.spengergasse.at` ohne SAN für die IP.
  App-Start braucht `--unsafely-ignore-certificate-errors=192.168.21.1`
  oder einen Hostnamen, den das Zertifikat abdeckt (#149).
- API-Key: `~/sense.internal_root_apikey.txt` (`key=`, `secret=`, jetzt
  Modus 600). Werte nur in die Produktions-`.env`, nie ins Repo.

## Offene Punkte außerhalb der Tickets

- Nichts Blockierendes.
- Der Dell hostet die Sense als VirtualBox-VM (`sense-zvol-georg`); Sense und
  Tik sind nur zu Prüfungs-/Wartungszeiten online. „Daten seit Tagen alt" ist
  deshalb normal, kein Vorfall.

## Kontext, der leicht verloren geht

- Die App läuft aktuell **in** der VM auf `127.0.0.1:8000`, erreichbar über
  DNAT 443→8000; das Ziel ist der Umzug auf den Dell (#143).
- Der Dell ist nicht hinter der Firewall (Default-Route über das graue Kabel).
  Ob die Sperre greift, lässt sich nur von einem Client im Prüfungs-WLAN
  prüfen (Handy).
- Die IP-Erfassung war seit 2026-10-23 defekt (Dateimodus 644 + fehlende
  Passwortdatei) — wird durch #145 ersetzt, nicht repariert.
