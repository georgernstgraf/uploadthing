# Uploadthing

Webserver on examdns-router

## nice sqls

- select ip, count() as count from ipfact where seen in (select distinct seen from ipfact order by seen desc limit 7) group by ip order by count;