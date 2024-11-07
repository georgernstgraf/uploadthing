# tomsticks

## Linux Boot Sticks

### Kingston Rot Tom (128G)

dmesg freebsd:

```text
da0 at umass-sim0 bus 0 scbus3 target 0 lun 0
da0: <Kingston DataTraveler 3.0 PMAP> Removable Direct Access SPC-4 SCSI device
da0: Serial Number E0D55E62DBDEE810E87601C8
da0: 40.000MB/s transfers
da0: 118368MB (242417664 512 byte sectors)
da0: quirks=0x2<NO_6_BYTE>
GEOM: da0: the secondary GPT header is not in the last LBA.
```

```text
# gpart show da0
=>       40  242417584  da0  GPT  (116G)
         40       2008       - free -  (1.0M)
       2048    2201600    1  efi  (1.0G)
    2203648  106954752    2  linux-data  (51G)
  109158400  133259224       - free -  (64G)
```

```text
$ file xubuntu-128g.qcow2
xubuntu-128g.qcow2: QEMU QCOW Image (v3), 124117843968 bytes (v3), 124117843968 bytes
                                                 242417664 * 512 = 124117843968
```

### Kingston silber Georg (64G)

```text
da0 at umass-sim0 bus 0 scbus3 target 0 lun 0
da0: <Kingston DataTraveler 3.0 PMAP> Removable Direct Access SPC-4 SCSI device
da0: Serial Number 1C1B0DDF5BB7E820698D0795
da0: 400.000MB/s transfers
da0: 59136MB (121110528 512 byte sectors)
da0: quirks=0x2<NO_6_BYTE>
```

### Sandisk Grün Tom

Ist ein Eitzerl kleiner als der rote .. dmesg FreeBSD:

```text
da0 at umass-sim0 bus 0 scbus3 target 0 lun 0
da0: <USB SanDisk 3.2Gen1 1.00> Removable Direct Access SPC-4 SCSI device
da0: Serial Number 0101845f749ebe0730c69fe1f4da05b084996c71630d81de86773051d9c2
da0: 40.000MB/s transfers
da0: 117348MB (240328704 512 byte sectors)
da0: quirks=0x2<NO_6_BYTE>
```
