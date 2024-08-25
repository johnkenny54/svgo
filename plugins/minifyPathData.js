import { path2js, js2path } from './_path.js';
import { pathElems } from './_collections.js';
import { getDocData } from '../lib/docdata.js';
import { visitSkip } from '../lib/xast.js';

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
  const hasAttributeSelector = docData.styles.hasAttributeSelector('d');

  return {
    element: {
      enter: (node) => {
        if (hasAttributeSelector) {
          // If there is an attribute selector on the "d" attribute, don't try to optimize.
          return visitSkip;
        }
        if (pathElems.has(node.name) && node.attributes.d != null) {
          let data = path2js(node);

          if (data.length) {
            js2path(node, data, {});
          }
        }
      },
    },
  };
};
