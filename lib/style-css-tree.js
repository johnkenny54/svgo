import * as csstree from 'css-tree';
import { syntax } from 'csso';
import {
  CSSRule,
  CSSRuleSet,
  CSSSelector,
  CSSSelectorSequence,
} from './docdata.js';

class CSSParseError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
  }
}

/**
 * @typedef {import('./docdata.js').CSSFeatures} CSSFeatures
 */

/**
 * @type {(ruleNode: csstree.Rule,isInMediaQuery:boolean) => CSSRule}
 */
const parseRule = (ruleNode, isInMediaQuery) => {
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
    isInMediaQuery,
  );
};

/**
 * @param {csstree.Selector} node
 */
function createCSSSelector(node) {
  /**
   * @param {csstree.Selector} node
   */
  function cloneSelectorWithoutPseudos(node) {
    return {
      type: node.type,
      children: node.children.filter((n) => !isPseudo(n)).map(csstree.clone),
    };
  }

  /**
   * @param {csstree.CssNode} node
   */
  function isPseudo(node) {
    return (
      node.type === 'PseudoClassSelector' ||
      node.type === 'PseudoElementSelector'
    );
  }

  /**
   * @param {csstree.CssNode} node
   * @returns {import('./docdata.js').SimpleSelector}
   */
  function getSimpleSelector(node) {
    switch (node.type) {
      case 'ClassSelector':
      case 'IdSelector':
      case 'PseudoClassSelector':
      case 'PseudoElementSelector':
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
  /** @type {import('./docdata.js').SimpleSelector[]} */
  let simpleSelectors = [];
  let hasPseudos = false;
  for (const child of node.children) {
    if (child.type === 'Combinator') {
      selectorSequence.push(
        new CSSSelectorSequence(combinator, simpleSelectors),
      );
      combinator = child.name;
      simpleSelectors = [];
    } else {
      if (isPseudo(child)) {
        hasPseudos = true;
      }
      simpleSelectors.push(getSimpleSelector(child));
    }
  }
  selectorSequence.push(new CSSSelectorSequence(combinator, simpleSelectors));

  const strWithoutPseudos = hasPseudos
    ? csstree.generate(cloneSelectorWithoutPseudos(node))
    : undefined;
  return new CSSSelector(
    selectorSequence,
    csstree.generate(node),
    strWithoutPseudos,
  );
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
 * @type {(css: string,media:string|undefined) => CSSRuleSet[]}
 */
export const parseStylesheet = (css, media) => {
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

  if (media !== undefined) {
    media = media.trim();
    if (media === '' || media === 'all') {
      media = undefined;
    } else {
      media = 'media ' + media;
    }
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
    switch (cssNode.type) {
      case 'Rule':
        rules.push(parseRule(cssNode, false));
        return csstree.walk.skip;
      case 'Atrule': {
        switch (cssNode.name) {
          case 'media': {
            if (media) {
              throw new CSSParseError(
                `at rule found within media="${media}" style`,
              );
            }
            rules = addRuleSet(rules, media);

            const name = cssNode.name;
            const data = cssNode.prelude
              ? ' ' + csstree.generate(cssNode.prelude)
              : '';
            const atRule =
              name === 'media' && (data === ' all' || data === '')
                ? undefined
                : `${name}${data}`;

            csstree.walk(cssNode, (ruleNode) => {
              if (ruleNode.type === 'Rule') {
                rules.push(parseRule(ruleNode, atRule !== undefined));
                return csstree.walk.skip;
              }
            });
            rules = addRuleSet(rules, atRule);
            return csstree.walk.skip;
          }
          default:
            throw new CSSParseError(`unsupported style rule: @${cssNode.name}`);
        }
      }
      case 'StyleSheet':
        break;
      default:
        throw new CSSParseError(`unrecognized node type: ${cssNode.type}`);
    }
  });

  addRuleSet(rules, media);

  return ruleSets;
};
