import fs from 'node:fs';
import { parseSvg } from './parser.js';
import { getDocData } from './docdata.js';

const input = fs.readFileSync(
  './test/lib/docdata/style.attselector.1.svg',
  'utf8',
);

test('hasAttributeSelector', () => {
  const parsed = parseSvg(input);
  const docData = getDocData(parsed);
  expect(docData.styles.hasAttributeSelector()).toBe(true);
  expect(docData.styles.hasAttributeSelector('d')).toBe(true);
  expect(docData.styles.hasAttributeSelector('x')).toBe(false);
});
