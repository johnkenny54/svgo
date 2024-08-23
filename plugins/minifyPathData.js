import { path2js, js2path } from './_path.js';
import { pathElems } from './_collections.js';

/**
 * @typedef {import('../lib/types.js').PathDataItem} PathDataItem
 */

export const name = 'minifyPathData';
export const description = 'minifies path data';

/**
 * @type {import('./plugins-types.js').Plugin<'minifyPathData'>}
 */
export const fn = () => {
  return {
    element: {
      enter: (node) => {
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
