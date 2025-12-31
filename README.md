# Uploadthing

Webserver on examdns-router

## ZEIT

### SERVICE: localtime

Alle Zeiten im main.ts und im service(!) sind localtime.

### REPO: utc time

Die Zeiten in der Datenbank sind UTC.
Das REPO nimmt und returned "Date" Objekte, die sind basically UTC