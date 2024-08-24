import { parseStylesheet } from './style-css-tree.js';
import { visit } from './xast.js';

/**
 * @typedef {import('../lib/types.js').XastElement} XastElement
 * @typedef {import('../lib/types.js').XastParent} XastParent
 * @typedef {import('../lib/types.js').XastRoot} XastRoot
 */

/**
 * @typedef {import('./styletypes.js').StylesheetRule} StylesheetRule
 */

/**
 * @typedef {{rules:StylesheetRule[],hasAttributeSelector:function (string=):boolean}} StyleData
 * @typedef {{styles:StyleData}} DocData
 */

/**
 * @param {StylesheetRule[]} rules
 * @returns {StyleData}
 */
function getStyleData(rules) {
  return {
    rules: rules,
    /**
     * @param {string} [attName]
     */
    hasAttributeSelector: (attName) => {
      for (const rule of rules) {
        if (rule.selectorObj.hasAttributeSelector(attName)) {
          return true;
        }
      }
      return false;
    },
  };
}

/**
 * @param {XastRoot} root
 * @returns {DocData}
 */
export const getDocData = (root) => {
  /** @type {StylesheetRule[]} */
  const rules = [];
  /** @type {Map<XastElement, XastParent>} */
  const parents = new Map();

  visit(root, {
    element: {
      enter: (node, parentNode) => {
        parents.set(node, parentNode);

        if (node.name !== 'style') {
          return;
        }

        if (
          node.attributes.type == null ||
          node.attributes.type === '' ||
          node.attributes.type === 'text/css'
        ) {
          const dynamic =
            node.attributes.media != null && node.attributes.media !== 'all';

          for (const child of node.children) {
            if (child.type === 'text' || child.type === 'cdata') {
              rules.push(...parseStylesheet(child.value, dynamic));
            }
          }
        }
      },
    },
  });

  return {
    styles: getStyleData(rules),
  };
};
