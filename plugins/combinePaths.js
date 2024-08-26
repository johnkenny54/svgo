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
export const fn = () => {
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
              currentPath = { pathEl: child };
            } else {
              const childPathInfo = { pathEl: child };
              if (isMergeable(currentPath, childPathInfo)) {
                mergePaths(currentPath, childPathInfo);
                mergedNodes.add(child);
              } else {
                writePathData(currentPath);
                currentPath = childPathInfo;
              }
            }
          } else if (currentPath !== undefined) {
            writePathData(currentPath);
            currentPath =
              child.type === 'element' ? { pathEl: child } : undefined;
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
