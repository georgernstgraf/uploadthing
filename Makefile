default:
	@echo "no default action (pull / push / logsync)"

pull:
	! fuser uploadthing.db
	rm -f uploadthing.db*
	ssh sense copydb
	scp sense:uploadthing.db .
	cp uploadthing.db ~/OneDrive/

push:
	scp uploadthing.db sense:uploadthing/

logsync:
	rsync -av --delete sense:/var/log/exampy/ /home/georg/exampy/
