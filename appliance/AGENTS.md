# appliance/ — agent pointer

This directory holds the OPNsense/router-side artifacts that survived the
appliance cleanup (#144): the `config.xml` redaction filter, the devd USB
NIC rule, the redacted config snapshot, the legacy firewall rule export
and the MikroTik notes.

There is no runtime code here any more — exam mode and IP/MAC presence run
inside the Deno app on the Dell. Do not add appliance scripts.

All guidance lives at the repository root:

- `../../AGENTS.md` — project agent guide
- `../../docs/ai/CONVENTIONS.md` — section "Appliance Scripts" for the
  remaining rules (no secrets, ASCII, `files/` path mirroring)
- `../../docs/ai/OPERATIONS.md` — section "Appliance-Artefakte" for the
  snapshot and installation steps

Key rule of this directory: files under `files/` map 1:1 to OPNsense
system paths — do not rename them without a deployment migration note.
