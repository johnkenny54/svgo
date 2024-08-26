import { attrsGroups } from '../plugins/_collections.js';
import { parseStyleDeclarations, parseStylesheet } from './style-css-tree.js';
import { visit } from './xast.js';

/**
 * @typedef {import('../lib/types.js').XastElement} XastElement
 * @typedef {import('../lib/types.js').XastParent} XastParent
 * @typedef {import('../lib/types.js').XastRoot} XastRoot
 */

/**
 * @typedef {import('./style-css-tree.js').CSSRuleSet} CSSRuleSet
 */

export class StyleData {
  #ruleSets;
  /**
   * @param {CSSRuleSet[]} ruleSets
   */
  constructor(ruleSets) {
    this.#ruleSets = ruleSets;
  }

  /**
   * @param {XastElement} node
   */
  computeOwnStyle(node) {
    const computedStyles = new Map();
    // collect attributes
    for (const [name, value] of Object.entries(node.attributes)) {
      if (attrsGroups.presentation.has(name)) {
        computedStyles.set(name, value);
      }
    }

    parseStyleDeclarations(node.attributes.style).forEach((value, name) => {
      computedStyles.set(name, value);
    });

    return computedStyles;
  }

  hasAtRules() {
    return this.#ruleSets.some((rs) => rs.hasAttRule());
  }

  /**
   * @param {string} [attName]
   */
  hasAttributeSelector(attName) {
    for (const ruleSet of this.#ruleSets) {
      if (ruleSet.hasAttributeSelector(attName)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * @param {XastRoot} root
 */
export const getDocData = (root) => {
  /** @type {CSSRuleSet[]} */
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
          for (const child of node.children) {
            if (child.type === 'text' || child.type === 'cdata') {
              rules.push(...parseStylesheet(child.value));
            }
          }
        }
      },
    },
  });

  return {
    styles: new StyleData(rules),
  };
};