import { transform2js } from '../../plugins/_transforms.js';
import { jsToString } from '../../plugins/minifyTransforms.js';
import { roundToMatrix } from '../../plugins/_decomposeMatrix.js';

/** @type [string,string,string|undefined,number?,number?][] */
const TEST_CASES = [
  [
    'rotate(-23.7001)',
    'matrix(0.91566,-0.40195,0.40195,0.91566,0,0)',
    'rotate(-23.7)',
  ],
  [
    'rotate(-23.789)',
    'matrix(0.91566,-0.40195,0.40195,0.91566,0,0)',
    undefined,
  ],
  [
    'rotate(-23.7001)',
    'matrix(0.91566,-0.40195,0.40195,0.91566,0,0)',
    'rotate(-23.7)',
    4,
  ],
  ['rotate(.01234567)', 'matrix(1,0.00022,-0.00022,1,0,0)', 'rotate(.0124)'],
  [
    'rotate(31.00049)',
    'matrix(0.85716,0.51505,-0.51505,0.85716,0,0)',
    'rotate(31.001)',
  ],
  [
    'translate(32.1234)rotate(15.7)',
    'matrix(0.96269,0.2706,-0.2706,0.96269,32.123,0)',
    'translate(32.123)rotate(15.7)',
  ],
  [
    'scale(1.234567)rotate(1.3)',
    'matrix(1.23425,0.02801,-0.02801,1.23425,0,0)',
    'scale(1.23457)rotate(1.3)',
  ],
  [
    'scale(1.234567)rotate(1.3)',
    'matrix(1.234,0.028,-0.028,1.234,0,0)',
    'scale(1.2346)rotate(1.3)',
    3,
    3,
  ],
  [
    'translate(5,70)rotate(0,0,0)scale(.4,.4)',
    'matrix(.4 0 0 .4 5 70)',
    'translate(5 70)rotate(0)scale(.4)',
    3,
    5,
  ],
  // Should work when target matrix is lower precision than specified.
  [
    'rotate(-45 261.757 -252.243)skewX(45)',
    'matrix(.707 -.707 1.414 0 255.03 111.21)',
    'rotate(-45 261.76 -252.24)skewX(45)',
    3,
    5,
  ],
];

for (const testCase of TEST_CASES) {
  const inputStr = testCase[0];
  test(inputStr, () => {
    const input = transform2js(inputStr);
    const floatPrecision = testCase[3] ?? 3;
    const matrixPrecision = testCase[4] ?? 5;
    const result = roundToMatrix(
      input,
      transform2js(testCase[1])[0],
      floatPrecision,
      matrixPrecision,
    );
    expect(result ? jsToString(result) : result).toBe(testCase[2]);
  });
}
