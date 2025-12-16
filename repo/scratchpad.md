# scratchpad

## Eine heutige Uhrzeit zum Vergleichen mit utc Werten in ipfact

`select strftime('%Y-%m-%dT%H:%M:%fZ', datetime(date('now', 'localtime') || ' 08:00:00', 'utc'));`

## Wann war IP XY sichtabar seit Zeitpunkt YZ

`select * from ipfact where ip = '192.168.21.80' and seen >= strftime('%Y-%m-%dT%H:%M:%fZ', datetime(date('now', 'localtime') || ' 09:55:00', 'utc'));`



select ip, seen from ipfact where ip = '192.168.21.59' and seen >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes');

- select ip, count() as count from ipfact where seen in (select distinct seen from ipfact order by seen desc limit 7) group by ip order by count;

Wann hat seit (08:00)

select date('now', 'localtime');
date('now', 'localtime')
2025-12-16
