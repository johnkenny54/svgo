export default {
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupNumericValues: false,
          convertPathData: false,
          convertShapeToPath: false,
          convertTransform: false,
          mergePaths: false,
          moveGroupAttrsToElems: false,
          removeViewBox: false,
        },
      },
    },
  ],
};
