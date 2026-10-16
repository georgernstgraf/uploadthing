# appliance/

OPNsense/FreeBSD appliance-side scripts and configuration for the exam
system (imported from the former `examsense` repository, now archived).

- `bin/` — scripts for `/root/bin` (exammode, scan helpers, awk tools).
- `files/` — mirrors `/usr/local/...` target paths 1:1 (slashes replaced
  by underscores).
- `Mikrotik/` — router config artifacts (sensitive: never commit
  `show-sensitive` exports).

Installation and operational guidance lives in `../../docs/ai/OPERATIONS.md`
(section "Appliance Setup"); coding conventions for these scripts live in
`../../docs/ai/CONVENTIONS.md` (section "Appliance Scripts").

Redacted OPNsense config snapshot: run `make config-snapshot` **on the
appliance** (source is `/conf/config.xml`).
