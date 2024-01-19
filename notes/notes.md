Baseline test results with original version saved to r-baseline.tsv:

- Mismatched: 194
- Passed: 5328
- Total reduction 764210428 bytes

Test results after making matrixToTransform() a no-op (r-no-op.tsv):

- Mismatched: 174
- Passed: 5348
- Total reduction 763934726 bytes

25 regressions changed from mismatch to pass, 5 changed from pass to mismatch, and optimized file size increased by 275,702 bytes.

The files that are behaving differently:

```
svgs/W3C_SVG_11_TestSuite/svg/text-text-10-t.svg	mismatch
svgs/W3C_SVG_11_TestSuite/svg/text-text-11-t.svg	mismatch
svgs/W3C_SVG_11_TestSuite/svg/types-dom-01-b.svg	mismatch
svgs/oxygen-icons-5.113.0/scalable/actions/edit-bomb.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/hidef/continue-data-project.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/16x16/zoom-1-to-2.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/16x16/zoom-2-to-1.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/16x16/zoom-draw.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/16x16/zoom-in.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/16x16/zoom-next.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/16x16/zoom-original.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/16x16/zoom-out.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/16x16/zoom-previous.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/16x16/zoom-select.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/22x22/page-zoom.svg	pass
svgs/oxygen-icons-5.113.0/scalable/actions/small/32x32/view-certificate-sign.svg	mismatch
svgs/oxygen-icons-5.113.0/scalable/applets/org.kde.muonnotifier.svg	pass
svgs/oxygen-icons-5.113.0/scalable/applets/org.kde.plasma.kicker.svg	pass
svgs/oxygen-icons-5.113.0/scalable/apps/klipper.svg	pass
svgs/oxygen-icons-5.113.0/scalable/apps/kmplayer.svg	pass
svgs/oxygen-icons-5.113.0/scalable/apps/small/22x22/klipper.svg	pass
svgs/oxygen-icons-5.113.0/scalable/apps/small/32x32/klipper.svg	pass
svgs/oxygen-icons-5.113.0/scalable/devices/battery.svg	pass
svgs/oxygen-icons-5.113.0/scalable/devices/small/48x48/media-optical-dvd.svg	mismatch
svgs/oxygen-icons-5.113.0/scalable/mimetypes/hidef/text-x-katefilelist.svg	pass
svgs/oxygen-icons-5.113.0/scalable/mimetypes/small/22x22/application-x-k3b.svg	pass
svgs/oxygen-icons-5.113.0/scalable/mimetypes/small/32x32/application-x-k3b.svg	pass
svgs/oxygen-icons-5.113.0/scalable/mimetypes/small/32x32/text-x-katefilelist.svg	pass
svgs/oxygen-icons-5.113.0/scalable/mimetypes/text-x-katefilelist.svg	pass
svgs/oxygen-icons-5.113.0/scalable/places/small/48x48/folder-favorites.svg	pass
```

The 3 W3C files that changed to mismatch are likely false positives due to my Windows environment.

Jest results after making matrixToTransform() a no-op:

- Tests: 9 failed, 3 skipped, 417 passed, 429 total
- FAIL test/plugins/\_transforms.test.js
- FAIL lib/svgo.test.js
- FAIL test/coa/\_index.test.js (5.607 s)
- FAIL test/plugins/\_index.test.js (6.514 s)

Goal is to add functionality to matrixToTransform() so:

- Jest tests pass.
- The tests that changed from pass to mismatch are restored to pass, or determined to be caused by a different issue, which was masked by
  problems with matrixToTransform().
- All of the tests that passed when matrixToTransform() was a no-op continue to pass.
- As much size reduction as possible is restored.

# Version 1:

Added basic functionality. Test case 1 has fewer failing items.

Jest results:

- Tests: 9 failed, 3 skipped, 417 passed, 429 total
- FAIL test/plugins/\_transforms.test.js
- FAIL lib/svgo.test.js
- FAIL test/coa/\_index.test.js
- FAIL test/plugins/\_index.test.js (5.356 s)

