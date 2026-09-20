#!/usr/bin/env bash
#
# Assemble the landing page and the console into one site for Vercel.
#
#   /            index.html    landing page
#   /api.html    api.html      developer reference
#   /app         app/dist      console (React)
#
# Why this exists: the root vercel.json used to be outputDirectory: "." — it
# published the whole repository directory as-is. That was fine while the repo
# held a few html files, but with app/ merged in it would put app/src/ and the
# internal notes under docs/ on the public internet, and Vercel does not read
# .gitignore.
#
# Naming what to publish beats maintaining a list of what to hide: anything
# added later is unpublished by default. Forgetting to add something to an
# allowlist costs one missing file; forgetting to add it to a denylist puts
# something public that was never meant to be.
set -euo pipefail

out=.vercel-out
rm -rf "$out" && mkdir -p "$out"

# The landing page and the developer reference. Both are self-contained single
# html files, so there is nothing to build.
cp index.html api.html "$out"/
cp -r assets "$out"/

# console.html is not published. It is the ancestor of app/, and every entry
# point on the landing page and the API reference now goes to /app — so nothing
# links to it any more. But it still looks usable while no longer following the
# product, and someone arriving on an old link would take it for the real thing
# and click around a dead screen. A 404 is more honest. The file stays in the
# repository: app/src/styles/console.css came from it.

# The console. Its base is /app/ (see app/vite.config.ts), so the build output
# lands under app/ directly.
#
# Report the toolchain first. This lockfile passes validation on npm 11 and
# fails on npm 10 — and the one npm 10 writes itself fails too, which is a
# known weakness in how it resolves transitive dependencies. Which npm the
# build machine runs is therefore the one fact that matters here, and it should
# not have to be guessed at.
echo "node $(node -v) · npm $(npm -v)"

# Prefer npm ci: it installs strictly from package-lock.json, exactly what was
# verified locally. npm install quietly moves minor versions, which is how
# "works here, breaks there" starts.
#
# But a failing ci must not keep the whole site from shipping. Fall back to
# install, and say so out loud — a silent downgrade becomes an unexplainable
# version difference weeks later.
(cd app && { npm ci || {
  echo "!!! npm ci failed, falling back to npm install — this build may not match the lockfile"
  npm install --no-audit --no-fund
}; } && npm run build)
cp -r app/dist "$out/app"

echo "site assembled in $out:"
ls -1 "$out"
