import { getDocData } from '../lib/docdata.js';
import { includesUrlReference } from '../lib/svgo/tools.js';
import { intersects, js2path, path2js } from './_path.js';

export const name = 'combinePaths';
export const description = 'combines multiple consecutive paths';

/**
 * @typedef {import('../lib/types.js').PathDataItem} PathDataItem
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
    styleData !== undefined &&
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
        if (node.children.length > 0) {
          let currentPath;
          const mergedNodes = new Set();
          for (const child of node.children) {
            if (child.type === 'element' && child.name === 'path') {
              if (currentPath === undefined) {
                currentPath = canBeFirstPath(
                  { pathEl: child },
                  styleData,
                  parents,
                );
              } else {
                const childPathInfo = { pathEl: child };
                if (isMergeable(currentPath, childPathInfo)) {
                  mergePaths(currentPath, childPathInfo);
                  mergedNodes.add(child);
                } else {
                  writePathData(currentPath);
                  currentPath = canBeFirstPath(
                    childPathInfo,
                    styleData,
                    parents,
                  );
                }
              }
            } else if (currentPath !== undefined) {
              writePathData(currentPath);
              currentPath =
                child.type === 'element'
                  ? canBeFirstPath({ pathEl: child }, styleData, parents)
                  : undefined;
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
        }
      },
      exit: () => parents.pop(),
    },
  };
};

/**
 * @param {PathElementInfo} pathElInfo
 * @param {import('../lib/docdata.js').StyleData} styleData
 * @param {{element:XastElement}[]} parents
 */
function canBeFirstPath(pathElInfo, styleData, parents) {
  const styles = styleData.computeStyle(pathElInfo.pathEl, parents);
  if (
    [
      'clip-path',
      'mask',
      'mask-image',
      'marker-end',
      'marker-mid',
      'marker-start',
    ].some((attName) => styles.get(attName))
  ) {
    return;
  }
  if (
    ['fill', 'filter', 'stroke'].some((attName) =>
      includesUrlReference(styles.get(attName)),
    )
  ) {
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
 * @param {PathElementInfo} sibling
 */
function isMergeable(currentPathInfo, sibling) {
  const pathAttributes = Object.entries(currentPathInfo.pathEl.attributes);
  if (
    pathAttributes.length !== Object.entries(sibling.pathEl.attributes).length
  ) {
    return false;
  }

  // Make sure all attributes other than "d" are identical.
  for (const [k, v] of pathAttributes) {
    if (k === 'd') {
      continue;
    }
    if (sibling.pathEl.attributes[k] !== v) {
      return false;
    }
  }

  // Make sure paths don't intersect.
  if (intersects(getPathData(currentPathInfo), getPathData(sibling))) {
    return false;
  }

  return true;
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
