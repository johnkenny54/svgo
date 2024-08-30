import { generateData } from './testutils.js';

test('import', () => {
  const data = generateData('./test/lib/docdata/style.import.1.svg');
  expect(data.docData.getStyles()).toBeNull();
});
test('invalid type', () => {
  const data = generateData('./test/lib/docdata/style.invalidtype.1.svg');
  expect(data.docData.getStyles()).toBeNull();
});
test('invalid attribute', () => {
  const data = generateData('./test/lib/docdata/style.invalidatt.1.svg');
  expect(data.docData.getStyles()).toBeNull();
});
