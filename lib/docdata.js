import { attrsGroups, inheritableAttrs } from '../plugins/_collections.js';
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
   * @returns {Map<string,string|null>}
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
        const isDynamic = rule.isInMediaQuery();
        rule.getDeclarations().forEach((value, name) => {
          if (isDynamic) {
            computedStyles.set(name, null);
          } else {
            computedStyles.set(name, value.value);
            if (value.important) {
              importantProperties.add(name);
            }
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
   * @param {XastElement} node
   * @param {{element:XastElement,styles?:Map<string,string|null>}[]} parents
   * @returns {Map<string,string|null>}
   */
  computeStyle(node, parents) {
    /**
     * @param {StyleData} styleData
     * @param {number} index
     */
    function getParentStyles(styleData, index) {
      const parent = parents[index];
      if (!parent.styles) {
        parent.styles = styleData.computeOwnStyle(parent.element);
        if (index > 0) {
          mergeMissingProperties(
            parent.styles,
            getParentStyles(styleData, index - 1),
          );
        }
      }
      return parent.styles;
    }

    /**
     * @param {Map<string,string|null>} currentStyles
     * @param {Map<string,string|null>} parentStyles
     */
    function mergeMissingProperties(currentStyles, parentStyles) {
      parentStyles.forEach((value, name) => {
        if (inheritableAttrs.has(name) && !currentStyles.has(name)) {
          currentStyles.set(name, value);
        }
      });
    }

    const computedStyles = this.computeOwnStyle(node);

    // Fill in any missing properties from the parent.
    if (parents.length) {
      const parentStyles = getParentStyles(this, parents.length - 1);
      mergeMissingProperties(computedStyles, parentStyles);
    }

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
 * @returns {{hasScripts:boolean,styles:StyleData|null}}
 */
export const getDocData = (root) => {
  /** @type {CSSRuleSet[]} */
  const ruleSets = [];
  /** @type {Map<XastElement, XastParent>} */
  const parents = new Map();
  let styleError = false;
  let hasScripts = false;

  visit(root, {
    element: {
      enter: (node, parentNode) => {
        parents.set(node, parentNode);

        // Check all attributes for scripts.
        if (!hasScripts) {
          for (const attName of Object.keys(node.attributes)) {
            if (attName.startsWith('on')) {
              hasScripts = true;
            }
          }
          if (node.name === 'script') {
            hasScripts = true;
            return;
          }
        }

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
              try {
                ruleSets.push(...parseStylesheet(child.value));
              } catch (e) {
                console.error(e);
                styleError = true;
              }
            }
          }
        }
      },
    },
  });

  return {
    hasScripts: hasScripts,
    styles: styleError ? null : new StyleData(ruleSets),
  };
};
