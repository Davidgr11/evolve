# PWA Icons

This project uses the Evolve logo for all icons and favicons.

## Icon Files

- **Evolve.svg** - Vector logo used as favicon
- **Evolve.png** - Source PNG used to generate all icon sizes
- **icon-192x192.png** - PWA icon (192x192)
- **icon-512x512.png** - PWA icon (512x512)
- **apple-touch-icon.png** - iOS home screen icon (180x180)

## Regenerating Icons

If you update the Evolve.png logo, run this command to regenerate all icons:

```bash
node generate-icons.js
```

This will automatically create all required icon sizes from Evolve.png.

## Manual Icon Generation

If you need to generate icons manually, you can use:

### Method 1: Using an online generator
1. Visit https://www.pwabuilder.com/imageGenerator
2. Upload Evolve.png
3. Generate the icons
4. Download and replace the icon files in /public

### Method 2: Using ImageMagick
```bash
convert Evolve.png -resize 192x192 icon-192x192.png
convert Evolve.png -resize 512x512 icon-512x512.png
convert Evolve.png -resize 180x180 apple-touch-icon.png
```
