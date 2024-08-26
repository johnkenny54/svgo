import * as csstree from 'css-tree';

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
    console.log(`${atRule} - ${rules}`);
    this.#atRule = atRule;
    this.#rules = rules;
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

class CSSRule {
  #selector;

  /**
   * @param {CSSSelector} selector
   */
  constructor(selector) {
    this.#selector = selector;
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
  /**
   * @param {CSSComplexSelector[]} complexSelectors
   */
  constructor(complexSelectors) {
    this.#complexSelectors = complexSelectors;
  }

  /**
   * @param {string} [attName]
   */
  hasAttributeSelector(attName) {
    return this.#complexSelectors.some((s) => s.hasAttributeSelector(attName));
  }
}

/**
 * @type {(ruleNode: csstree.Rule) => CSSRule[]}
 */
const parseRule = (ruleNode) => {
  /** @type {CSSRule[]} */
  const rules = [];
  csstree.walk(ruleNode.prelude, (node) => {
    if (node.type === 'Selector') {
      rules.push(new CSSRule(createCSSSelector(node)));
    }
  });

  return rules;
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

  return new CSSSelector(complexSelectors);
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
      rules.push(...parseRule(cssNode));
      return csstree.walk.skip;
    } else if (cssNode.type === 'Atrule') {
      rules = addRuleSet(rules);
      csstree.walk(cssNode, (ruleNode) => {
        if (ruleNode.type === 'Rule') {
          rules.push(...parseRule(ruleNode));
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
