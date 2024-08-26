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

/**
 * @type {import('./plugins-types.js').Plugin<'combinePaths'>}
 */
export const fn = (root) => {
  const docData = getDocData(root);
  return {
    element: {
      enter: (node) => {
        if (node.children.length === 0) {
          return;
        }

        let currentPath;
        const mergedNodes = new Set();
        for (const child of node.children) {
          if (child.type === 'element' && child.name === 'path') {
            if (currentPath === undefined) {
              currentPath = canBeFirstPath({ pathEl: child }, docData.styles);
            } else {
              const childPathInfo = { pathEl: child };
              if (isMergeable(currentPath, childPathInfo)) {
                mergePaths(currentPath, childPathInfo);
                mergedNodes.add(child);
              } else {
                writePathData(currentPath);
                currentPath = canBeFirstPath(childPathInfo, docData.styles);
              }
            }
          } else if (currentPath !== undefined) {
            writePathData(currentPath);
            currentPath =
              child.type === 'element'
                ? canBeFirstPath({ pathEl: child }, docData.styles)
                : undefined;
          }
        }

        if (currentPath) {
          writePathData(currentPath);
        }

        if (mergedNodes.size === 0) {
          return;
        }
        node.children = node.children.filter(
          (child) => !mergedNodes.has(child),
        );
      },
    },
  };
};

/**
 * @param {PathElementInfo} pathElInfo
 * @param {import('../lib/docdata.js').StyleData} styleData
 */
function canBeFirstPath(pathElInfo, styleData) {
  // TODO: use computeStyle() [not computeOwnStyle]
  const styles = styleData.computeOwnStyle(pathElInfo.pathEl);
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
  // TODO: MAKE SURE THERE ARE NO MARKERS, ETC.
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
