#!/bin/bash
cd chrome/Echofon
zip -r -9 ../Echofon.jar *
cd ..
rm -rf Echofon
cd ..
zip -r -9 echofon_for_twitter-2.5.2.xpi *
