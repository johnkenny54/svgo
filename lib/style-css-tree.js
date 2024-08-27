import * as csstree from 'css-tree';
import { syntax } from 'csso';

/**
 * @typedef{{type:'AttributeSelector',name:string,matcher:string|null,value:string|null}} AttributeSelector
 * @typedef{{type:'ClassSelector',name:string}} ClassSelector
 * @typedef{{type:'IdSelector',name:string}} IdSelector
 * @typedef{{type:'TypeSelector',name:string}} TypeSelector
 * @typedef{AttributeSelector|IdSelector|ClassSelector|TypeSelector} SimpleSelector
 */

export class CSSRuleSet {
  #atRule;
  #rules;

  /**
   * @param {CSSRule[]} rules
   * @param {string|undefined} atRule
   */
  constructor(rules, atRule) {
    this.#atRule = atRule;
    this.#rules = rules;
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

class CSSComplexSelector {
  // #comparator;
  #compoundSelectors;
  /**
   * @param {string|undefined} comparator
   * @param {SimpleSelector[]} compoundSelectors
   */
  constructor(comparator, compoundSelectors) {
    // this.#comparator = comparator;
    this.#compoundSelectors = compoundSelectors;
  }

  /**
   * @param {string} [attName]
   */
  hasAttributeSelector(attName) {
    for (const selector of this.#compoundSelectors) {
      if (selector.type === 'AttributeSelector') {
        return attName === undefined ? true : selector.name === attName;
      }
    }
    return false;
  }
}

class CSSSelector {
  #complexSelectors;
  #str;

  /**
   * @param {CSSComplexSelector[]} complexSelectors
   * @param {string} str
   */
  constructor(complexSelectors, str) {
    this.#complexSelectors = complexSelectors;
    this.#str = str;
  }

  getString() {
    return this.#str;
  }

  /**
   * @param {string} [attName]
   */
  hasAttributeSelector(attName) {
    return this.#complexSelectors.some((s) => s.hasAttributeSelector(attName));
  }
}

/**
 * @type {(ruleNode: csstree.Rule) => CSSRule}
 */
const parseRule = (ruleNode) => {
  let selectorNode;
  /** @type {Map<string,{value:string,important:boolean|undefined}} */
  const declarations = new Map();
  csstree.walk(ruleNode, (node) => {
    if (node.type === 'Declaration') {
      console.log(node.important);
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

  /** @type {CSSComplexSelector[]} */
  const complexSelectors = [];
  let combinator;
  /** @type {SimpleSelector[]} */
  let compoundSelector = [];
  for (const child of node.children) {
    if (child.type === 'Combinator') {
      complexSelectors.push(
        new CSSComplexSelector(combinator, compoundSelector),
      );
      combinator = child.name;
      compoundSelector = [];
    } else {
      compoundSelector.push(getSimpleSelector(child));
    }
  }
  complexSelectors.push(new CSSComplexSelector(combinator, compoundSelector));

  return new CSSSelector(complexSelectors, csstree.generate(node));
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
