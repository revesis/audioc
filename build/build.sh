#!/bin/sh

cat /dev/null > a.out
cat audioc.0  >> a.out
cat amrnb.js  >> a.out
cat audioc.js >> a.out
cat audioc.1  >> a.out

sed -ie 's//\n/g' a.out
rm -f a.oute

# uglifyjs a.out -o audioc.min.js -cm
# uglifyjs a.out -o audioc-ie8.min.js -cm --ie8
