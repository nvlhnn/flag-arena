# Country celebration SVG artwork

There is one original, self-contained SVG for every country/territory code in `lib/arena.ts` (250 at creation). These are simplified illustrations, not architectural reconstructions. Where a specific monument is not depicted, titles describe the scenery or characteristic instead.

- `country-scenes.txt`: explicit country selection, title, drawing family, and hand-authored geometry parameters. No random country assignment.
- `scripts/generate-country-artwork.ts`: offline vector authoring helpers and custom landmark paths. Shared drawing primitives keep the style consistent; each generated file has distinct geometry.
- `public/landmarks/{CODE}.svg`: independent editable assets used by the overlay. The seven original drawings are preserved by the generator.
- `public/landmarks/gallery.html`: visual review of the entire collection.
- `lib/country-artwork.json`: labels used by the preview selector and accessible image descriptions.

Run `node --import tsx scripts/generate-country-artwork.ts` to rebuild the collection and gallery. Commit generated assets with source changes. The browser requests only the active country image; there is no image-generation service or runtime SVG construction.

The [UNESCO World Heritage List](https://whc.unesco.org/en/list/) was consulted for country/site associations including Jam, Berat, Bagerhat, Mir Castle, Mostar, Abomey, Rila, Lalibela, Tikal, Angkor, and Great Zimbabwe. The drawings are original code-authored vectors; no third-party photographs or SVG artwork were copied. General scenic scenes are illustrative, not location-accurate maps or claims that a feature is exclusive to one country.
