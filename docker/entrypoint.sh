#!/bin/bash

npm i > /dev/null

tmp_dir=$(mktemp -d -t XXXXXXXXXX)

node certificate.js --output=${tmp_dir} ${REASONS} ${PROFILES_PATH}

rm -Rf ${tmp_dir}