Regression (saved to r-v1.tsv):

- Mismatched: 315
- Passed: 5207
- Total reduction 763997776 bytes

So something broke from the no-op version.

# Version 2:

Fixed bug with scaling when rotation was 180 degrees. Added 2 test cases.

Jest results (coa tests now passing):

- Tests: 7 failed, 3 skipped, 421 passed, 431 total
- FAIL test/plugins/\_transforms.test.js
- FAIL lib/svgo.test.js
- FAIL test/plugins/\_index.test.js (6.599 s)

Regression (saved as r-v2.tsv):

- Mismatched: 171
- Passed: 5351
- Total reduction 764238454 bytes

All of the files that passed with the no-op version, along with the 3 W3C files that had failed in the no-op version.

This version had 28,026 bytes more compression than the original version.

Two files that passed with the original version are mismatches with this version:

- svgs/oxygen-icons-5.113.0/scalable/actions/small/32x32/view-certificate-sign.svg mismatch
- svgs/oxygen-icons-5.113.0/scalable/devices/small/48x48/media-optical-dvd.svg mismatch

# Version 3:

Added logic to merge translate and rotate. Updated test case expected results.

Jest results:

- Tests: 4 failed, 3 skipped, 424 passed, 431 total
- FAIL lib/svgo.test.js
- FAIL test/plugins/\_index.test.js

Regression (saved as r-v3.tsv):

- Mismatched: 171
- Passed: 5351
- Total reduction 764363644 bytes

This version had 153,216 bytes more compression than the original version, and 125,190 more than version 2.

Mismatch results were identical to version 2. The two files that were mismatched in this version but passed in the original
version pass in this version if the default transformPrecision is changed from 5 to 6 in convertTransform.js, so they appear to be rounding
issues elsewhere in the plugin.

# matrixToTransform branch:

This included minor cleanup from version 3.

Regression (saved as r-pr1.tsv):

- Mismatched: 208
- Passed: 5314
- Total reduction 764364785 bytes

Must have introduced a bug in the cleanup.

# PR version 2:

Fixed bug.

Regression (saved as r-pr2.tsv):

- Mismatched: 171
- Passed: 5351
- Total reduction 764363651 bytes

So 153,223 bytes more compression than original.

# PR version 3:

Cleaned up variable names, used intermediate values to reduce trig in merge of translate()rotate().

Regression (saved as r-pr3.tsv):

- Mismatched: 171
- Passed: 5351
- Total pixel difference 11504
- Total reduction 764363651 bytes

No change in mismatches or compression.

# 3.2-lr

Original implementation (as of SVGO 3.2), with sx/sy not rounded at beginning of matrixToTransform().

Regression (saved as r-3.2-lr.tsv)

- Mismatched: 173
- Passed: 5349
- Total pixel difference 11556
- Total reduction 764405630 bytes

So 195,202 bytes more compression than original and 41,979 more compression than PR version 3.

Mismatch differences with r-pr3.tsv:

```
svgs/oxygen-icons-5.113.0/scalable/actions/small/32x32/view-certificate-sign.svg mismatch
svgs/oxygen-icons-5.113.0/scalable/apps/klipper.svg pass
svgs/oxygen-icons-5.113.0/scalable/apps/small/22x22/klipper.svg pass
svgs/oxygen-icons-5.113.0/scalable/apps/small/32x32/klipper.svg pass

```

# PR refactored version 1 (saved as r-rf1.tsv):

Initial refactor of PR branch.

- Mismatched: 172
- Passed: 5350
- Total pixel difference 11533
- Total reduction 764476085 bytes

Differences from PR v 3:

Pixel difference: increased by 29
Compression: improved by 112,434 bytes

Mismatch differences:

svgs/oxygen-icons-5.113.0/scalable/actions/small/32x32/view-certificate-sign.svg pass
svgs/oxygen-icons-5.113.0/scalable/apps/hidef/kmail2.svg mismatch
svgs/oxygen-icons-5.113.0/scalable/apps/kmail2.svg mismatch
