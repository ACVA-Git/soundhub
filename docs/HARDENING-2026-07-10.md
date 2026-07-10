# SoundHub hardening and update notes — 2026-07-10

## Changes prepared locally

- Updated Discord.js, Lavalink client, Canvas, dotenv, builders, and API types.
- Moved `nodemon` to development-only dependencies.
- Added dependency overrides for patched `lodash`, `picomatch`, and `undici`.
  `npm audit` now reports zero known vulnerabilities.
- Upgraded Canvas from 2.x to 3.x and added a PNG encode smoke test.
- Replaced the deprecated Discord.js `ready` event name and `ephemeral` option
  with `Events.ClientReady` and `MessageFlags.Ephemeral`.
- Restricted stop, volume, clear-queue, and shuffle buttons to members in the
  same voice channel as the bot.
- Contained Discord error `10062` so an expired button cannot cause the
  secondary `InteractionNotReplied` failure seen in PM2 logs.
- Replaced the placeholder failing test script with Node's built-in test runner.

## Runtime requirement

Node 20 is end-of-life. The repository now targets Node 22.12 through Node 26,
with `.nvmrc` selecting Node 24 LTS for deployment. Run the test suite under
Node 24 before restarting PM2. This host has Node 24.18.0 installed at
`~/.local/node24/node_modules/node/bin/node`; `ecosystem.config.js` selects that
runtime automatically and adds a 512 MiB PM2 restart ceiling.

## Verification

```bash
npm ci
npm audit --omit=dev
npm test
find . -type f -name '*.js' -not -path './node_modules/*' -print0 \
  | xargs -0 -n1 node --check
```

During the coordinated live test, apply the runtime with:

```bash
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
```

These changes are intentionally local and must not be pushed until the live
Discord/Lavalink test is approved.
