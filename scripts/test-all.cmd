call cmd\runjest --no-color 2>tmp\test-all.txt
grep "^Tests: " tmp\test-all.txt
grep "^FAIL " tmp\test-all.txt
