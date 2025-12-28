default:
	@echo "no default action (pull / push / logsync)"

pull:
	rm -f uploadthing.db
	ssh sense copydb
	scp sense:uploadthing.db .

push:
	scp uploadthing.db sense:uploadthing/

logsync:
	rsync -av --delete sense:/var/log/exampy/ /home/georg/exampy/
