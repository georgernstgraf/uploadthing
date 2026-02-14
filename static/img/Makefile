SVGFILES := $(wildcard bg-*.svg)
PNGFILES := $(SVGFILES:.svg=.png)

.PHONY: all

all: $(PNGFILES)

%.png: %.svg
	ffmpeg -i $< -vf "scale=800:-1" $@
