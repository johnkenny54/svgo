The matrixToTransform() function in \_transforms.js was causing mismatches in some of the regression tests. I tracked this down to
some conditions where the code was trying to move the scale() transform to a different place. I tried fixing the original code, but the
scale adjustments were woven all through the function, so I ended up rewriting it.

The new version fixes 23 regression errors compared to the original version, and reduces the compressed file size of the regression files
by an additional 153,223 bytes over the original version.

Changes to the code:

- The new code closely follows the algorithm referenced in the original code at
  https://frederic-wang.fr/decomposition-of-2d-transform-matrices.html.
- The algorithm referenced above always decomposes a matrix in the form translate()rotate()scale()skewX(). The original code
  sometimes tried to move the scale() in front of the rotate(), but this is not always safe. The new code always preserves the
  decomposition order.
- The code to convert transform(tx,ty)rotate(a) to rotate(a,cx,cy) has been rewritten. This code is independent of the decomposition algorithm.
  There are comments in the code describing the calculation.
- The new version does not do any rounding, so no longer uses params.floatPrecision or params.transformPrecision.
- There are some optimizations performed by the original code that are not in the current code. These could be
  added in the future as special cases, but given that this version reduces regression errors and reduces optimized file size compared to
  the original code, it would be best to keep this initial version as simple as possible.

Many of the expected test results changed:

- in general, any expected result which starts with scale followed by a rotate will change
- some expected results were replaced by equivalent non-matrix transforms
- some transforms which were optimized by the previous code are not optimized by this code, and expected result is
  now a matrix (generally the original matrix unchanged)
