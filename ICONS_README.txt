# Icon Generation Instructions

The SVG file `icon.svg` is a placeholder.

## To generate proper PNG icons:

### Option 1: Online Generator (Recommended)
1. Go to https://www.pwabuilder.com/imageGenerator
2. Upload a 512×512 PNG icon
3. Download all sizes
4. Replace the placeholder PNGs in this folder

### Option 2: ImageMagick (Command Line)
```bash
# Install ImageMagick
sudo apt-get install imagemagick

# Convert SVG to different sizes
convert icon.svg -resize 72x72 icon-72.png
convert icon.svg -resize 96x96 icon-96.png
convert icon.svg -resize 128x128 icon-128.png
convert icon.svg -resize 144x144 icon-144.png
convert icon.svg -resize 152x152 icon-152.png
convert icon.svg -resize 192x192 icon-192.png
convert icon.svg -resize 384x384 icon-384.png
convert icon.svg -resize 512x512 icon-512.png
```

### Option 3: Photoshop/GIMP
1. Open icon.svg
2. Export as PNG at each size:
   - 72×72, 96×96, 128×128, 144×144
   - 152×152, 192×192, 384×384, 512×512

## For now:
The manifest.json references these files, but they don't exist yet.
The PWA will work without them, but won't have nice icons.

Create them before deploying to production!
