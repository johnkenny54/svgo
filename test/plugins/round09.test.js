import { round09 } from '../../plugins/minifyTransforms.js';

/** @type [number,number,number][] */
const TEST_CASES = [
  [1.29994, 3, 1.3],
  [1.29994, 4, 1.29994],
  [1.0001, 4, 1.0001],
  [1.0001, 3, 1],
  [1e-10, 3, 0],
  [1e-3, 3, 0.001],
  [1e-4, 3, 0],
  [0.0000001, 6, 0],
  [0.0000001, 7, 1e-7],
];

for (const testCase of TEST_CASES) {
  const input = testCase[0];
  test(input.toString(), () => {
    const result = round09(input, testCase[1]);
    expect(result).toBe(testCase[2]);
  });
}
