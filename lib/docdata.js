import { attrsGroups } from '../plugins/_collections.js';
import { parseStyleDeclarations, parseStylesheet } from './style-css-tree.js';
import { matches, visit } from './xast.js';

/**
 * @typedef {import('../lib/types.js').XastElement} XastElement
 * @typedef {import('../lib/types.js').XastParent} XastParent
 * @typedef {import('../lib/types.js').XastRoot} XastRoot
 */

/**
 * @typedef {'atrules'|'attribute-selectors'|'combinators'|'pseudos'|'simple-selectors'} CSSFeatures
 * @typedef {import('./style-css-tree.js').CSSRule} CSSRule
 * @typedef {import('./style-css-tree.js').CSSRuleSet} CSSRuleSet
 */

export class StyleData {
  #ruleSets;
  #sortedRules;

  /**
   * @param {CSSRuleSet[]} ruleSets
   */
  constructor(ruleSets) {
    this.#ruleSets = ruleSets;
    this.#sortedRules = StyleData.#collectRules(ruleSets);
  }

  /**
   * @param {CSSRuleSet[]} ruleSets
   * @returns {CSSRule[]}
   */
  static #collectRules(ruleSets) {
    /**
     * Compares selector specificities.
     * Derived from https://github.com/keeganstreet/specificity/blob/8757133ddd2ed0163f120900047ff0f92760b536/specificity.js#L207
     *
     * @param {[number,number,number]} a
     * @param {[number,number,number]} b
     * @returns {number}
     */
    function compareSpecificity(a, b) {
      for (let i = 0; i < 4; i += 1) {
        if (a[i] < b[i]) {
          return -1;
        } else if (a[i] > b[i]) {
          return 1;
        }
      }

      return 0;
    }

    const rules = [];
    for (const ruleSet of ruleSets) {
      rules.push(...ruleSet.getRules());
    }

    rules.sort((a, b) =>
      compareSpecificity(a.getSpecificity(), b.getSpecificity()),
    );

    return rules;
  }

  /**
   * @param {XastElement} node
   */
  computeOwnStyle(node) {
    const computedStyles = new Map();

    // Collect attributes.
    for (const [name, value] of Object.entries(node.attributes)) {
      if (attrsGroups.presentation.has(name)) {
        computedStyles.set(name, value);
      }
    }

    // Override with style element rules.
    const importantProperties = new Set();
    for (const rule of this.#sortedRules) {
      if (matches(node, rule.getSelectorString())) {
        rule.getDeclarations().forEach((value, name) => {
          computedStyles.set(name, value.value);
          if (value.important) {
            importantProperties.add(name);
          }
        });
      }
    }

    // Override with inline styles.
    parseStyleDeclarations(node.attributes.style).forEach((value, name) => {
      if (!importantProperties.has(name)) {
        computedStyles.set(name, value);
      }
    });

    return computedStyles;
  }

  /**
   * @returns {Set<CSSFeatures>}
   */
  getFeatures() {
    return this.#ruleSets.reduce((features, rs) => {
      rs.getFeatures().forEach((f) => features.add(f));
      return features;
    }, new Set());
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
