import { addADigitToNumber } from '../../plugins/minifyTransforms.js';

/** @type [number,number,number][] */
const TEST_CASES = [
  [1.23, 1.234, 1.234],
  [1e-7, 1.1597407e-7, 1.2e-7],
];

for (const testCase of TEST_CASES) {
  const input = testCase[0];
  test(input.toString(), () => {
    const result = addADigitToNumber(input, testCase[1]);
    expect(result).toBe(testCase[2]);
  });
}
