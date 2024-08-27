import { generateData } from './testutils.js';

test('import', () => {
  const data = generateData('./test/lib/docdata/style.import.1.svg');
  expect(data.docData.styles).toBeUndefined();
});
