# appliance/

OPNsense/router-side artifacts that are still needed after the app moved
off the Sense (2026-10-30, #143) and the cleanup in #144. The former
appliance scripts, the rc.d service, the configd snippets and the
manual-page copies are gone: exam mode is driven through the OPNsense
API, IP/MAC presence is polled from the MikroTik by the app process.

## What is left

- `bin/redact-opnsense.sed` — redaction filter for `/conf/config.xml`
  before a snapshot leaves the appliance.
- `files/usr_local_etc_devd_usb_persist.conf` — devd rule that keeps the
  USB NIC names stable; install as
  `/usr/local/etc/devd/usb_persist.conf`.
- `current/config.redacted.xml` — redacted `/conf/config.xml` snapshot
  from 2026-10-21, kept as a reference for rule/alias/host-override
  layout. Everything else under `current/` is gitignored local state.
- `legacy-rules-2026-10-30.csv` — the six legacy filter rules exported by
  the OPNsense 26.7 migration assistant before its `flush`. Evidence file
  for the firewall reconstruction; do not delete.
- `Mikrotik/` — RouterOS export and command notes. Sensitive: the
  pre-shared key is redacted, and no `show-sensitive` export or backup
  password may ever be committed.

## Redacted config snapshot

Run on the firewall (source is `/conf/config.xml`):

```sh
make config-snapshot   # writes appliance/current/config.redacted.xml
```

The result stays gitignored unless it is copied over
`current/config.redacted.xml`; verify a new snapshot is redacted before
committing it.

Operational context lives in `../../docs/ai/OPERATIONS.md`, conventions
for these artifacts in `../../docs/ai/CONVENTIONS.md` (section
"Appliance Scripts").
