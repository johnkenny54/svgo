import { transform2js, transformsMultiply } from './_transforms.js';
import { removeLeadingZero, toFixed } from '../lib/svgo/tools.js';

/**
 * @typedef {{ name: string, data: number[] }} TransformItem
 * @typedef {{floatPrecision?:number,matrixPrecision?:number,round09?:number|false}} MinifyParams
 */

export const name = 'minifyTransforms';
export const description = 'Make transform expressions as short as possible';

/**
 * Make transform expressions as short as possible.
 *
 * @type {import('./plugins-types.js').Plugin<'minifyTransforms'>}
 */
export const fn = (root, params) => {
  const calculatedParams = { ...params };
  if (calculatedParams.floatPrecision === undefined) {
    calculatedParams.matrixPrecision = undefined;
  } else if (calculatedParams.matrixPrecision === undefined) {
    calculatedParams.matrixPrecision = calculatedParams.floatPrecision + 2;
  }
  if (calculatedParams.round09 === undefined) {
    calculatedParams.round09 = 6;
  }

  return {
    element: {
      enter: (node) => {
        if (node.attributes.transform) {
          node.attributes.transform = minifyTransforms(
            node.attributes.transform,
            calculatedParams,
          );
        }
        if (node.attributes.gradientTransform) {
          node.attributes.gradientTransform = minifyTransforms(
            node.attributes.gradientTransform,
            calculatedParams,
          );
        }
        if (node.attributes.patternTransform) {
          node.attributes.patternTransform = minifyTransforms(
            node.attributes.patternTransform,
            calculatedParams,
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
  const parsedOriginal = transform2js(transforms);

  const floatPrecision = params.floatPrecision;
  const matrixPrecision = params.matrixPrecision;

  const shouldRound =
    floatPrecision !== undefined && matrixPrecision !== undefined;

  const roundedOriginal = roundExtremeValues(parsedOriginal, params);

  const losslessOriginal = minifyTransformsLosslessly(roundedOriginal);
  const candidates = [losslessOriginal];

  if (shouldRound) {
    // Find the target matrix to compare against.
    const targetMatrixExact = transformsMultiply(losslessOriginal);
    const targetMatrixRounded = roundTransform(
      targetMatrixExact,
      floatPrecision,
      matrixPrecision,
    );
    const originalHasMatrix = losslessOriginal.some((t) => t.name === 'matrix');

    if (originalHasMatrix || losslessOriginal.length > 1) {
      // Try to decompose the rounded matrix.
      const decomposed = decompose(
        targetMatrixExact,
        targetMatrixRounded,
        floatPrecision,
        matrixPrecision,
      );
      if (decomposed) {
        candidates.push(minifyTransformsLosslessly(decomposed));
      }
      // Add the rounded matrix itself as a candidate.
      candidates.push([targetMatrixRounded]);
    }

    if (!originalHasMatrix) {
      // Original expression already decomposed; round adaptively, then minify.
      const rounded = adaptiveRound(
        losslessOriginal,
        targetMatrixRounded,
        floatPrecision,
        matrixPrecision,
      );
      if (rounded) {
        candidates.push(minifyTransformsLosslessly(rounded));
      }
    }
  }

  return getShortest(candidates).str;
}

/**
 * @param {TransformItem[][]} candidates
 */
function getShortest(candidates) {
  let shortest = jsToString(candidates[0]);
  let shortestIndex = 0;
  for (let index = 0; index < candidates.length; index++) {
    const str = jsToString(candidates[index]);
    if (str.length < shortest.length) {
      shortest = str;
      shortestIndex = index;
    }
  }
  return { transforms: candidates[shortestIndex], str: shortest };
}

/**
 * @param {TransformItem[]} transforms
 * @returns {TransformItem[]}
 */
function minifyTransformsLosslessly(transforms) {
  // Normalize to a matrix where we can.
  const normalized = normalize(transforms);

  return normalized;
}

/**
 * @param {TransformItem[]} transforms
 * @returns {TransformItem[]}
 */
function normalize(transforms) {
  /**
   *
   * @param {TransformItem} t1
   * @param {TransformItem} t2
   * @returns {TransformItem|undefined}
   */
  function mergeTransforms(t1, t2) {
    switch (t1.name) {
      case 'matrix':
        if (t2.name == 'matrix') {
          const m = mulMatrices(t1.data, t2.data);
          if (m) {
            return m;
          }
        }
        break;
      case 'rotate':
        if (
          t2.name === 'rotate' &&
          t1.data[1] === t2.data[1] &&
          t1.data[2] === t2.data[2]
        ) {
          // Add the angles if cx and cy are the same.
          return normalizeTransform({
            name: 'rotate',
            data: [t1.data[0] + t2.data[0], t1.data[1], t1.data[2]],
          });
        }
    }
    return;
  }

  /**
   * @param {number[]} m1
   * @param {number[]} m2
   * @returns {TransformItem|undefined}
   */
  function mulMatrices(m1, m2) {
    /**
     *
     * @param {number} a
     * @param {number} b
     * @param {number} c
     * @param {number} d
     */
    function mulAdd(a, b, c, d) {
      const ab = exactMul(a, b);
      const cd = exactMul(c, d);
      if (ab !== undefined && cd !== undefined) {
        return exactAdd(ab, cd);
      }
    }
    const [a1, b1, c1, d1, e1, f1] = m1;
    const [a2, b2, c2, d2, e2, f2] = m2;
    const a = mulAdd(a1, a2, c1, b2);
    const b = mulAdd(b1, a2, d1, b2);
    const c = mulAdd(a1, c2, c1, d2);
    const d = mulAdd(b1, c2, d1, d2);
    const e = mulAdd(a1, e2, c1, f2);
    const f = mulAdd(b1, e2, d1, f2);
    if (
      a !== undefined &&
      b !== undefined &&
      c !== undefined &&
      d !== undefined &&
      e !== undefined &&
      f !== undefined
    ) {
      return {
        name: 'matrix',
        data: [a, b, c, d, exactAdd(e, e1), exactAdd(f, f1)],
      };
    }
  }

  /**
   * @param {TransformItem} t
   * @returns {TransformItem[]}
   */
  function shortenTransform(t) {
    switch (t.name) {
      case 'matrix':
        if (t.data[1] === 0 && t.data[2] === 0) {
          // translate()scale()
          const result = [];
          if (t.data[4] !== 0 || t.data[5] !== 0) {
            result.push({ name: 'translate', data: [t.data[4], t.data[5]] });
          }
          if (t.data[0] !== 1 || t.data[3] !== 1) {
            result.push({ name: 'scale', data: [t.data[0], t.data[3]] });
          }
          if (result.length < 2) {
            return result;
          }
          return getShortest([[t], result]).transforms;
        }
        // Look for rotate(+/-90).
        if (
          t.data[0] === 0 &&
          t.data[3] === 0 &&
          t.data[4] === 0 &&
          t.data[5] === 0
        ) {
          let angle;
          switch (t.data[1]) {
            case 1:
              if (t.data[2] === -1) {
                angle = 90;
              }
              break;
            case -1:
              if (t.data[2] === 1) {
                angle = -90;
              }
              break;
          }
          if (angle) {
            return [{ name: 'rotate', data: [angle, 0, 0] }];
          }
        }
        break;
    }
    return [t];
  }

  /**
   * @param {TransformItem} t
   */
  function normalizeTransform(t) {
    switch (t.name) {
      case 'rotate':
        {
          if (t.data.length === 1 || (t.data[1] === 0 && t.data[2] === 0)) {
            // Convert to matrix if it's a multiple of 90 degrees.
            let cos, sin;
            switch (t.data[0] % 360) {
              case 0:
                cos = 1;
                sin = 0;
                break;
              case 90:
                cos = 0;
                sin = 1;
                break;
              case 180:
                cos = -1;
                sin = 0;
                break;
              case 270:
                cos = 0;
                sin = -1;
                break;
              default:
                return {
                  name: 'rotate',
                  data: t.data.length === 1 ? [t.data[0], 0, 0] : [...t.data],
                };
            }
            return { name: 'matrix', data: [cos, sin, -sin, cos, 0, 0] };
          }
        }
        return {
          name: 'rotate',
          data: t.data.length === 1 ? [t.data[0], 0, 0] : [...t.data],
        };
      case 'scale':
        return {
          name: 'matrix',
          data: [
            t.data[0],
            0,
            0,
            t.data.length > 1 ? t.data[1] : t.data[0],
            0,
            0,
          ],
        };
      case 'skewX':
      case 'skewY':
        switch (t.data[0] % 360) {
          case 0:
            return {
              name: 'matrix',
              data: [1, 0, 0, 1, 0, 0],
            };
        }
        return t;
      case 'translate':
        return {
          name: 'matrix',
          data: [1, 0, 0, 1, t.data[0], t.data.length > 1 ? t.data[1] : 0],
        };
      default:
        return t;
    }
  }

  let tryToMergeAgain = true;
  let mergedTransforms = [];
  while (tryToMergeAgain) {
    tryToMergeAgain = false;
    let currentTransform;
    for (const transform of transforms) {
      const normalized = normalizeTransform(transform);
      if (currentTransform) {
        const merged = mergeTransforms(currentTransform, normalized);
        if (merged) {
          currentTransform = merged;
          tryToMergeAgain = true;
        } else {
          mergedTransforms.push(currentTransform);
          currentTransform = normalized;
        }
      } else {
        currentTransform = normalized;
      }
    }
    if (currentTransform) {
      mergedTransforms.push(currentTransform);
    }
    if (tryToMergeAgain) {
      transforms = mergedTransforms;
      mergedTransforms = [];
    }
  }

  const shortened = [];
  for (const transform of mergedTransforms) {
    shortened.push(...shortenTransform(transform));
  }
  return shortened;
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
  let [a, b, c, d, e, f] = originalMatrix.data;

  let sx = Math.hypot(a, b);
  const sy = Math.hypot(c, d);
  let cos = a / sx;
  let sin = b / sx;
  const cos2 = d / sy;

  if (toFixed(cos + cos2, floatPrecision) === 0) {
    // Scales have opposite signs so the calculated cosines are opposites. Invert sx and invert the sine and cosine.
    sx = -sx;
    cos = -cos;
    sin = -sin;
    a = -a;
    b = -b;
  }

  // If we get the same angle with both the sx and sy calculations, it's in the form rotate()scale().
  if (toFixed(cos - cos2, floatPrecision) === 0) {
    // It might be a rotation matrix - check and see.

    // Find the angle. asin() is in the range -pi/2 to pi/2, acos from 0 to pi, so adjust accordingly depending on signs.
    // Then average acos and asin.
    let acos = Math.acos(cos);
    let asin = Math.asin(sin);
    if (Number.isNaN(asin) || Number.isNaN(acos)) {
      return;
    }
    if (b < 0) {
      // sin is negative, so angle is between -pi and 0.
      acos = -acos;
      if (a < 0) {
        // Both sin and cos are negative, so angle is between -pi and -pi/2.
        asin = -Math.PI - asin;
      }
    } else {
      // sin is positive, so angle is between 0 and pi.
      if (a < 0) {
        // angle is between pi/2 and pi.
        asin = Math.PI - asin;
      }
    }

    const result = [];
    if (e !== 0 || f !== 0) {
      result.push({ name: 'translate', data: [e, f] });
    }

    const degrees = ((acos + asin) * 90) / Math.PI;
    result.push({ name: 'rotate', data: [degrees, 0, 0] });
    result.push({ name: 'scale', data: [sx, sy] });
    return adaptiveRound(
      result,
      roundedMatrix,
      floatPrecision,
      matrixPrecision,
    );
  }

  return;
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
  let count = 0;
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
    count++;
    if (count > 10) {
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
    case 'scale':
    case 'skewX':
    case 'skewY':
    case 'translate': {
      let changed = false;
      for (let index = 0; index < rounded.data.length; index++) {
        const r = rounded.data[index];
        const o = original.data[index];
        if (r !== rounded.data[index]) {
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
export function addADigitToNumber(rounded, original) {
  let r = rounded;
  for (
    let n = getNumberOfDecimalDigits(rounded) + 1;
    r === rounded && r !== original && n <= 12;
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
export function getNumberOfDecimalDigits(n) {
  const str = n.toString();
  if (str.includes('e')) {
    // Include the number of digits both before and after the decimal point, and account for the exponent.
    const parts = str.split('e');
    const numberStr = parts[0];
    const expStr = parts[1];
    return Math.max(
      numberStr.length -
        (numberStr.includes('.') ? 1 : 0) -
        parseInt(expStr) -
        1,
      0,
    );
  }
  return str.slice(str.indexOf('.')).length - 1;
}

/**
 * @param {TransformItem[]} transforms
 * @param {MinifyParams} params
 */
function roundExtremeValues(transforms, params) {
  /**
   * @param {number} n
   */
  function roundValue(n) {
    if (params.round09) {
      return round09(n, params.round09);
    }
    return n;
  }

  const rounded = [];
  for (const transform of transforms) {
    rounded.push({
      name: transform.name,
      data: transform.data.map((n) => roundValue(n)),
    });
  }
  return rounded;
}

/**
 * Round numbers with consective 0s or 9s.
 * @param {number} n
 * @param {number} minCount number of consecutive 0s or 99s that trigger rounding.
 * @returns {number}
 */
export function round09(n, minCount) {
  /**
   * @param {RegExp} re
   */
  function checkPattern(re) {
    const m = str.match(re);
    if (m) {
      return toFixed(n, m[1].length);
    }
  }
  const str = n.toString();
  const re9 = new RegExp(`.*\\.(\\d*)9{${minCount},}`);
  const p9 = checkPattern(re9);
  if (p9 !== undefined) {
    return p9;
  }
  const re0 = new RegExp(`.*\\.(\\d*)0{${minCount},}`);
  const p0 = checkPattern(re0);
  if (p0 !== undefined) {
    return p0;
  }
  return n;
}

/**
 * @param {number} n
 * @param {number} m
 */
function exactAdd(n, m) {
  const d1 = getNumberOfDecimalDigits(n);
  const d2 = getNumberOfDecimalDigits(m);
  return toFixed(n + m, Math.max(d1 + d2));
}

/**
 * @param {number} n
 * @param {number} m
 */
function exactMul(n, m) {
  const d1 = getNumberOfDecimalDigits(n);
  const d2 = getNumberOfDecimalDigits(m);
  if (d1 + d2 > 12) {
    return undefined;
  }
  return toFixed(n * m, d1 + d2);
}
