#!/bin/sh

echo "Preprocessing Start"

cat /dev/null > a.i
cat audioc.0  >> a.i
cat amrnb.js  >> a.i
cat audioc.js >> a.i
cat audioc.1  >> a.i

sed -ie 's//\n/g' a.i

echo "Preprocessing End"

echo "Compilation Start"

uglifyjs a.i -o audioc.min.js -cm
uglifyjs a.i -o audioc-ie8.min.js -cm --ie8

# cat << EOF > ./audioc.min.js
# EOF

echo "Compilation End"

echo "Clear Start"

rm -f ./a.i

echo "Clear End"
