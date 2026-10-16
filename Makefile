default: files/conf_config.xml

files/conf_config.xml: /conf/config.xml
	sed -f bin/redact-opnsense.sed $> > $@
