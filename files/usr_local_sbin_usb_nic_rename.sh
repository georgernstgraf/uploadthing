#!/bin/sh

# Argument $1 ist der aktuelle Interface-Name (z.B. ue0)
INTERFACE=$1
logger "GGOOTT $1"

# MAC-Adressen Konfiguration (bitte anpassen)
MAC_WAN="b0:bb:bb:bb:bb:bb"
# MAC_LAN="7c:c2:c6:1e:2d:79"
# MAC_LAN="00:e0:4c:57:5f:30"
MAC_LAN="a0:aa:aa:aa:aa:aa"

# Aktuelle MAC des neuen Interfaces auslesen
CURRENT_MAC=$(ifconfig "$INTERFACE" | grep ether | awk '{print $2}')

if [ "$CURRENT_MAC" = "$MAC_WAN" ]; then
    # Umbenennen zu usbwan
    /sbin/ifconfig "$INTERFACE" name usbwan
    # Optional: Log entry
    logger "USB-NIC: Renamed $INTERFACE ($CURRENT_MAC) to usbwan"
elif [ "$CURRENT_MAC" = "$MAC_LAN" ]; then
    # Umbenennen zu usblan
    /sbin/ifconfig "$INTERFACE" name usblan
    logger "USB-NIC: Renamed $INTERFACE ($CURRENT_MAC) to usblan"
fi
