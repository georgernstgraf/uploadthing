default:
	@echo "no default action (pull / push / logsync)"

pull:
	! fuser uploadthing.db
	rm -f uploadthing.db
	ssh sense copydb
	scp sense:uploadthing.db .
	echo "insert into user (ip,name,email,klasse) values ('127.0.0.1', 'Schurli Graf', 'georg@graf.priv.at', 'SUPERMASTA');" | sqlite3 uploadthing.db
	cp uploadthing.db ~/OneDrive/

push:
	scp uploadthing.db sense:uploadthing/

logsync:
	rsync -av --delete sense:/var/log/exampy/ /home/georg/exampy/
