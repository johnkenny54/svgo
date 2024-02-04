#!/usr/bin/env bash

# generate files with just name and status
cut -f 1-2 $1 > tmp/file1.status.tsv
cut -f 1-2 $2 > tmp/file2.status.tsv
diff tmp/file1.status.tsv tmp/file2.status.tsv --suppress-common-lines > tmp/status.diff.txt
grep -F "> " tmp/status.diff.txt > tmp/file2.diff.tsv

echo All differences:
cat tmp/file2.diff.tsv | cut -c 3-
echo New passes:
grep -E 'pass$' tmp/file2.diff.tsv | wc -l
echo New mismatches:
grep -E 'mismatch$' tmp/file2.diff.tsv | wc -l

# generate files with all lines that differ between the two files
diff $1 $2 > tmp/alldiffs.txt
head -1 $1 > tmp/file1.alldiffs.tsv
grep -F "< " tmp/alldiffs.txt | cut -c 3- >> tmp/file1.alldiffs.tsv
head -1 $1 > tmp/file2.alldiffs.tsv
grep -F "> " tmp/alldiffs.txt | cut -c 3- >> tmp/file2.alldiffs.tsv
