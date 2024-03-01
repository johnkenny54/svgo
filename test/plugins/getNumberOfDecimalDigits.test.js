import { getNumberOfDecimalDigits } from '../../plugins/_decomposeMatrix.js';

/** @type [number,number][] */
const testCases = [
  [1.23, 2],
  [1e-7, 7],
  [1.2e-7, 8],
];

for (const testCase of testCases) {
  const input = testCase[0];
  test(input.toString(), () => {
    const result = getNumberOfDecimalDigits(input);
    expect(result).toBe(testCase[1]);
  });
}
