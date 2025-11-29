#!/bin/bash
SAVEDIR=/Volumes/GRG/captures
cd $SAVEDIR
if [ $? -ne 0 ]; then
	echo "========================="
	echo "Cannot change to $SAVEDIR"
	echo "========================="
	exit 1
fi
echo "=========================="
echo "===== NOW CAPTURING ======"
echo "=========================="
( hostname ; ifconfig ) > ifconfig.txt
while true; do
	screencapture -x screenshot_$(date +%Y%m%d_%H%M%S).png
	date
	sleep 36
done

