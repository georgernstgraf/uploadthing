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
