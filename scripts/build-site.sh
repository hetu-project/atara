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
# Install with a pinned npm, not whatever the machine ships.
#
# npm 11.6 and npm 11.17 each reject the lockfile the other writes: one wants
# @solana/kit@5.5.1 materialised, the other wants the @solana/* 2.3.0 tree, and
# neither accepts the other's answer. They disagree about the same dependency
# graph, so "which npm" is not a detail here — it decides whether `npm ci` can
# run at all. A lockfile is only reproducible against the tool that wrote it.
#
# Regenerate the lockfile with this same pinned version whenever dependencies
# change: (cd app && npx -y npm@$NPM_PIN install)
NPM_PIN=11.17.0
echo "node $(node -v) · npm $(npm -v) · pinned npm $NPM_PIN"

# npm ci installs strictly from package-lock.json — exactly what was verified.
# npm install quietly moves minor versions, which is how "works here, breaks
# there" starts.
#
# A failing ci still must not keep the whole site from shipping, so fall back —
# but say so out loud. A silent downgrade becomes an unexplainable version
# difference weeks later. Note the fallback also rewrites the lockfile, so a
# build that prints this line has changed a tracked file.
(cd app && { npx -y npm@$NPM_PIN ci || {
  echo "!!! npm ci failed, falling back to npm install — this build may not match the lockfile"
  npx -y npm@$NPM_PIN install --no-audit --no-fund
}; } && npm run build)
cp -r app/dist "$out/app"

echo "site assembled in $out:"
ls -1 "$out"
