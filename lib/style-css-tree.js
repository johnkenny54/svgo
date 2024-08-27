import * as csstree from 'css-tree';
import { syntax } from 'csso';

/**
 * @typedef {import('./docdata.js').CSSFeatures} CSSFeatures
 */

/**
 * @typedef{{type:'AttributeSelector',name:string,matcher:string|null,value:string|null}} AttributeSelector
 * @typedef{{type:'ClassSelector',name:string}} ClassSelector
 * @typedef{{type:'IdSelector',name:string}} IdSelector
 * @typedef{{type:'PseudoClassSelector',name:string}} PseudoClassSelector
 * @typedef{{type:'TypeSelector',name:string}} TypeSelector
 * @typedef{AttributeSelector|ClassSelector|IdSelector|PseudoClassSelector|TypeSelector} SimpleSelector
 */

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

  /**
   * @param {CSSSelector} selector
   * @param {[number,number,number]} specificity
   * @param {Map<string,{value:string,important:boolean|undefined}>} declarations
   */
  constructor(selector, specificity, declarations) {
    this.#selector = selector;
    this.#specificity = specificity;
    this.#declarations = declarations;
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

  getSelectorString() {
    return this.#selector.getString();
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
}

class CSSSelectorSequence {
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
        case 'PseudoClassSelector':
          features.add('pseudos');
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

class CSSSelector {
  #selectorSequences;
  #str;

  /**
   * @param {CSSSelectorSequence[]} selectorSequences
   * @param {string} str
   */
  constructor(selectorSequences, str) {
    this.#selectorSequences = selectorSequences;
    this.#str = str;
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

  getString() {
    return this.#str;
  }

  /**
   * @param {string} [attName]
   */
  hasAttributeSelector(attName) {
    return this.#selectorSequences.some((s) => s.hasAttributeSelector(attName));
  }
}

/**
 * @type {(ruleNode: csstree.Rule) => CSSRule}
 */
const parseRule = (ruleNode) => {
  let selectorNode;
  /** @type {Map<string,{value:string,important:boolean|undefined}>} */
  const declarations = new Map();
  csstree.walk(ruleNode, (node) => {
    if (node.type === 'Declaration') {
      declarations.set(node.property, {
        value: csstree.generate(node.value),
        important: node.important === true,
      });
    } else if (node.type === 'Selector') {
      selectorNode = node;
    }
  });

  if (selectorNode === undefined) {
    throw new Error();
  }
  return new CSSRule(
    createCSSSelector(selectorNode),
    syntax.specificity(selectorNode),
    declarations,
  );
};

/**
 * @param {csstree.Selector} node
 */
function createCSSSelector(node) {
  /**
   * @param {csstree.CssNode} node
   * @returns {SimpleSelector}
   */
  function getSimpleSelector(node) {
    switch (node.type) {
      case 'ClassSelector':
      case 'IdSelector':
      case 'PseudoClassSelector':
      case 'TypeSelector':
        return { type: node.type, name: node.name };
      case 'AttributeSelector':
        switch (node.name.type) {
          case 'Identifier':
            return {
              type: 'AttributeSelector',
              name: node.name.name,
              matcher: node.matcher,
              value:
                node.value === null
                  ? null
                  : node.value.type === 'Identifier'
                    ? node.value.name
                    : node.value.value,
            };
        }
    }
    throw new Error(JSON.stringify(node));
  }

  /** @type {CSSSelectorSequence[]} */
  const selectorSequence = [];
  let combinator;
  /** @type {SimpleSelector[]} */
  let simpleSelectors = [];
  for (const child of node.children) {
    if (child.type === 'Combinator') {
      selectorSequence.push(
        new CSSSelectorSequence(combinator, simpleSelectors),
      );
      combinator = child.name;
      simpleSelectors = [];
    } else {
      simpleSelectors.push(getSimpleSelector(child));
    }
  }
  selectorSequence.push(new CSSSelectorSequence(combinator, simpleSelectors));

  return new CSSSelector(selectorSequence, csstree.generate(node));
}

/**
 * @param {string} css
 */
export function parseStyleDeclarations(css) {
  const declarations = new Map();
  const ast = csstree.parse(css, {
    context: 'declarationList',
    parseValue: false,
  });
  csstree.walk(ast, (cssNode) => {
    if (cssNode.type === 'Declaration') {
      declarations.set(cssNode.property, csstree.generate(cssNode.value));
    }
  });
  return declarations;
}

/**
 * @type {(css: string) => CSSRuleSet[]}
 */
export const parseStylesheet = (css) => {
  /**
   * @param {CSSRule[]} rules
   * @param {string} [atRule]
   */
  function addRuleSet(rules, atRule) {
    if (rules.length === 0) {
      return rules;
    }
    ruleSets.push(new CSSRuleSet(rules, atRule));
    return [];
  }

  /** @type {CSSRuleSet[]} */
  const ruleSets = [];

  /** @type {CSSRule[]} */
  let rules = [];

  const ast = csstree.parse(css, {
    parseValue: false,
    parseAtrulePrelude: false,
  });
  csstree.walk(ast, (cssNode) => {
    if (cssNode.type === 'Rule') {
      rules.push(parseRule(cssNode));
      return csstree.walk.skip;
    } else if (cssNode.type === 'Atrule') {
      rules = addRuleSet(rules);
      csstree.walk(cssNode, (ruleNode) => {
        if (ruleNode.type === 'Rule') {
          rules.push(parseRule(ruleNode));
          return csstree.walk.skip;
        }
      });
      const atRule = `@${cssNode.name} ${cssNode.prelude ? csstree.generate(cssNode.prelude) : ''}`;
      rules = addRuleSet(rules, atRule);
      return csstree.walk.skip;
    }
  });

  addRuleSet(rules);

  return ruleSets;
};
