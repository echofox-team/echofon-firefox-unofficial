#!/bin/bash

versionNumber=$(sed -ne '/em:version/{s/.*<em:version>\(.*\)<\/em:version>.*/\1/p;q;}' install.rdf)

rm -rf build
mkdir -p build/src
cp -r --parents chrome/ components/ defaults/ modules/ platform/ chrome.manifest install.rdf build/src

cd build/src/chrome/Echofon
zip -r -9 ../Echofon.jar *
cd ..
rm -rf Echofon

cd ..
zip -r -9 ../echofon_unofficial-$versionNumber.xpi *
