# tomsticks

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
