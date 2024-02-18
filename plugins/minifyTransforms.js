import { transform2js, transformsMultiply } from './_transforms.js';
import { removeLeadingZero, toFixed } from '../lib/svgo/tools.js';

/**
 * @typedef {{ name: string, data: number[] }} TransformItem
 * @typedef {{floatPrecision?:number,matrixPrecision?:number}} MinifyParams
 */

export const name = 'minifyTransforms';
export const description = 'Make transform expressions as short as possible';

/**
 * Make transform expressions as short as possible.
 *
 * @type {import('./plugins-types.js').Plugin<'minifyTransforms'>}
 */
export const fn = (root, params) => {
  const precision = { ...params };
  if (precision.floatPrecision === undefined) {
    precision.matrixPrecision = undefined;
  } else if (precision.matrixPrecision === undefined) {
    precision.matrixPrecision = precision.floatPrecision + 2;
  }

  return {
    element: {
      enter: (node) => {
        if (node.attributes.transform) {
          node.attributes.transform = minifyTransforms(
            node.attributes.transform,
            precision,
          );
        }
        if (node.attributes.gradientTransform) {
          node.attributes.gradientTransform = minifyTransforms(
            node.attributes.gradientTransform,
            precision,
          );
        }
        if (node.attributes.patternTransform) {
          node.attributes.patternTransform = minifyTransforms(
            node.attributes.patternTransform,
            precision,
          );
        }
      },
    },
  };
};

/**
 * @param {string} transforms
 * @param {MinifyParams} params
 * @returns {string}
 */
function minifyTransforms(transforms, params) {
  const parsed = transform2js(transforms);
  const lossless = minifyTransformsLosslessly(parsed);
  let shortest = jsToString(lossless);

  if (
    params.floatPrecision !== undefined &&
    params.matrixPrecision !== undefined
  ) {
    const rounded = roundTransforms(
      parsed,
      params.floatPrecision,
      params.matrixPrecision,
    );
    const roundedOpt = minifyTransformsLosslessly(rounded);
    const roundedOptStr = jsToString(roundedOpt);
    if (roundedOptStr.length < shortest.length) {
      shortest = roundedOptStr;
    }
  }

  return shortest;
}

/**
 * @param {TransformItem[]} transforms
 * @returns {TransformItem[]}
 */
function minifyTransformsLosslessly(transforms) {
  // First minify them individually.
  let minified = [];
  for (const transform of transforms) {
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

  return minified;
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
  if (data[0] === 0 && data[3] === 0 && data[4] === 0 && data[5] === 0) {
    if (
      (data[1] === 1 && data[2] === -1) ||
      (data[1] === -1 && data[2] === 1)
    ) {
      return { name: 'rotate', data: [data[1] === 1 ? 90 : -90] };
    }
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
 * @param {TransformItem[]} transforms
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 */
function roundTransforms(transforms, floatPrecision, matrixPrecision) {
  const rounded = [];

  // If there is more than one transform, multiply them all together before rounding.
  if (transforms.length > 1) {
    transforms = [transformsMultiply(transforms)];
  }

  // TODO: DO WE STILL NEED THE LOOP?
  for (const transform of transforms) {
    switch (transform.name) {
      case 'matrix':
        // Use matrixPrecision on first 4 entries - they tend to be small and multiplied frequently.
        rounded.push({
          name: transform.name,
          data: transform.data.map((n, index) =>
            toFixed(n, index < 4 ? matrixPrecision : floatPrecision),
          ),
        });
        break;
      case 'scale':
        // Use matrixPrecision since scale is multiplied.
        rounded.push({
          name: transform.name,
          data: transform.data.map((n) => toFixed(n, matrixPrecision)),
        });
        break;
      default:
        rounded.push({
          name: transform.name,
          data: transform.data.map((n) => toFixed(n, floatPrecision)),
        });
        break;
    }
  }
  return rounded;
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
