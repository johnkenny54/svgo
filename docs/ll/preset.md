# Default Preset

**preset-default.js** enables several plugins which don't guarantee lossless compression. These have been disabled.

- **cleanupNumericValues** rounds coordinates.
- **convertPathData** rounds coordinates.

  Related issues:

  - https://github.com/svg/svgo/issues/1676

- **convertShapeToPath** rounds coordinates.
- **convertTransform** rounds coordinates.

  Related issues:

  - https://github.com/svg/svgo/issues/1858
  - https://github.com/svg/svgo/issues/1810

- **mergePaths** rounds coordinates.
- **moveGroupAttrsToElems**
