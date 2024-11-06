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
qemu-img convert -f raw -O qcow2 image.raw image.qcow2
```
