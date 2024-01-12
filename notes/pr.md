Changes to expected test results:

- in general, any expected result which starts with scale followed by a rotate will change
- \_transforms.test.js:
  - changed **scale(1,-1)rotate(-90)** to **rotate(90)scale(1,-1)** - these are equivalent
  - changed **scale(99,1)rotate(-90)** to **rotate(-90)scale(1,99)** - these are equivalent
- convertTransform.01.svg.txt:
  - changed all `<g>` elements to `<rect>` so they display
  - changed all **rotate(-45 261.728 -252.175)** to **rotate(-45 261.757 -252.243)** - minor difference in result with new algorithm, but I
    did not see a visual difference
  - changed scale(2)rotate(-45 130.898 -126.14) to rotate(-45 261.757 -252.243)scale(2)
