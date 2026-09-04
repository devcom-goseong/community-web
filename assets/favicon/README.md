# Favicons

Generated from `design/logo-colour.jpeg` by `design/build-assets.py`. Re-run it
from the project root after changing the artwork:

    python design/build-assets.py

| File | Purpose |
| --- | --- |
| `favicon.ico` | 16 / 32 / 48 bundle, for older browsers and Windows |
| `favicon-16.png`, `favicon-32.png` | Browser tab |
| `favicon-48.png` | Source for the .ico |
| `apple-touch-icon.png` | 180 x 180, iOS home screen |
| `icon-192.png`, `icon-512.png` | Android and the web manifest |

## Notes

- The whole circular mark is used, not a detail cut from it. The disc gives it
  a solid silhouette, which is what keeps it readable at 16 pixels where a
  loose drawing would break up.
- Every size is composited onto the cream `#f7f3ea` rather than left
  transparent. iOS fills a transparent touch icon with black, and a tab icon
  with its own ground reads the same in a light or a dark browser theme.
- If the mark is redrawn and the small sizes look muddy, the thing to change is
  the artwork, not these files: at 16 pixels only the disc, the bracket shape
  and the three dots survive, so those three have to carry it.
