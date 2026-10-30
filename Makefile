# Datenbank-/Log-Sync gegen die Sense ist mit #143 entfallen: App, DB und
# Logs liegen auf dem Dell (`journalctl -u uploadthing`, DB unter
# ~/uploadthing-app). Backups laufen über #148, nicht über `make`.
default:
	@echo "Keine Sync-Ziele mehr (seit #143). Dienst: systemctl status uploadthing"

# Redacted OPNsense config snapshot (from the appliance/, formerly examsense).
# Run ON the firewall; the result is gitignored local state, a new snapshot
# only enters the repo after copying it over current/config.redacted.xml.
config-snapshot:
	sed -f appliance/bin/redact-opnsense.sed /conf/config.xml > appliance/current/config.redacted.xml
