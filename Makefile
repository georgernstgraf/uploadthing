default:
	@echo "no default action"

pull:
	scp osense:uploadthing/uploadthing.db .

push:
	scp uploadthing.db osense:uploadthing/
