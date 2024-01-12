Changes to expected test results:

- in general, any expected result which starts with scale followed by a rotate will change
- \_transforms.test.js:
  - changed **scale(1,-1)rotate(-90)** to **rotate(90)scale(1,-1)** - these are equivalent
  - changed **scale(99,1)rotate(-90)** to **rotate(-90)scale(1,99)** - these are equivalent
