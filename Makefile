default:
	@echo "no default action (pull / push / logsync)"

pull:
	! fuser uploadthing.db
	rm -f uploadthing.db*
	ssh sense copydb
	scp sense:uploadthing.db .
	cp uploadthing.db ~/OneDrive/

push:
	echo "vacuum into '/tmp/uploadthing.db'" | sqlite3 uploadthing.db
	scp /tmp/uploadthing.db sense:uploadthing/
	rm /tmp/uploadthing.db

logsync:
	rsync -av --delete sense:/var/log/exampy/ /home/georg/exampy/

# Redacted OPNsense config snapshot (from the appliance/, formerly examsense).
# Run ON the firewall: make -f appliance/Makefile or copy this logic there.
config-snapshot:
	sed -f appliance/bin/redact-opnsense.sed /conf/config.xml > appliance/files/conf_config.xml
