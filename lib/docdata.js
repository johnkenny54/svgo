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
 * @typedef{{type:'AttributeSelector',name:string,matcher:string|null,value:string|null}} AttributeSelector
 * @typedef{{type:'ClassSelector',name:string}} ClassSelector
 * @typedef{{type:'IdSelector',name:string}} IdSelector
 * @typedef{{type:'PseudoClassSelector',name:string}} PseudoClassSelector
 * @typedef{{type:'PseudoElementSelector',name:string}} PseudoElementSelector
 * @typedef{{type:'TypeSelector',name:string}} TypeSelector
 * @typedef{AttributeSelector|ClassSelector|IdSelector|PseudoClassSelector|PseudoElementSelector|TypeSelector} SimpleSelector
 */

const VAR_REGEXP = /([^\w]var|^var)\(/;

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
      if (matches(node, rule.getSelectorStringWithoutPseudos())) {
        const isDynamic = rule.isInMediaQuery() || rule.hasPseudos();
        rule.getDeclarations().forEach((value, name) => {
          if (isDynamic) {
            computedStyles.set(name, null);
          } else {
            const hasVars = VAR_REGEXP.test(value.value);
            if (hasVars) {
              computedStyles.set(name, null);
            } else {
              computedStyles.set(name, value.value);
              if (value.important) {
                importantProperties.add(name);
              }
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

export class CSSRuleSet {
  #atRule;
  #rules;
  /** @type {Set<CSSFeatures>} */
  #features = new Set();

  /**
   * @param {CSSRule[]} rules
   * @param {string|undefined} atRule
   */
  constructor(rules, atRule) {
    this.#atRule = atRule;
    this.#rules = rules;

    if (atRule) {
      this.#features.add('atrules');
    }

    for (const rule of rules) {
      rule.getFeatures().forEach((f) => this.#features.add(f));
    }
  }

  /**
   * @returns {Set<import('./docdata.js').CSSFeatures>}
   */
  getFeatures() {
    return this.#features;
  }

  getRules() {
    return this.#rules;
  }

  hasAttRule() {
    return this.#atRule !== undefined;
  }

  /**
   * @param {string} [attName]
   */
  hasAttributeSelector(attName) {
    for (const rule of this.#rules) {
      if (rule.hasAttributeSelector(attName)) {
        return true;
      }
    }
    return false;
  }
}

export class CSSRule {
  #selector;
  #specificity;
  #declarations;
  #isInMediaQuery;

  /**
   * @param {CSSSelector} selector
   * @param {[number,number,number]} specificity
   * @param {Map<string,{value:string,important:boolean|undefined}>} declarations
   * @param {boolean} isInMediaQuery
   */
  constructor(selector, specificity, declarations, isInMediaQuery) {
    this.#selector = selector;
    this.#specificity = specificity;
    this.#declarations = declarations;
    this.#isInMediaQuery = isInMediaQuery;
  }

  getDeclarations() {
    return this.#declarations;
  }

  /**
   * @returns {Set<import('./docdata.js').CSSFeatures>}
   */
  getFeatures() {
    return this.#selector.getFeatures();
  }

  getSelectorStringWithoutPseudos() {
    return this.#selector.getStringWithoutPseudos();
  }

  getSpecificity() {
    return this.#specificity;
  }

  /**
   * @param {string} [attName]
   */
  hasAttributeSelector(attName) {
    return this.#selector.hasAttributeSelector(attName);
  }

  hasPseudos() {
    return this.#selector.hasPseudos();
  }

  isInMediaQuery() {
    return this.#isInMediaQuery;
  }
}

export class CSSSelector {
  #selectorSequences;
  #str;
  #strWithoutPseudos;

  /**
   * @param {CSSSelectorSequence[]} selectorSequences
   * @param {string} str
   * @param {string} [strWithoutPseudos]
   */
  constructor(selectorSequences, str, strWithoutPseudos) {
    this.#selectorSequences = selectorSequences;
    this.#str = str;
    this.#strWithoutPseudos = strWithoutPseudos;
  }

  /**
   * @returns {Set<CSSFeatures>}
   */
  getFeatures() {
    /** @type {Set<CSSFeatures>} */
    const features = new Set();
    features.add(
      this.#selectorSequences.length === 1 ? 'simple-selectors' : 'combinators',
    );
    for (const complexSelector of this.#selectorSequences) {
      complexSelector.addFeatures(features);
    }
    return features;
  }

  getStringWithoutPseudos() {
    return this.#strWithoutPseudos ? this.#strWithoutPseudos : this.#str;
  }

  /**
   * @param {string} [attName]
   */
  hasAttributeSelector(attName) {
    return this.#selectorSequences.some((s) => s.hasAttributeSelector(attName));
  }

  hasPseudos() {
    return this.#strWithoutPseudos !== undefined;
  }
}

export class CSSSelectorSequence {
  // #comparator;
  #simpleSelectors;

  /**
   * @param {string|undefined} comparator
   * @param {SimpleSelector[]} simpleSelectors
   */
  constructor(comparator, simpleSelectors) {
    // this.#comparator = comparator;
    this.#simpleSelectors = simpleSelectors;
  }

  /**
   * @param {Set<CSSFeatures>} features
   */
  addFeatures(features) {
    for (const selector of this.#simpleSelectors)
      switch (selector.type) {
        case 'AttributeSelector':
          features.add('attribute-selectors');
          break;
        case 'PseudoElementSelector':
          features.add('pseudos');
          break;
        case 'PseudoClassSelector':
          if (selector.name !== 'hover') {
            features.add('pseudos');
          }
          break;
      }
  }

  /**
   * @param {string} [attName]
   */
  hasAttributeSelector(attName) {
    for (const selector of this.#simpleSelectors) {
      if (selector.type === 'AttributeSelector') {
        return attName === undefined ? true : selector.name === attName;
      }
    }
    return false;
  }
}

class DocData {
  #styleData;
  #hasScripts;

  /**
   * @param {StyleData|null} styleData
   * @param {boolean} hasScripts
   */
  constructor(styleData, hasScripts) {
    this.#styleData = styleData;
    this.#hasScripts = hasScripts;
  }

  getStyles() {
    return this.#styleData;
  }

  hasScripts() {
    return this.#hasScripts;
  }
}

/**
 * @param {XastRoot} root
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

        let media;
        for (const [name, value] of Object.entries(node.attributes)) {
          let valid = false;
          switch (name) {
            case 'media':
              media = value;
              valid = true;
              break;
            case 'type':
              valid = value === '' || value === 'text/css';
              break;
          }
          if (!valid) {
            console.warn(
              `unknown attribute in style element: ${name}=${value}`,
            );
            styleError = true;
          }
        }

        for (const child of node.children) {
          if (child.type === 'text' || child.type === 'cdata') {
            try {
              ruleSets.push(...parseStylesheet(child.value, media));
            } catch (e) {
              console.error(e);
              styleError = true;
            }
          }
        }
      },
    },
  });

  return new DocData(styleError ? null : new StyleData(ruleSets), hasScripts);
};
