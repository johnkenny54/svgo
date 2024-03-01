import { getRoundingInfo, round09 } from '../../plugins/minifyTransforms.js';

/** @type [number,number|[number,number],number][] */
const testCases = [
  [1.29994, 3, 1.3],
  [1.29994, 4, 1.29994],
  [1.0001, 4, 1.0001],
  [1.0001, 3, 1],
  [1e-10, 3, 1e-10],
  [1e-3, 3, 0.001],
  [1e-4, 3, 1e-4],
  [0.0000001, 6, 1e-7],
  [0.0000001, [6, 1e-6], 0],
  [0.0000001, 7, 1e-7],
];

for (const testCase of testCases) {
  const input = testCase[0];
  test(input.toString(), () => {
    const paramInfo = testCase[1];
    const params = {};
    params.round09 = typeof paramInfo === 'number' ? paramInfo : paramInfo[0];
    params.roundToZero = typeof paramInfo === 'number' ? 0 : paramInfo[1];
    const roundingInfo = getRoundingInfo(params);
    const result = round09(input, roundingInfo);
    expect(result).toBe(testCase[2]);
  });
}
