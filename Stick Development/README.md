# tomsticks

## Know Hows

### Umgang mit sparse files

Files mit bestimmter Größe anlegen, die keinen Platz brauchen: `truncate -s <bytes> <file>`

"Brennen" eines Sticks: `dd if=<file> of=</dev/sdX> status=progress conv=sparse`

Kopieren übers Netz: Vorher einen tarball erzeugen, der die Löcher nicht mitkopiert mit `tar -S`

### phyische Hardware in der Virtualbox verfügbar machen

Geht über den "Umweg" eines `.vmdk` Files. Befehl:
- `VBoxManage internalcommands createrawvmdk -filename loop18.vmdk -rawdisk /dev/loop18`

## Get started

### Image-File auf Platte anlegen

Wichtig ist, dass das image-file **exakt** die gleiche Größe wie der Ziel-Stick hat!

```bc
$ bc -l
240328704*512
123048296448
$ truncate -s123048296448 image.raw
```

### Convert zu .qcow2 Format

```shell
> qemu-img convert -f raw -O qcow2 image.raw image.qcow2
** OR **
> qemu-img convert -f raw -O qed image.raw image.qed  # seems to work better with virtualbox
```

### Installation with virtualbox

- insert some downloaded ISO File into the dvd drive
- create a VBOX VM with `image.qcow2` as main harddrive
- boot and install your VM

### check the image.qcow2 file

- ls -l image.qcow2
- du -sh image.qcow2 (should be significantly less)

### convert back and write onto Stick

```text
> qemu-img convert -f qcow2 -O raw image.qcow2 image.raw
> sudo dd if=image.raw of=/dev/sdt bs=64k status=progress
```
