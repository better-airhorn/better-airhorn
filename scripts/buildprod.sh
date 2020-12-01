#!/usr/bin/env bash
set -e
set -x

cd apps/bot
yarn run build
cd ../..

rm builds -rf

mkdir builds
mkdir builds/bot
cp apps/bot/* builds/bot/ -r
rm builds/bot/src -rf
