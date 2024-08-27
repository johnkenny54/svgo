import { generateData } from './testutils.js';

/**
 * @param {Set} s
 * @param {import('../../lib/docdata.js').CSSFeatures[]} a
 */
function setsAreIdentical(s, a) {
  if (s.size !== a.length) {
    return false;
  }
  return a.every((str) => s.has(str));
}

/**
 * @param {string} fileSuffix
 * @param {import('../../lib/docdata.js').CSSFeatures[]} expected
 */
function checkFile(fileSuffix, expected) {
  const data = generateData(
    `./test/lib/docdata/style.getfeatures.${fileSuffix}.svg`,
  );
  const features = data.docData.styles.getFeatures();
  console.log(features);
  return setsAreIdentical(features, expected);
}

test('getFeatures', () => {
  expect(checkFile('1', ['simple-selectors'])).toBe(true);
  expect(
    checkFile('2', ['atrules', 'combinators', 'pseudos', 'simple-selectors']),
  ).toBe(true);
});
