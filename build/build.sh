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

uglifyjs a.i -o a.s -cm
uglifyjs a.i -o a-ie8.s -cm --ie8

# uglifyjs a.i -o audioc.min.js -cm
# uglifyjs a.i -o audioc-ie8.min.js -cm --ie8
cat << EOF > ./a.o
/*!
 * Audioc Player v0.1.6
 */
EOF
cat << EOF > ./a-ie8.o
/*!
 * Audioc Player v0.1.6
 */
EOF

cat a.s >> a.o
cat a-ie8.s >> a-ie8.o

mv a.o audioc.min.js
mv a-ie8.o audioc-ie8.min.js

echo "Compilation End"

echo "Clear Start"

rm -f ./a.i
rm -f ./a.s ./a-ie8.s
rm -f ./a.o ./a-ie8.o
rm -f ./a.ie

echo "Clear End"
