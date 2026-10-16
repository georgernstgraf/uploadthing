#!/bin/sh
# exammode.sh — Unified start/stop/status for the exam firewall rule
#
# Usage:
#   exammode.sh start   — Enable the blocking rule (exam mode ON, internet blocked)
#   exammode.sh stop    — Disable the blocking rule (exam mode OFF, internet allowed)
#   exammode.sh status  — Print "on" (blocked) or "off" (allowed) to stdout
#
# Exit codes:
#   0  — success
#   1  — invalid usage or rule not found
#   2  — configctl reload failed

UUID="e3e720e6-27fb-4565-b8cf-3a73cf682b54"
CONFIG="/conf/config.xml"
BAK_EXT=".bak_$(date +%F)"

case "${1:-}" in
start)
    sudo sed -i "$BAK_EXT" "/<rule uuid=\"$UUID\"/,/<\/rule>/ s/<disabled>[01]<\/disabled>/<disabled>0<\/disabled>/" "$CONFIG"
    sudo configctl filter reload || exit 2
    echo "exammode: rule enabled (internet blocked)"
    ;;
stop)
    sudo sed -i "$BAK_EXT" "/<rule uuid=\"$UUID\"/,/<\/rule>/ s/<disabled>[01]<\/disabled>/<disabled>1<\/disabled>/" "$CONFIG"
    sudo configctl filter reload || exit 2
    echo "exammode: rule disabled (internet allowed)"
    ;;
status)
    state=$(sed -n "/<rule uuid=\"$UUID\"/,/<\/rule>/ s/.*<disabled>\([01]\)<\/disabled>.*/\1/p" "$CONFIG")
    if [ "$state" = "0" ]; then
        echo "on"
    elif [ "$state" = "1" ]; then
        echo "off"
    else
        echo "unknown"
        exit 1
    fi
    ;;
*)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 1
    ;;
esac
