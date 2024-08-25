import { js2path, path2js } from './_path.js';

export const name = 'combinePaths';
export const description = 'combines multiple consecutive paths';

/**
 * @typedef {import('../lib/types.js').PathDataItem} PathDataItem
 * @typedef {import('../lib/types.js').XastElement} XastElement
 * @typedef {{pathEl:XastElement,
 *  pathData?:PathDataItem[],
 *  attData?:Map<string,string>
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
              if (isMergeable(currentPath, child)) {
                mergePaths(currentPath, child);
                mergedNodes.add(child);
              } else {
                writePathData(currentPath);
                currentPath = { pathEl: child };
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
 * @param {PathElementInfo} currentPathInfo
 * @param {XastElement} sibling
 */
function isMergeable(currentPathInfo, sibling) {
  const pathAttributes = Object.entries(currentPathInfo.pathEl.attributes);
  if (pathAttributes.length !== Object.entries(sibling.attributes).length) {
    return false;
  }

  // Make sure all attributes other than "d" are identical.
  for (const [k, v] of pathAttributes) {
    if (k === 'd') {
      continue;
    }
    if (sibling.attributes[k] !== v) {
      return false;
    }
  }
  return true;
}

/**
 * @param {PathElementInfo} currentPathInfo
 * @param {XastElement} sibling
 */
function mergePaths(currentPathInfo, sibling) {
  if (!currentPathInfo.pathData) {
    currentPathInfo.pathData = path2js(currentPathInfo.pathEl);
  }
  currentPathInfo.pathData.push(...path2js(sibling));
}

/**
 * @param {PathElementInfo} currentPathInfo
 */
function writePathData(currentPathInfo) {
  if (currentPathInfo.pathData === undefined) {
    return;
  }
  js2path(currentPathInfo.pathEl, currentPathInfo.pathData, {});
}
