import { path2js, js2path } from './_path.js';
import { pathElems } from './_collections.js';
import { getDocData } from '../lib/docdata.js';
import { cleanupOutData } from '../lib/svgo/tools.js';

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
  if (hasAttributeSelector) {
    // If there is an attribute selector on the "d" attribute, don't try to optimize.
    return;
  }

  return {
    element: {
      enter: (node) => {
        if (pathElems.has(node.name) && node.attributes.d != null) {
          let data = path2js(node);
          if (data.length) {
            convertToRelative(data);
            data = convertToMixed(data);
            js2path(node, data, {});
          }
        }
      },
    },
  };
};

/**
 * Convert absolute path data coordinates to relative.
 *
 * @type {(pathData: PathDataItem[]) => PathDataItem[]}
 */
const convertToRelative = (pathData) => {
  let start = [0, 0];
  let cursor = [0, 0];
  let prevCoords = [0, 0];

  for (let i = 0; i < pathData.length; i += 1) {
    const pathItem = pathData[i];
    let { command, args } = pathItem;

    // moveto (x y)
    if (command === 'm') {
      // update start and cursor
      cursor[0] += args[0];
      cursor[1] += args[1];
      start[0] = cursor[0];
      start[1] = cursor[1];
    }
    if (command === 'M') {
      // M → m
      // skip first moveto
      if (i !== 0) {
        command = 'm';
      }
      args[0] -= cursor[0];
      args[1] -= cursor[1];
      // update start and cursor
      cursor[0] += args[0];
      cursor[1] += args[1];
      start[0] = cursor[0];
      start[1] = cursor[1];
    }

    // lineto (x y)
    if (command === 'l') {
      cursor[0] += args[0];
      cursor[1] += args[1];
    }
    if (command === 'L') {
      // L → l
      command = 'l';
      args[0] -= cursor[0];
      args[1] -= cursor[1];
      cursor[0] += args[0];
      cursor[1] += args[1];
    }

    // horizontal lineto (x)
    if (command === 'h') {
      cursor[0] += args[0];
    }
    if (command === 'H') {
      // H → h
      command = 'h';
      args[0] -= cursor[0];
      cursor[0] += args[0];
    }

    // vertical lineto (y)
    if (command === 'v') {
      cursor[1] += args[0];
    }
    if (command === 'V') {
      // V → v
      command = 'v';
      args[0] -= cursor[1];
      cursor[1] += args[0];
    }

    // curveto (x1 y1 x2 y2 x y)
    if (command === 'c') {
      cursor[0] += args[4];
      cursor[1] += args[5];
    }
    if (command === 'C') {
      // C → c
      command = 'c';
      args[0] -= cursor[0];
      args[1] -= cursor[1];
      args[2] -= cursor[0];
      args[3] -= cursor[1];
      args[4] -= cursor[0];
      args[5] -= cursor[1];
      cursor[0] += args[4];
      cursor[1] += args[5];
    }

    // smooth curveto (x2 y2 x y)
    if (command === 's') {
      cursor[0] += args[2];
      cursor[1] += args[3];
    }
    if (command === 'S') {
      // S → s
      command = 's';
      args[0] -= cursor[0];
      args[1] -= cursor[1];
      args[2] -= cursor[0];
      args[3] -= cursor[1];
      cursor[0] += args[2];
      cursor[1] += args[3];
    }

    // quadratic Bézier curveto (x1 y1 x y)
    if (command === 'q') {
      cursor[0] += args[2];
      cursor[1] += args[3];
    }
    if (command === 'Q') {
      // Q → q
      command = 'q';
      args[0] -= cursor[0];
      args[1] -= cursor[1];
      args[2] -= cursor[0];
      args[3] -= cursor[1];
      cursor[0] += args[2];
      cursor[1] += args[3];
    }

    // smooth quadratic Bézier curveto (x y)
    if (command === 't') {
      cursor[0] += args[0];
      cursor[1] += args[1];
    }
    if (command === 'T') {
      // T → t
      command = 't';
      args[0] -= cursor[0];
      args[1] -= cursor[1];
      cursor[0] += args[0];
      cursor[1] += args[1];
    }

    // elliptical arc (rx ry x-axis-rotation large-arc-flag sweep-flag x y)
    if (command === 'a') {
      cursor[0] += args[5];
      cursor[1] += args[6];
    }
    if (command === 'A') {
      // A → a
      command = 'a';
      args[5] -= cursor[0];
      args[6] -= cursor[1];
      cursor[0] += args[5];
      cursor[1] += args[6];
    }

    // closepath
    if (command === 'Z' || command === 'z') {
      // reset cursor
      cursor[0] = start[0];
      cursor[1] = start[1];
    }

    pathItem.command = command;
    pathItem.args = args;
    // store absolute coordinates for later use
    // base should preserve reference from other element
    // @ts-ignore
    pathItem.base = prevCoords;
    // @ts-ignore
    pathItem.coords = [cursor[0], cursor[1]];
    // @ts-ignore
    prevCoords = pathItem.coords;
  }

  return pathData;
};

/**
 * Writes data in shortest form using absolute or relative coordinates.
 *
 * @type {(path: PathDataItem[]) => PathDataItem[]}
 */
function convertToMixed(path) {
  var prev = path[0];

  path = path.filter(function (item, index) {
    if (index == 0) return true;
    if (item.command === 'Z' || item.command === 'z') {
      prev = item;
      return true;
    }

    var command = item.command,
      data = item.args,
      adata = data.slice(),
      rdata = data.slice();

    if (
      command === 'm' ||
      command === 'l' ||
      command === 't' ||
      command === 'q' ||
      command === 's' ||
      command === 'c'
    ) {
      for (var i = adata.length; i--; ) {
        // @ts-ignore
        adata[i] += item.base[i % 2];
      }
    } else if (command == 'h') {
      // @ts-ignore
      adata[0] += item.base[0];
    } else if (command == 'v') {
      // @ts-ignore
      adata[0] += item.base[1];
    } else if (command == 'a') {
      // @ts-ignore
      adata[5] += item.base[0];
      // @ts-ignore
      adata[6] += item.base[1];
    }

    var absoluteDataStr = cleanupOutData(adata, {}),
      relativeDataStr = cleanupOutData(rdata, {});

    // Convert to absolute coordinates if it's shorter or forceAbsolutePath is true.
    // v-20 -> V0
    // Don't convert if it fits following previous command.
    // l20 30-10-50 instead of l20 30L20 30
    if (
      absoluteDataStr.length < relativeDataStr.length &&
      !(
        command == prev.command &&
        prev.command.charCodeAt(0) > 96 &&
        absoluteDataStr.length == relativeDataStr.length - 1 &&
        (data[0] < 0 ||
          (Math.floor(data[0]) === 0 &&
            !Number.isInteger(data[0]) &&
            prev.args[prev.args.length - 1] % 1))
      )
    ) {
      // @ts-ignore
      item.command = command.toUpperCase();
      item.args = adata;
    }

    prev = item;
    return true;
  });

  return path;
}
