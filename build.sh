#!/bin/bash

versionNumber=$(sed -ne '/em:version/{s/.*<em:version>\(.*\)<\/em:version>.*/\1/p;q;}' install.rdf)

rm -rf build
mkdir -p build/src
cp -r --parents chrome/ components/ defaults/ modules/ platform/ chrome.manifest install.rdf build/src

LIB_DIR=chrome/Echofon/content/lib/
cp node_modules/react/dist/react.js "$LIB_DIR"
cp node_modules/react-dom/dist/react-dom.js "$LIB_DIR"
npm run build

cd build/src/chrome/Echofon
zip -r -9 ../Echofon.jar *
cd ..
rm -rf Echofon

cd ..
zip -r -9 ../echofon_unofficial-$versionNumber.xpi *
