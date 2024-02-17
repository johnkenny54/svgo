export const name = 'minifyTransforms';
export const description = 'Make transform expressions as short as possible';

/**
 * Make transform expressions as short as possible.
 *
 * @type {import('./plugins-types.js').Plugin<'minifyTransforms'>}
 */
export const fn = () => {
  return {
    element: {
      enter: (node) => {
        if (node.attributes.transform) {
          node.attributes.transform = minifyTransform(
            node.attributes.transform,
          );
        }
        if (node.attributes.gradientTransform) {
          node.attributes.gradientTransform = minifyTransform(
            node.attributes.gradientTransform,
          );
        }
        if (node.attributes.patternTransform) {
          node.attributes.patternTransform = minifyTransform(
            node.attributes.patternTransform,
          );
        }
      },
    },
  };
};

/**
 * @param {string} t
 * @returns {string}
 */
function minifyTransform(t) {
  console.log('XX: ' + t);
  return t;
}
