import * as csstree from 'css-tree';
import * as csswhat from 'css-what';
import { syntax } from 'csso';
import { matches } from './xast.js';
import {
  attrsGroups,
  inheritableAttrs,
  presentationNonInheritableGroupAttrs,
} from '../plugins/_collections.js';

/**
 * @typedef {import('css-tree').Rule} CsstreeRule
 * @typedef {import('./styletypes.js').Specificity} Specificity
 * @typedef {import('./types.js').Stylesheet} Stylesheet
 * @typedef {import('./styletypes.js').StylesheetRule} StylesheetRule
 * @typedef {import('./styletypes.js').StylesheetDeclaration} StylesheetDeclaration
 * @typedef {import('./types.js').ComputedStyles} ComputedStyles
 * @typedef {import('./types.js').XastRoot} XastRoot
 * @typedef {import('./types.js').XastElement} XastElement
 * @typedef {import('./types.js').XastParent} XastParent
 * @typedef {import('./types.js').XastChild} XastChild
 */

const csstreeWalkSkip = csstree.walk.skip;

/**
 * @typedef{{type:'AttributeSelector',name:string,matcher:string|null,value:string|null}} AttributeSelector
 * @typedef{{type:'ClassSelector',name:string}} ClassSelector
 * @typedef{{type:'IdSelector',name:string}} IdSelector
 * @typedef{{type:'TypeSelector',name:string}} TypeSelector
 * @typedef{AttributeSelector|IdSelector|ClassSelector|TypeSelector} SimpleSelector
 */

