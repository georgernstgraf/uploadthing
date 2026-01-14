# Uploadthing

Webserver on examdns-router

## ZEIT

### SERVICE: localtime

Alle Zeiten im main.ts und im service(!) sind localtime.

### REPO: utc time

Die Zeiten in der Datenbank sind UTC.
Das REPO nimmt und returned "Date" Objekte, die sind basically UTC

## Cisco Help

```sh
ssh aironet
cisco# conf t
cisco(config)# interface dot11Radio 0
cisco(config)# do show run interface dot11Radio 0
cisco(config)# bridge-group 1 port-protected
cisco(config)# no bridge-group 1 port-protected
```
