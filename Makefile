default:
	@echo "no default action"

pull:
	scp vosense:uploadthing/uploadthing.db .

push:
	scp uploadthing.db vosense:uploadthing/
