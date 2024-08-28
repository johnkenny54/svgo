import { visit } from '../../lib/xast.js';
import { generateData } from './testutils.js';

/**
 * @typedef {import('../../lib/types.js').XastElement} XastElement
 */

/**
 * @param {import('../../lib/types.js').XastRoot} root
 */
function generateTreeData(root) {
  const idMap = new Map();
  const parentMap = new Map();
  /** @type {{element:XastElement}[]} */
  const parents = [];
  visit(root, {
    element: {
      enter: (node) => {
        parentMap.set(node, parents.slice());
        if (node.attributes.id) {
          idMap.set(node.attributes.id, node);
        }
        parents.push({ element: node });
      },
      exit: () => {
        parents.pop();
      },
    },
  });

  return { ids: idMap, parents: parentMap };
}

/**
 * @param {import('../../lib/docdata.js').StyleData} styleData
 * @param {{ids:Map<string,import('../../lib/types.js').XastElement>,
 * parents:Map<XastElement,{element:XastElement}[]>}} treeInfo
 * @param {string} id
 * @param {string} styleName
 */
function getComputed(styleData, treeInfo, id, styleName) {
  const node = treeInfo.ids.get(id);
  if (node === undefined) {
    throw new Error();
  }
  const parents = treeInfo.parents.get(node);
  if (parents === undefined) {
    throw new Error();
  }
  return styleData.computeStyle(node, parents).get(styleName);
}

test('computeStyle 1', () => {
  const data = generateData('./test/lib/docdata/style.computestyle.1.svg');
  const treeInfo = generateTreeData(data.root);
  const styleData = data.docData.styles;

  expect(styleData).toBeDefined();
  if (styleData === null) {
    return;
  }

  expect(getComputed(styleData, treeInfo, 'gblue', 'stroke')).toBe('blue');
  expect(getComputed(styleData, treeInfo, 'gred-g', 'stroke')).toBe('red');
  expect(getComputed(styleData, treeInfo, 'gred-gblue', 'stroke')).toBe('blue');
  expect(getComputed(styleData, treeInfo, 'gredimp-gblue', 'stroke')).toBe(
    'blue',
  );
});

test('computeStyle 2', () => {
  const data = generateData('./test/lib/docdata/style.computestyle.2.svg');
  const treeInfo = generateTreeData(data.root);
  const styleData = data.docData.styles;

  expect(styleData).toBeDefined();
  if (styleData === null) {
    return;
  }

  expect(getComputed(styleData, treeInfo, 'path1', 'stroke')).toBe('blue');
  expect(getComputed(styleData, treeInfo, 'path1', 'marker-end')).toBe(null);
});

test('computeStyle - uninherited properties', () => {
  const data = generateData('./test/lib/docdata/style.computestyle.3.svg');
  const treeInfo = generateTreeData(data.root);
  const styleData = data.docData.styles;

  expect(styleData).toBeDefined();
  if (styleData === null) {
    return;
  }

  expect(getComputed(styleData, treeInfo, 'path1', 'stroke')).toBe('blue');
  expect(getComputed(styleData, treeInfo, 'path1', 'opacity')).toBeUndefined();
});

test('computeStyle - selector lists', () => {
  const data = generateData('./test/lib/docdata/style.computestyle.4.svg');
  const treeInfo = generateTreeData(data.root);
  const styleData = data.docData.styles;

  expect(styleData).toBeDefined();
  if (styleData === null) {
    return;
  }

  expect(getComputed(styleData, treeInfo, 'path1', 'stroke')).toBe('blue');
  expect(getComputed(styleData, treeInfo, 'path2', 'stroke')).toBe('red');
});

test('computeStyle - custom properties', () => {
  const data = generateData('./test/lib/docdata/style.computestyle.5.svg');
  const treeInfo = generateTreeData(data.root);
  const styleData = data.docData.styles;

  expect(styleData).toBeDefined();
  if (styleData === null) {
    return;
  }

  expect(getComputed(styleData, treeInfo, 'path1', 'stroke')).toBeNull();
});

test('computeStyle - pseudo-class', () => {
  const data = generateData('./test/lib/docdata/style.computestyle.6.svg');
  const treeInfo = generateTreeData(data.root);
  const styleData = data.docData.styles;

  expect(styleData).toBeDefined();
  if (styleData === null) {
    return;
  }

  expect(getComputed(styleData, treeInfo, 'path1', 'stroke')).toBeNull();
  expect(getComputed(styleData, treeInfo, 'path2', 'stroke')).toBe('green');
});