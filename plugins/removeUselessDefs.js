import { detachNodeFromParent } from '../lib/xast.js';
import { elemsGroups } from './_collections.js';

/**
 * @typedef {import('../lib/types.js').XastElement} XastElement
 */

export const name = 'removeUselessDefs';
export const description = 'removes elements in <defs> without id';

/**
 * Removes content of defs and properties that aren't rendered directly without ids.
 *
 * @author Lev Solntsev
 *
 * @type {import('./plugins-types.js').Plugin<'removeUselessDefs'>}
 */
export const fn = () => {
  return {
    element: {
      enter: (node, parentNode) => {
        if (
          node.name === 'defs' ||
          (elemsGroups.nonRendering.has(node.name) &&
            node.attributes.id == null)
        ) {
          /**
           * @type {XastElement[]}
           */
          const usefulNodes = [];
          collectUsefulNodes(node, usefulNodes);
          if (usefulNodes.length === 0) {
            detachNodeFromParent(node, parentNode);
          }
          // TODO remove legacy parentNode in v4
          for (const usefulNode of usefulNodes) {
            Object.defineProperty(usefulNode, 'parentNode', {
              writable: true,
              value: node,
            });
          }
          node.children = usefulNodes;
        }
      },
    },
  };
};

/**
 * @type {(node: XastElement, usefulNodes: XastElement[]) => void}
 */
const collectUsefulNodes = (node, usefulNodes) => {
  /**
   * Determine whether the node or any of its children is useful.
   * @param {XastElement} node
   * @returns boolean
   */
  function isUseful(node) {
    if (node.attributes.id != null || node.name === 'style') {
      return true;
    }
    for (const child of node.children) {
      if (child.type === 'element' && isUseful(child)) {
        return true;
      }
    }
    return false;
  }

  for (const child of node.children) {
    if (child.type === 'element') {
      if (isUseful(child)) {
        usefulNodes.push(child);
      }
    }
  }
};
