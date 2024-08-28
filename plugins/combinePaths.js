import { getDocData } from '../lib/docdata.js';
import { includesUrlReference } from '../lib/svgo/tools.js';
import { intersects, js2path, path2js } from './_path.js';

export const name = 'combinePaths';
export const description = 'combines multiple consecutive paths';

/**
 * @typedef {import('../lib/types.js').PathDataItem} PathDataItem
 * @typedef {import('../lib/types.js').XastChild} XastChild
 * @typedef {import('../lib/types.js').XastElement} XastElement
 * @typedef {{pathEl:XastElement,
 *  pathData?:PathDataItem[],
 *  merged?:true
 * }} PathElementInfo
 */

/** @type {Set<import('../lib/docdata.js').CSSFeatures>} */
const allowedStyleFeatures = new Set([
  'atrules',
  'attribute-selectors',
  'simple-selectors',
]);

/**
 * @param {XastChild} node
 */
function makePathElInfo(node) {
  return node.type === 'element' && node.name === 'path'
    ? { pathEl: node }
    : undefined;
}

/**
 * @param {Set<import('../lib/docdata.js').CSSFeatures>} features
 */
function supportsAllFeatures(features) {
  for (const feature of features) {
    if (!allowedStyleFeatures.has(feature)) {
      return false;
    }
  }
  return true;
}

/**
 * @type {import('./plugins-types.js').Plugin<'combinePaths'>}
 */
export const fn = (root) => {
  const docData = getDocData(root);
  const styleData = docData.styles;
  const enabled =
    !docData.hasScripts &&
    styleData !== null &&
    supportsAllFeatures(styleData.getFeatures()) &&
    !styleData.hasAttributeSelector('d');
  if (!enabled) {
    return;
  }

  /** @type {{element:XastElement}[]} */
  const parents = [];
  return {
    element: {
      enter: (node) => {
        parents.push({ element: node });

        if (node.children.length === 0) {
          return;
        }

        let currentPath;
        const mergedNodes = new Set();

        for (const child of node.children) {
          if (currentPath === undefined) {
            currentPath = canBeFirstPath(
              makePathElInfo(child),
              styleData,
              parents,
            );
            continue;
          }
          const childPathInfo = makePathElInfo(child);
          const mergeablePathInfo = isMergeable(currentPath, childPathInfo);
          if (mergeablePathInfo !== undefined) {
            mergePaths(currentPath, mergeablePathInfo);
            mergedNodes.add(child);
          } else {
            writePathData(currentPath);
            currentPath = canBeFirstPath(childPathInfo, styleData, parents);
          }
        }

        if (currentPath) {
          writePathData(currentPath);
        }

        if (mergedNodes.size) {
          node.children = node.children.filter(
            (child) => !mergedNodes.has(child),
          );
        }
      },
      exit: () => parents.pop(),
    },
  };
};

/**
 * @param {Map<string,string|null>} styles
 */
function allStylesAreMergeable(styles) {
  /**
   *
   * @param {string|null} value
   */
  function isPaintMergeable(value) {
    return value !== null && !includesUrlReference(value);
  }

  for (const [name, value] of styles.entries()) {
    switch (name) {
      case 'marker-end':
      case 'marker-mid':
      case 'marker-start':
        if (value === 'none') {
          continue;
        }
        break;
      case 'fill':
      case 'stroke':
        if (isPaintMergeable(value)) {
          continue;
        }
        break;
      case 'stroke-width':
      case 'transform':
        continue;
    }

    return false;
  }
  return true;
}

/**
 * @param {PathElementInfo|undefined} pathElInfo
 * @param {import('../lib/docdata.js').StyleData} styleData
 * @param {{element:XastElement}[]} parents
 * @returns {PathElementInfo|undefined}
 */
function canBeFirstPath(pathElInfo, styleData, parents) {
  if (pathElInfo === undefined) {
    return undefined;
  }

  const pathEl = pathElInfo.pathEl;
  if (pathEl.children.length > 0) {
    return;
  }
  if (pathEl.attributes['pathLength']) {
    return;
  }

  const styles = styleData.computeStyle(pathEl, parents);
  if (!allStylesAreMergeable(styles)) {
    return;
  }

  return pathElInfo;
}

/**
 * @param {PathElementInfo} pathElInfo
 */
function getPathData(pathElInfo) {
  if (!pathElInfo.pathData) {
    pathElInfo.pathData = path2js(pathElInfo.pathEl);
  }
  return pathElInfo.pathData;
}

/**
 * @param {PathElementInfo} currentPathInfo
 * @param {PathElementInfo|undefined} sibling
 */
function isMergeable(currentPathInfo, sibling) {
  if (sibling === undefined) {
    return;
  }

  if (sibling.pathEl.children.length > 0) {
    return;
  }

  const pathAttributes = Object.entries(currentPathInfo.pathEl.attributes);
  if (
    pathAttributes.length !== Object.entries(sibling.pathEl.attributes).length
  ) {
    return;
  }

  // Make sure all attributes other than "d" are identical.
  for (const [k, v] of pathAttributes) {
    if (k === 'd') {
      continue;
    }
    if (sibling.pathEl.attributes[k] !== v) {
      return;
    }
  }

  // Make sure paths don't intersect.
  if (intersects(getPathData(currentPathInfo), getPathData(sibling))) {
    return;
  }

  return sibling;
}

/**
 * @param {PathElementInfo} currentPathInfo
 * @param {PathElementInfo} sibling
 */
function mergePaths(currentPathInfo, sibling) {
  getPathData(currentPathInfo).push(...getPathData(sibling));
  currentPathInfo.merged = true;
}

/**
 * @param {PathElementInfo} currentPathInfo
 */
function writePathData(currentPathInfo) {
  if (!currentPathInfo.merged || currentPathInfo.pathData === undefined) {
    return;
  }
  js2path(currentPathInfo.pathEl, currentPathInfo.pathData, {});
}
