Last updated: 2026-10-30 (Planungssession — Epic #141 angelegt).

## Sofort weiter mit

**Epic #141** (Exam-Infrastruktur 2026/27) enthält die Ausführungsreihenfolge.
Nächster Schritt: **#142 — OPNsense-API-Client** (Voraussetzung für #143).

- API-Key: `~/sense.internal_root_apikey.txt` (`key=`, `secret=`), User `root`,
  Datei gehört auf `chmod 600`. Werte nur in die Produktions-`.env`, nie ins Repo.
- Regel-UUID `e3e720e6-27fb-4565-b8cf-3a73cf682b54` (`descr=doku`, `type=reject`,
  Ziel „alles außer Alias DOKU").
- Verifiziert: `POST /api/firewall/filter/toggleRule/{uuid}` + `apply`,
  `GET /api/firewall/filter/getRule/{uuid}`, Basic-Auth gegen
  `https://192.168.21.1:8443`.

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
