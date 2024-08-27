import { visit } from '../../lib/xast.js';
import { generateData } from './testutils.js';

/**
 * @param {import('../../lib/types.js').XastRoot} root
 */
function generateTreeData(root) {
  const data = new Map();
  visit(root, {
    element: {
      enter: (node) => {
        if (node.attributes.id) {
          data.set(node.attributes.id, node);
        }
      },
    },
  });

  return data;
}

/**
 * @param {{docData:{styles:import('../../lib/docdata.js').StyleData}}} data
 * @param {Map<string,import('../../lib/types.js').XastElement>} treeInfo
 * @param {string} id
 * @param {string} styleName
 */
function getComputed(data, treeInfo, id, styleName) {
  const node = treeInfo.get(id);
  if (node === undefined) {
    throw new Error();
  }
  return data.docData.styles.computeOwnStyle(node).get(styleName);
}

test('computeOwnStyle', () => {
  const data = generateData('./test/lib/docdata/style.computeownstyle.1.svg');
  const treeInfo = generateTreeData(data.root);

  expect(getComputed(data, treeInfo, 'stroke-att', 'stroke')).toBe('green');
  expect(getComputed(data, treeInfo, 'stroke-att', 'stroke-width')).toBe(
    undefined,
  );

  expect(getComputed(data, treeInfo, 'stroke-style-att', 'stroke')).toBe('red');
  expect(getComputed(data, treeInfo, 'stroke-class', 'stroke')).toBe('blue');
  expect(getComputed(data, treeInfo, 'stroke-class-with-id', 'stroke')).toBe(
    'yellow',
  );
  expect(getComputed(data, treeInfo, 'stroke-style-class-imp', 'stroke')).toBe(
    'orange',
  );
  expect(
    getComputed(data, treeInfo, 'stroke-style-class-imp-specific', 'stroke'),
  ).toBe('pink');
});
