# Redaction filter fuer den config.xml-Snapshot (Makefile: config-snapshot).
# Das Repo ist oeffentlich: der rohe Snapshot bleibt lokal und gitignoriert,
# ins Repo geht nur die redigierte Fassung. Jede neue Secret-Art hier
# ergaenzen, sonst landet sie im Klartext im Snapshot.
s|<password>[^<]*</password>|<password>Password not revealed.</password>|g
s|<prv>[^<]*</prv>|<prv>Private key not revealed.</prv>|g
s|<apikeys>[^<]*</apikeys>|<apikeys>API key not revealed.</apikeys>|g
s|<user_apitoken>[^<]*</user_apitoken>|<user_apitoken>API token not revealed.</user_apitoken>|g
s|<ldap_bindpw>[^<]*</ldap_bindpw>|<ldap_bindpw>Bind password not revealed.</ldap_bindpw>|g
s|<bindpw>[^<]*</bindpw>|<bindpw>Bind password not revealed.</bindpw>|g
s|<pre-shared-key>[^<]*</pre-shared-key>|<pre-shared-key>PSK not revealed.</pre-shared-key>|g
s|<community>[^<]*</community>|<community>Community not revealed.</community>|g
