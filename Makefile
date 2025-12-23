default:
	@echo "no default action"

pull:
	rm -f uploadthing.db
	ssh sense copydb
	scp sense:uploadthing.db .

push:
	scp uploadthing.db sense:uploadthing/
