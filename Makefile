default:
	@echo "no default action"

pull:
	scp sense:uploadthing/uploadthing.db .

push:
	scp uploadthing.db sense:uploadthing/
