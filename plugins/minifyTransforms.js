import { transform2js } from './_transforms.js';
import { removeLeadingZero } from '../lib/svgo/tools.js';

/**
 * @typedef {{ name: string, data: number[] }} TransformItem
 */

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
  const parsed = transform2js(t);
  return js2transform(parsed);
}

/**
 * Convert transforms JS representation to string.
 *
 * @param {TransformItem[]} transformJS
 * @returns {string}
 */
function js2transform(transformJS) {
  const transformString = transformJS
    .map((transform) => {
      return `${transform.name}(${transform.data
        .map((n) => removeLeadingZero(n))
        .join(' ')})`;
    })
    .join('');

  return transformString;
}
