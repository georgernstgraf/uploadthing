# appliance/ — agent pointer

This directory is the appliance-side half of the uploadthing project
(OPNsense/FreeBSD scripts, imported from the archived `examsense` repo).

All guidance lives at the repository root:

- `../../AGENTS.md` — project agent guide
- `../../docs/ai/CONVENTIONS.md` — section "Appliance Scripts" for the
  shell/Python/awk conventions and safety rules that apply here
- `../../docs/ai/OPERATIONS.md` — section "Appliance Setup" for
  deployment and installation steps

Key rule of this directory: files under `files/` map 1:1 to OPNsense
system paths — do not rename them without a deployment migration note.
