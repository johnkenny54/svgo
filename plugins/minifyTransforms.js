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
  const candidates = [minifyTransformsLosslessly(parsed)];

  if (
    params.floatPrecision !== undefined &&
    params.matrixPrecision !== undefined
  ) {
    // If there is more than one transform, multiply them all together before rounding.
    const transform =
      parsed.length > 1 ? transformsMultiply(parsed) : parsed[0];

    const rounded = roundTransform(
      transform,
      params.floatPrecision,
      params.matrixPrecision,
    );
    candidates.push(minifyTransformsLosslessly([rounded]));

    // If the rounded transform is a matrix, see if we can decompose it.
    if (rounded.name === 'matrix') {
      const decomposed = decompose(
        transform,
        rounded,
        params.floatPrecision,
        params.matrixPrecision,
      );
      if (decomposed) {
        candidates.push(minifyTransformsLosslessly(decomposed));
      }
    }
  }

  let shortest = jsToString(candidates[0]);
  for (let index = 0; index < candidates.length; index++) {
    const str = jsToString(candidates[index]);
    if (str.length < shortest.length) {
      shortest = str;
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
 * @param {TransformItem} originalMatrix
 * @param {TransformItem} roundedMatrix
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 * @returns {TransformItem[]|undefined}
 */
function decompose(
  originalMatrix,
  roundedMatrix,
  floatPrecision,
  matrixPrecision,
) {
  const data = originalMatrix.data;

  if (data[0] === data[3] && data[1] === -data[2]) {
    // It might be a rotation matrix - check and see.
    if (toFixed(Math.hypot(data[0], data[1]), matrixPrecision) === 1) {
      // Find the angle. asin() is in the range -pi/2 to pi/2, acos from 0 to pi, so adjust accordingly depending on signs.
      // Then average acos and asin.
      let asin = Math.asin(data[1]);
      let acos = Math.acos(data[0]);
      if (data[1] < 0) {
        // sin is negative, so angle is between -pi and 0.
        acos = -acos;
        if (data[0] < 0) {
          // Both sin and cos are negative, so angle is between -pi and -pi/2.
          asin = -Math.PI - asin;
        }
      } else {
        // sin is positive, so angle is between 0 and pi.
        if (data[0] < 0) {
          // angle is between pi/2 and pi.
          asin = Math.PI - asin;
        }
      }

      const result = [];
      if (data[4] !== 0 || data[5] !== 0) {
        result.push({ name: 'translate', data: [data[4], data[5]] });
      }

      const degrees = ((acos + asin) * 90) / Math.PI;
      result.push({ name: 'rotate', data: [degrees] });
      return adaptiveRound(
        result,
        roundedMatrix,
        floatPrecision,
        matrixPrecision,
      );
    }
  }

  return;
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
    case 'scale':
      if (t.data[0] === 1 && (t.data.length === 1 || t.data[1] === 1)) {
        // This is an identity transform; remove it.
        return;
      }
      break;
    case 'skewX':
    case 'skewY':
      if (t.data[0] === 0) {
        // This is an identity transform; remove it.
        return;
      }
      break;
    case 'translate':
      if (t.data[0] === 0 && (t.data.length === 1 || t.data[1] === 0)) {
        // This is an identity transform; remove it.
        return;
      }
      break;
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
 * @param {TransformItem} transform
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 */
function roundTransform(transform, floatPrecision, matrixPrecision) {
  switch (transform.name) {
    case 'matrix':
      // Use matrixPrecision on first 4 entries - they tend to be small and multiplied frequently.
      return {
        name: transform.name,
        data: transform.data.map((n, index) =>
          toFixed(n, index < 4 ? matrixPrecision : floatPrecision),
        ),
      };
    case 'scale':
      // Use matrixPrecision since scale is multiplied.
      return {
        name: transform.name,
        data: transform.data.map((n) => toFixed(n, matrixPrecision)),
      };
    default:
      return {
        name: transform.name,
        data: transform.data.map((n) => toFixed(n, floatPrecision)),
      };
  }
}

/**
 * Convert transforms JS representation to string.
 *
 * @param {TransformItem[]} transformJS
 * @returns {string}
 */
export function jsToString(transformJS) {
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

/**
 * @param {TransformItem[]} transforms
 * @param {TransformItem} targetMatrix
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 */
export function adaptiveRound(
  transforms,
  targetMatrix,
  floatPrecision,
  matrixPrecision,
) {
  /** @type {TransformItem[]} */
  const rounded = [];
  for (const transform of transforms) {
    rounded.push(roundTransform(transform, floatPrecision, matrixPrecision));
  }
  while (
    !roundedMatchesTarget(
      rounded,
      targetMatrix,
      floatPrecision,
      matrixPrecision,
    )
  ) {
    if (!addADigitToAllTransforms(rounded, transforms)) {
      // Can't increase the number of digits, and we still haven't hit the target matrix.
      return;
    }
  }

  // See if we can decrease rounding for anything and still hit the target.
  let canDecrease = true;
  do {
    canDecrease = removeADigitFromAllTransforms(
      rounded,
      targetMatrix,
      floatPrecision,
      matrixPrecision,
    );
  } while (canDecrease);

  return rounded;
}

/**
 * @param {TransformItem[]} rounded
 * @param {TransformItem} targetMatrix
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 */
function roundedMatchesTarget(
  rounded,
  targetMatrix,
  floatPrecision,
  matrixPrecision,
) {
  const actualMatrix = roundTransform(
    transformsMultiply(rounded),
    floatPrecision,
    matrixPrecision,
  );
  return matricesAreEqual(actualMatrix, targetMatrix);
}

/**
 * @param {TransformItem[]} rounded
 * @param {TransformItem} targetMatrix
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 */
function removeADigitFromAllTransforms(
  rounded,
  targetMatrix,
  floatPrecision,
  matrixPrecision,
) {
  let changed = false;
  for (let index = 0; index < rounded.length; index++) {
    const origTransform = rounded[index];
    const decreasedTransform = removeADigitFromOneTransform(origTransform);
    if (decreasedTransform) {
      // Try all the decreased values and see if they still match the target matrix.
      for (let index = 0; index < decreasedTransform.data.length; index++) {
        const origValue = origTransform.data[index];
        const trialValue = decreasedTransform.data[index];
        if (origValue !== trialValue) {
          origTransform.data[index] = trialValue;
          if (
            roundedMatchesTarget(
              rounded,
              targetMatrix,
              floatPrecision,
              matrixPrecision,
            )
          ) {
            changed = true;
          } else {
            // Restore the original value.
            origTransform.data[index] = origValue;
          }
        }
      }
    }
  }
  return changed;
}

/**
 * @param {TransformItem} t
 */
function removeADigitFromOneTransform(t) {
  const newData = [];
  let changed = false;
  for (const n of t.data) {
    if (Number.isInteger(n)) {
      newData.push(n);
    } else {
      newData.push(toFixed(n, getNumberOfDecimalDigits(n) - 1));
      changed = true;
    }
  }
  return changed ? { name: t.name, data: newData } : undefined;
}

/**
 * @param {TransformItem[]} rounded
 * @param {TransformItem[]} original
 */
function addADigitToAllTransforms(rounded, original) {
  let anyChanged = false;
  for (let index = 0; index < rounded.length; index++) {
    const changed = addADigitToOneTransform(rounded[index], original[index]);
    anyChanged = anyChanged || changed;
  }
  return anyChanged;
}

/**
 * @param {TransformItem} rounded
 * @param {TransformItem} original
 */
function addADigitToOneTransform(rounded, original) {
  switch (rounded.name) {
    case 'rotate':
    case 'translate': {
      let changed = false;
      for (let index = 0; index < rounded.data.length; index++) {
        const r = rounded.data[index];
        const o = original.data[index];
        if (r !== o) {
          rounded.data[index] = addADigitToNumber(r, o);
          changed = true;
        }
      }
      return changed;
    }
  }
  throw new Error(rounded.name);
}

/**
 * @param {number} rounded
 * @param {number} original
 */
function addADigitToNumber(rounded, original) {
  let r = rounded;
  for (
    let n = getNumberOfDecimalDigits(rounded) + 1;
    r === rounded && r !== original;
    n++
  ) {
    r = toFixed(original, n);
  }
  return r;
}

/**
 * @param {TransformItem} m1
 * @param {TransformItem} m2
 */
function matricesAreEqual(m1, m2) {
  for (let index = 0; index < 6; index++) {
    if (m1.data[index] !== m2.data[index]) {
      return false;
    }
  }
  return true;
}

/**
 * @param {number} n
 */
function getNumberOfDecimalDigits(n) {
  const str = n.toString();
  return str.slice(str.indexOf('.')).length - 1;
}
