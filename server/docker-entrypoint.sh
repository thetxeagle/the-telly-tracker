#!/bin/sh
set -eu

npm run db:deploy

if [ "${DEMO_SEED_DATA:-false}" = "true" ]; then
  echo "Loading optional fictional demo catalog"
  npm run db:seed
fi

exec npm start
