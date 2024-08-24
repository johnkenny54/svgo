import { path2js, js2path } from './_path.js';
import { pathElems } from './_collections.js';
import { getDocData } from '../lib/docdata.js';

/**
 * @typedef {import('../lib/types.js').PathDataItem} PathDataItem
 */

export const name = 'minifyPathData';
export const description = 'minifies path data';

/**
 * @type {import('./plugins-types.js').Plugin<'minifyPathData'>}
 */
export const fn = (root) => {
  const docData = getDocData(root);
  return {
    element: {
      enter: (node) => {
        if (
          pathElems.has(node.name) &&
          node.attributes.d != null &&
          !docData.styles.hasAttributeSelector('d')
        ) {
          let data = path2js(node);

          if (data.length) {
            js2path(node, data, {});
          }
        }
      },
    },
  };
};
