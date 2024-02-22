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
  // First minify them individually.
  let minified = [];
  for (const transform of transforms) {
    const t = minifyTransform(transform);
    if (t) {
      minified.push(...t);
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
  return mergeUnlikeTransforms(mergeLikeTransforms(transforms));
}

/**
 * @param {TransformItem[]} transforms
 */
function mergeLikeTransforms(transforms) {
  /**
   * @param {TransformItem} t1
   * @param {TransformItem} t2
   */
  function merge(t1, t2) {
    switch (t1.name) {
      case 'scale': {
        // Merge adjacent scales if they can be multiplied exactly.
        const sx1 = t1.data[0];
        const sy1 = t1.data.length > 1 ? t1.data[1] : sx1;
        const sx2 = t2.data[0];
        const sy2 = t2.data.length > 1 ? t2.data[1] : sx2;
        const sx = exactMul(sx1, sx2);
        const sy = exactMul(sy1, sy2);
        if (sx === undefined || sy === undefined) {
          return;
        }
        return { name: 'scale', data: [sx, sy] };
      }
      case 'translate': {
        const x = exactAdd(t1.data[0], t2.data[0]);
        const y = exactAdd(
          t1.data.length > 1 ? t1.data[1] : 0,
          t2.data.length > 1 ? t2.data[1] : 0,
        );
        return { name: 'translate', data: [x, y] };
      }
      default:
        return;
    }
  }

  const mergedTransforms = [];
  let last;
  let hasMerges = false;
  for (let index = 0; index < transforms.length; index++) {
    const transform = transforms[index];
    if (last && last.name === transform.name) {
      // Try to merge them.
      const mergedTransform = merge(last, transform);
      if (mergedTransform) {
        // Successful, replace the last one in the array.
        mergedTransforms[mergedTransforms.length - 1] = mergedTransform;
        last = mergedTransform;
        hasMerges = true;
      } else {
        // Unable to merge. Just copy as is.
        mergedTransforms.push(transform);
        last = transform;
      }
    } else {
      // Different type than the last one, just copy it as is.
      mergedTransforms.push(transform);
      last = transform;
    }
  }

  if (!hasMerges) {
    return mergedTransforms;
  }

  // Run through the list again and minify each transform in case there are any identities.
  const minified = [];
  for (const transform of mergedTransforms) {
    minified.push(...minifyTransform(transform));
  }
  return minified;
}

/**
 * @param {TransformItem[]} transforms
 */
function mergeUnlikeTransforms(transforms) {
  const merged = [];
  for (let index = 0; index < transforms.length; index++) {
    const transform = transforms[index];
    let next = transforms[index + 1];
    if (next) {
      switch (transform.name) {
        case 'translate':
          switch (next.name) {
            case 'scale':
              {
                // translate()scale() will usually be shorter as a matrix, but if sx === sy, it may be shorter the way it is.
                const x = transform.data[0];
                const y = transform.data.length > 1 ? transform.data[1] : 0;
                const sx = next.data[0];
                const sy = next.data.length > 1 ? next.data[1] : sx;
                const matrix = { name: 'matrix', data: [sx, 0, 0, sy, x, y] };
                let useMatrix = true;
                if (sx === sy) {
                  const shortest = getShortest([[matrix], [transform, next]]);
                  useMatrix = shortest.transforms.length === 1;
                }
                if (useMatrix) {
                  merged.push(matrix);
                  index++;
                  continue;
                }
              }
              break;
          }
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
 * @returns {TransformItem[]}
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
        return [];
      }
      break;
    case 'skewX':
    case 'skewY':
      if (t.data[0] === 0) {
        // This is an identity transform; remove it.
        return [];
      }
      break;
    case 'translate':
      if (t.data[0] === 0 && (t.data.length === 1 || t.data[1] === 0)) {
        // This is an identity transform; remove it.
        return [];
      }
      break;
  }
  return [t];
}

/**
 * @param {number[]} data
 * @return {TransformItem[]}
 */
function minifyMatrix(data) {
  if (data[0] === 1 && data[1] === 0 && data[2] === 0 && data[3] === 1) {
    return minifyTranslate([data[4], data[5]]);
  }
  if (data[1] === 0 && data[2] === 0) {
    const scale = { name: 'scale', data: [data[0], data[3]] };
    if (data[4] === 0 && data[5] === 0) {
      return [scale];
    }
    const translate = { name: 'translate', data: [data[4], data[5]] };
    return getShortest([[{ name: 'matrix', data: data }], [translate, scale]])
      .transforms;
  }
  if (data[0] === 0 && data[3] === 0 && data[4] === 0 && data[5] === 0) {
    if (
      (data[1] === 1 && data[2] === -1) ||
      (data[1] === -1 && data[2] === 1)
    ) {
      return [{ name: 'rotate', data: [data[1] === 1 ? 90 : -90] }];
    }
  }
  return [{ name: 'matrix', data: data }];
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
        return [{ name: 'scale', data: [-1] }];
      case 0:
      case 360:
        return [];
    }
  }
  return [{ name: 'rotate', data: data }];
}

/**
 * @param {number[]} data
 */
function minifyTranslate(data) {
  if (data[0] === 0 && data[1] === 0) {
    return [];
  }
  return [{ name: 'translate', data: data }];
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
    case 'scale':
    case 'skewX':
    case 'skewY':
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
