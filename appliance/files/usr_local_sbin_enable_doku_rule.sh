#!/bin/sh
# enable_doku_rule.sh

UUID="e3e720e6-27fb-4565-b8cf-3a73cf682b54"
BAK_EXT=".bak_$(date +%F)"

sed -i "$BAK_EXT" "/<rule uuid=\"$UUID\"/,/<\/rule>/ s/<disabled>[01]<\/disabled>/<disabled>0<\/disabled>/" /conf/config.xml

configctl filter reload

echo "Rule enabled."

