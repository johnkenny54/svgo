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
          node.attributes.transform = minifyTransforms(
            node.attributes.transform,
          );
        }
        if (node.attributes.gradientTransform) {
          node.attributes.gradientTransform = minifyTransforms(
            node.attributes.gradientTransform,
          );
        }
        if (node.attributes.patternTransform) {
          node.attributes.patternTransform = minifyTransforms(
            node.attributes.patternTransform,
          );
        }
      },
    },
  };
};

/**
 * @param {string} transforms
 * @returns {string}
 */
function minifyTransforms(transforms) {
  const parsed = transform2js(transforms);

  const minified = [];
  for (const transform of parsed) {
    const t = minifyTransform(transform);
    if (t) {
      minified.push(t);
    }
  }

  return jsToString(minified);
}

/**
 * @param {TransformItem} t
 */
function minifyTransform(t) {
  switch (t.name) {
    case 'matrix':
      return minifyMatrix(t.data);
  }
  return t;
}

/**
 * @param {number[]} data
 */
function minifyMatrix(data) {
  if (data[0] === 1 && data[1] === 0 && data[2] === 0 && data[3] === 1) {
    return minifyTranslate([data[4], data[5]]);
  }
  return { name: 'matrix', data: data };
}

/**
 * @param {number[]} data
 */
function minifyTranslate(data) {
  if (data[0] === 0 && data[1] === 0) {
    return;
  }
  return { name: 'translate', data: data };
}

/**
 * Convert transforms JS representation to string.
 *
 * @param {TransformItem[]} transformJS
 * @returns {string}
 */
function jsToString(transformJS) {
  /**
   * @param {TransformItem} transform
   * @returns {number[]}
   */
  function minifyData(transform) {
    switch (transform.name) {
      case 'translate':
        if (transform.data[1] === 0) {
          return transform.data.slice(0, 1);
        }
    }
    return transform.data;
  }

  const transformString = transformJS
    .map((transform) => {
      return `${transform.name}(${minifyData(transform)
        .map((n) => minifyNumber(n))
        .join(' ')})`;
    })
    .join('');

  return transformString;
}

/**
 * @param {number} n
 */
function minifyNumber(n) {
  if (n !== 0 && n < 0.001 && n > -0.001) {
    return n.toExponential();
  }
  return removeLeadingZero(n);
}