class CSSComplexSelector {
  #comparator;
  #compoundSelectors;
  /**
   * @param {string|undefined} comparator
   * @param {SimpleSelector[]} compoundSelectors
   */
  constructor(comparator, compoundSelectors) {
    this.#comparator = comparator;
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
 * @type {(ruleNode: CsstreeRule, dynamic: boolean) => StylesheetRule[]}
 */
const parseRule = (ruleNode, dynamic) => {
  /**
   * @type {StylesheetDeclaration[]}
   */
  const declarations = [];
  // collect declarations
  ruleNode.block.children.forEach((cssNode) => {
    if (cssNode.type === 'Declaration') {
      declarations.push({
        name: cssNode.property,
        value: csstree.generate(cssNode.value),
        important: cssNode.important === true,
      });
    }
  });

  /** @type {StylesheetRule[]} */
  const rules = [];
  csstree.walk(ruleNode.prelude, (node) => {
    if (node.type === 'Selector') {
      const newNode = csstree.clone(node);
      let hasPseudoClasses = false;
      csstree.walk(newNode, (pseudoClassNode, item, list) => {
        if (pseudoClassNode.type === 'PseudoClassSelector') {
          hasPseudoClasses = true;
          list.remove(item);
        }
      });
      rules.push({
        specificity: syntax.specificity(node),
        dynamic: hasPseudoClasses || dynamic,
        // compute specificity from original node to consider pseudo classes
        selector: csstree.generate(newNode),
        selectorObj: createCSSSelector(node),
        declarations,
      });
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
 * @type {(css: string, dynamic: boolean) => StylesheetRule[]}
 */
export const parseStylesheet = (css, dynamic) => {
  /** @type {StylesheetRule[]} */
  const rules = [];
  const ast = csstree.parse(css, {
    parseValue: false,
    parseAtrulePrelude: false,
  });
  csstree.walk(ast, (cssNode) => {
    if (cssNode.type === 'Rule') {
      rules.push(...parseRule(cssNode, dynamic || false));
      return csstreeWalkSkip;
    }
    if (cssNode.type === 'Atrule') {
      if (
        [
          'keyframes',
          '-webkit-keyframes',
          '-o-keyframes',
          '-moz-keyframes',
        ].includes(cssNode.name)
      ) {
        return csstreeWalkSkip;
      }
      csstree.walk(cssNode, (ruleNode) => {
        if (ruleNode.type === 'Rule') {
          rules.push(...parseRule(ruleNode, dynamic || true));
          return csstreeWalkSkip;
        }
      });
      return csstreeWalkSkip;
    }
  });
  return rules;
};

/**
 * @type {(css: string) => StylesheetDeclaration[]}
 */
const parseStyleDeclarations = (css) => {
  /** @type {StylesheetDeclaration[]} */
  const declarations = [];
  const ast = csstree.parse(css, {
    context: 'declarationList',
    parseValue: false,
  });
  csstree.walk(ast, (cssNode) => {
    if (cssNode.type === 'Declaration') {
      declarations.push({
        name: cssNode.property,
        value: csstree.generate(cssNode.value),
        important: cssNode.important === true,
      });
    }
  });
  return declarations;
};

/**
 * @param {Stylesheet} stylesheet
 * @param {XastElement} node
 * @returns {ComputedStyles}
 */
const computeOwnStyle = (stylesheet, node) => {
  /** @type {ComputedStyles} */
  const computedStyle = {};
  const importantStyles = new Map();

  // collect attributes
  for (const [name, value] of Object.entries(node.attributes)) {
    if (attrsGroups.presentation.has(name)) {
      computedStyle[name] = { type: 'static', inherited: false, value };
      importantStyles.set(name, false);
    }
  }

  // collect matching rules
  for (const { selector, declarations, dynamic } of stylesheet.rules) {
    if (matches(node, selector)) {
      for (const { name, value, important } of declarations) {
        const computed = computedStyle[name];
        if (computed && computed.type === 'dynamic') {
          continue;
        }
        if (dynamic) {
          computedStyle[name] = { type: 'dynamic', inherited: false };
          continue;
        }
        if (
          computed == null ||
          important === true ||
          importantStyles.get(name) === false
        ) {
          computedStyle[name] = { type: 'static', inherited: false, value };
          importantStyles.set(name, important);
        }
      }
    }
  }

  // collect inline styles
  const styleDeclarations =
    node.attributes.style == null
      ? []
      : parseStyleDeclarations(node.attributes.style);
  for (const { name, value, important } of styleDeclarations) {
    const computed = computedStyle[name];
    if (computed && computed.type === 'dynamic') {
      continue;
    }
    if (
      computed == null ||
      important === true ||
      importantStyles.get(name) === false
    ) {
      computedStyle[name] = { type: 'static', inherited: false, value };
      importantStyles.set(name, important);
    }
  }

  return computedStyle;
};

/**
 * Compares selector specificities.
 * Derived from https://github.com/keeganstreet/specificity/blob/8757133ddd2ed0163f120900047ff0f92760b536/specificity.js#L207
 *
 * @param {Specificity} a
 * @param {Specificity} b
 * @returns {number}
 */
export const compareSpecificity = (a, b) => {
  for (let i = 0; i < 4; i += 1) {
    if (a[i] < b[i]) {
      return -1;
    } else if (a[i] > b[i]) {
      return 1;
    }
  }

  return 0;
};

/**
 * @param {Stylesheet} stylesheet
 * @param {XastElement} node
 * @returns {ComputedStyles}
 */
export const computeStyle = (stylesheet, node) => {
  const { parents } = stylesheet;
  const computedStyles = computeOwnStyle(stylesheet, node);
  let parent = parents.get(node);
  while (parent != null && parent.type !== 'root') {
    const inheritedStyles = computeOwnStyle(stylesheet, parent);
    for (const [name, computed] of Object.entries(inheritedStyles)) {
      if (
        computedStyles[name] == null &&
        inheritableAttrs.has(name) &&
        !presentationNonInheritableGroupAttrs.has(name)
      ) {
        computedStyles[name] = { ...computed, inherited: true };
      }
    }
    parent = parents.get(parent);
  }
  return computedStyles;
};

/**
 * Determines if the CSS selector includes or traverses the given attribute.
 *
 * Classes and IDs are generated as attribute selectors, so you can check for
 * if a `.class` or `#id` is included by passing `name=class` or `name=id`
 * respectively.
 *
 * @param {csstree.ListItem<csstree.CssNode>|string} selector
 * @param {string} name
 * @param {?string} value
 * @param {boolean} traversed
 * @returns {boolean}
 */
export const includesAttrSelector = (
  selector,
  name,
  value = null,
  traversed = false,
) => {
  const selectors =
    typeof selector === 'string'
      ? csswhat.parse(selector)
      : csswhat.parse(csstree.generate(selector.data));

  for (const subselector of selectors) {
    const hasAttrSelector = subselector.some((segment, index) => {
      if (traversed) {
        if (index === subselector.length - 1) {
          return false;
        }

        const isNextTraversal = csswhat.isTraversal(subselector[index + 1]);

        if (!isNextTraversal) {
          return false;
        }
      }

      if (segment.type !== 'attribute' || segment.name !== name) {
        return false;
      }

      return value == null ? true : segment.value === value;
    });

    if (hasAttrSelector) {
      return true;
    }
  }

  return false;
};
