import { toFixed } from '../lib/svgo/tools.js';
import { mergeTranslateAndRotate, transformsMultiply } from './_transforms.js';

/**
 * @typedef {{ name: string, data: number[] }} TransformItem
 * @typedef {{floatPrecision?:number,matrixPrecision?:number,round09?:number|false}} MinifyParams
 */

/**
 * @param {TransformItem} originalMatrix
 * @param {TransformItem} roundedMatrix
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 * @returns {TransformItem[][]}
 */
export const decompose = (
  originalMatrix,
  roundedMatrix,
  floatPrecision,
  matrixPrecision,
) => {
  const e = originalMatrix.data[4];
  const f = originalMatrix.data[5];

  const translate =
    e !== 0 || f !== 0 ? { name: 'translate', data: [e, f] } : undefined;

  let decompositions = decomposeRotateScale(
    translate,
    originalMatrix,
    roundedMatrix,
    floatPrecision,
    matrixPrecision,
  );
  if (decompositions.length) {
    return decompositions;
  }
  decompositions = decomposeScaleRotate(
    translate,
    originalMatrix,
    roundedMatrix,
    floatPrecision,
    matrixPrecision,
  );
  if (decompositions.length) {
    return decompositions;
  }

  return [];
};

/**
 * @param {number} n
 */
export const getNumberOfDecimalDigits = (n) => {
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
};

/**
 * @param {TransformItem[]} transforms
 * @param {TransformItem} targetMatrix
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 */
export const roundToMatrix = (
  transforms,
  targetMatrix,
  floatPrecision,
  matrixPrecision,
) => {
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
};

/**
 * @param {TransformItem} transform
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 */
export const roundTransform = (transform, floatPrecision, matrixPrecision) => {
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
};

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
        if (o !== rounded.data[index]) {
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
 * @param {TransformItem|undefined} translate
 * @param {TransformItem} originalMatrix
 * @param {TransformItem} roundedMatrix
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 * @returns {TransformItem[][]}
 */
function decomposeRotateScale(
  translate,
  originalMatrix,
  roundedMatrix,
  floatPrecision,
  matrixPrecision,
) {
  let [a, b, c, d] = originalMatrix.data;

  let sx = Math.hypot(a, b);
  const sy = Math.hypot(c, d);
  if (sx === 0 || sy === 0) {
    return [];
  }
  let cos = a / sx;
  let sin = b / sx;
  const cos2 = d / sy;

  if (toFixed(cos + cos2, floatPrecision) === 0) {
    // Scales have opposite signs so the calculated cosines are opposites. Invert sx and invert the sine and cosine.
    sx = -sx;
    cos = -cos;
    sin = -sin;
  }

  const degrees = findRotation(cos, sin, cos2, floatPrecision);
  if (degrees === undefined) {
    return [];
  }

  const result = [];
  if (translate) {
    result.push(translate);
  }

  result.push({ name: 'rotate', data: [degrees, 0, 0] });
  result.push({ name: 'scale', data: [sx, sy] });
  const rounded = roundToMatrix(
    result,
    roundedMatrix,
    floatPrecision,
    matrixPrecision,
  );

  const allResults = [];

  if (rounded) {
    allResults.push(rounded);
  }

  // If there's a translate, try to merge it with the rotate.
  if (translate && degrees % 360 !== 0) {
    const merged = mergeTranslateAndRotate(
      translate.data[0],
      translate.data[1],
      degrees,
    );
    if (merged) {
      const result = [merged, { name: 'scale', data: [sx, sy] }];
      const rounded = roundToMatrix(
        result,
        roundedMatrix,
        floatPrecision,
        matrixPrecision,
      );
      if (rounded) {
        allResults.push(rounded);
      }
    }
  }

  return allResults;
}

/**
 * @param {TransformItem|undefined} translate
 * @param {TransformItem} originalMatrix
 * @param {TransformItem} roundedMatrix
 * @param {number} floatPrecision
 * @param {number} matrixPrecision
 * @returns {TransformItem[][]}
 */
function decomposeScaleRotate(
  translate,
  originalMatrix,
  roundedMatrix,
  floatPrecision,
  matrixPrecision,
) {
  let [a, b, c, d] = originalMatrix.data;

  let sx = Math.hypot(a, c);
  const sy = Math.hypot(b, d);
  if (sx === 0 || sy === 0) {
    return [];
  }
  let cos = a / sx;
  let sin = b / sy;
  const cos2 = d / sy;

  if (toFixed(cos + cos2, floatPrecision) === 0) {
    // Scales have opposite signs so the calculated cosines are opposites. Invert sx and invert the cosine.
    sx = -sx;
    cos = -cos;
  }

  const degrees = findRotation(cos, sin, cos2, floatPrecision);
  if (degrees === undefined) {
    return [];
  }

  const result = [];
  if (translate) {
    result.push(translate);
  }

  result.push({ name: 'scale', data: [sx, sy] });
  result.push({ name: 'rotate', data: [degrees, 0, 0] });
  const rounded = roundToMatrix(
    result,
    roundedMatrix,
    floatPrecision,
    matrixPrecision,
  );

  return rounded ? [rounded] : [];
}

/**
 *
 * @param {number} cos
 * @param {number} sin
 * @param {number} cos2
 * @param {number} floatPrecision
 * @returns {number|undefined}
 */
function findRotation(cos, sin, cos2, floatPrecision) {
  if (toFixed(cos - cos2, floatPrecision) !== 0) {
    return;
  }

  // Find the angle. asin() is in the range -pi/2 to pi/2, acos from 0 to pi, so adjust accordingly depending on signs.
  // Then average acos and asin.
  let acos = Math.acos(cos);
  let asin = Math.asin(sin);
  if (Number.isNaN(asin) || Number.isNaN(acos)) {
    return;
  }
  if (sin < 0) {
    // sin is negative, so angle is between -pi and 0.
    acos = -acos;
    if (cos < 0) {
      // Both sin and cos are negative, so angle is between -pi and -pi/2.
      asin = -Math.PI - asin;
    }
  } else {
    // sin is positive, so angle is between 0 and pi.
    if (cos < 0) {
      // angle is between pi/2 and pi.
      asin = Math.PI - asin;
    }
  }

  return ((acos + asin) * 90) / Math.PI;
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
