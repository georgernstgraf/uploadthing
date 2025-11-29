#!/bin/sh
set -v
gpart destroy -F da0 # ok if fails
gpart create -s mbr da0 || exit
gpart add -t fat32 da0 || exit
newfs_msdos -L GRG /dev/da0s1  || exit
mount_msdosfs /dev/da0s1 /mnt/ || exit
rsync -rv tomsticks/GRG/ /mnt/ || exit
umount /mnt || exit
camcontrol eject da0 || exit
