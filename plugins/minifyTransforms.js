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

  // First minify them individually.
  let minified = [];
  for (const transform of parsed) {
    const t = minifyTransform(transform);
    if (t) {
      minified.push(t);
    }
  }

  // If there is more than one, try to merge them.
  while (minified.length > 1) {
    const merged = mergeTransforms(minified);
    if (merged.length === minified.length) {
      break;
    }
    minified = merged;
  }

  return jsToString(minified);
}

/**
 * @param {TransformItem[]} transforms
 */
function mergeTransforms(transforms) {
  const merged = [];
  for (let index = 0; index < transforms.length; index++) {
    const transform = transforms[index];
    const next = transforms[index + 1];
    if (next) {
      switch (transform.name) {
        case 'scale':
          // If next one is a scale, merge them.
          if (next.name === 'scale') {
            const sx = transform.data[0] * next.data[0];
            const sy =
              (transform.data.length > 1
                ? transform.data[1]
                : transform.data[0]) *
              (next.data.length > 1 ? next.data[1] : next.data[0]);
            merged.push({ name: 'scale', data: [sx, sy] });
            index++;
            continue;
          }
          break;
        case 'translate':
          // If next one is a translate, merge them.
          if (next.name === 'translate') {
            const x = transform.data[0] + next.data[0];
            const y =
              (transform.data.length > 1 ? transform.data[1] : 0) +
              (next.data.length > 1 ? next.data[1] : 0);
            merged.push({ name: 'translate', data: [x, y] });
            index++;
            continue;
          }
          break;
      }
    }
    merged.push(transform);
  }
  return merged;
}

/**
 * @param {TransformItem} t
 */
function minifyTransform(t) {
  switch (t.name) {
    case 'matrix':
      return minifyMatrix(t.data);
    case 'rotate':
      return minifyRotate(t.data);
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
  if (data[1] === 0 && data[2] === 0 && data[4] === 0 && data[5] === 0) {
    return { name: 'scale', data: [data[0], data[3]] };
  }
  return { name: 'matrix', data: data };
}

/**
 * @param {number[]} data
 */
function minifyRotate(data) {
  const cx = data.length === 1 ? 0 : data[1];
  const cy = data.length === 1 ? 0 : data[2];
  if (cx === 0 && cy === 0) {
    switch (data[0]) {
      case 180:
        return { name: 'scale', data: [-1] };
      case 0:
      case 360:
        return;
    }
  }
  return { name: 'rotate', data: data };
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
      case 'rotate':
        if (
          transform.data.length > 1 &&
          transform.data[1] === 0 &&
          transform.data[2] === 0
        ) {
          return transform.data.slice(0, 1);
        }
        break;
      case 'scale':
        if (transform.data[0] === transform.data[1]) {
          return transform.data.slice(0, 1);
        }
        break;
      case 'translate':
        if (transform.data[1] === 0) {
          return transform.data.slice(0, 1);
        }
        break;
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
