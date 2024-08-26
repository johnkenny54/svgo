import fs from 'node:fs';
import { parseSvg } from './parser.js';
import { getDocData } from './docdata.js';

/**
 * @param {string} fileName
 */
function generateData(fileName) {
  const input = fs.readFileSync(fileName, 'utf8');
  const parsed = parseSvg(input);
  return getDocData(parsed);
}

test('hasAttributeSelector', () => {
  const docData = generateData('./test/lib/docdata/style.attselector.1.svg');
  expect(docData.styles.hasAtRules()).toBe(false);
  expect(docData.styles.hasAttributeSelector()).toBe(true);
  expect(docData.styles.hasAttributeSelector('d')).toBe(true);
  expect(docData.styles.hasAttributeSelector('x')).toBe(false);
});
test('hasAttributeSelector with media query', () => {
  const docData = generateData('./test/lib/docdata/style.attselector.2.svg');
  expect(docData.styles.hasAtRules()).toBe(true);
  expect(docData.styles.hasAttributeSelector()).toBe(true);
  expect(docData.styles.hasAttributeSelector('d')).toBe(true);
  expect(docData.styles.hasAttributeSelector('x')).toBe(false);
});
