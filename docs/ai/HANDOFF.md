Last cleared: 2026-10-21 (appliance gather session — no blockers).

Planned next work (see docs/ai/STATE.md Pending and DECISIONS.md
"Appliance Structure: current/ + rollout/"): build
`appliance/rollout/` with canonical scripts (live-truth versions of
`usbpersist.conf` + `actions_scan.conf`), the upcoming `exammode.sh`
edit, and `apply.sh`; after apply + convergence, delete
`appliance/bin/` + `appliance/files/` and update the Makefile +
docs. Appliance facts from the 2026-10-21 gather:
`docs/ai/OPERATIONS.md` section "Appliance State 2026-10-21".
