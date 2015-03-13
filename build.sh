#!/bin/bash

platform='unknown'
unamestr=$(uname)
if [[ "$unamestr" == 'Linux' ]]; then
   platform='linux'
elif [[ "$unamestr" == 'Darwin' ]]; then
   platform='mac'
fi

versionNumber=$(sed -ne '/em:version/{s/.*<em:version>\(.*\)<\/em:version>.*/\1/p;q;}' install.rdf)

read -p "Enter your consumer key [Echofon's one]: " consumerKey
read -p "Enter your consumer secret [Echofon's one]: " consumerSecret

rm -rf build
mkdir -p build/src
dirs='chrome/ components/ defaults/ modules/ platform/ chrome.manifest install.rdf'

if [[ $platform == 'mac' ]]; then
    rsync -rR $dirs build/src
elif [[ $platform == 'linux' ]]; then
    cp -r --parents $dirs build/src
fi

cd build/src
if [[ -n consumerKey && -n consumerSecret ]]; then
    if [[ $platform == 'mac' ]]; then
        sed -i '' "s/%CONSUMER_KEY%/$consumerKey/g" modules/TwitterClient.jsm
        sed -i '' "s/%CONSUMER_SECRET%/$consumerSecret/g" modules/EchofonSign.jsm
    elif [[ $platform == 'linux' ]]; then
        sed -i "s/%CONSUMER_KEY%/$consumerKey/g" modules/TwitterClient.jsm
        sed -i "s/%CONSUMER_SECRET%/$consumerSecret/g" modules/EchofonSign.jsm
    fi
fi

cd chrome/Echofon
zip -r -9 ../Echofon.jar *
cd ..
rm -rf Echofon

cd ..
zip -r -9 ../echofon_unofficial-$versionNumber.xpi *
