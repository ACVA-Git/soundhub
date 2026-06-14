# BUSSY audio investigation

Date: 2026-06-13

## Running services

- Active Discord bot: PM2 process `soundhub-bot`, running `/home/administrator/soundhub/index.js`.
- Active Lavalink service: `lavalink.service`, running `/home/administrator/lavalink/Lavalink.jar`.
- Active YouTube cipher helper: `yt-cipher.service`.
- Disabled duplicate service: `discord-bot.service`. Leave disabled and inactive.

## Bot-side changes

- `pause`, `resume`, and `skip` button paths now defer the interaction reply before waiting on the Lavalink control call.
- This improves Discord interaction acknowledgement latency, but does not by itself remove audio-side pause/skip latency if Lavalink or Discord has buffered frames already queued.

## Lavalink changes

- Lavalink and plugins were updated to:
  - Lavalink `4.2.2`
  - `lavasrc-plugin:4.8.3`
  - `youtube-plugin:1.18.1`
- Lavalink now connects locally from BUSSY via `127.0.0.1`.
- Secrets were moved out of `application.yml` into `/etc/lavalink/lavalink.env`.
- Low-latency current audio buffers:
  - `bufferDurationMs: 400`
  - `frameBufferDurationMs: 1000`

## yt-cipher changes

- yt-cipher was updated and EJS was patched.
- `OVERRIDE_PLAYER_VARIANT=IAS` is set in the `yt-cipher.service` systemd drop-in.
- `src/player.ts` also defaults to `PlayerVariant.IAS` if the environment variable is absent.

## Live observations

- During active playback, Lavalink reported one player and one playing player.
- Lavalink `frameStats` remained `null` during repeated polling, so Lavalink was not reporting late, nulled, or deficit frames during the test windows.
- Lavalink CPU load was low, host CPU load was low, and swap was unused.
- BUSSY Node event loop latency was low, around 1.5 ms p95 during checks.
- yt-cipher logs showed no fresh errors after the IAS fix.
- Discord voice endpoint was US East/IAD.

## UDP queue note

- Java/Lavalink showed an unconnected UDP socket with a growing receive queue.
- Local logs confirmed Lavalink enabled JDA-NAS and loaded `udpqueue`.
- The active connected Discord media socket was not backed up.
- Kernel UDP error counters showed zero receive buffer errors and zero send buffer errors during checks.
- The growing queue is likely tied to JDA-NAS/udpqueue's extra UDP client behavior, not direct evidence of audio frame loss.
- If this becomes suspect again, run a short sudo packet capture for the queued UDP port to confirm packet source and type.

## Current conclusion

If multiple listeners hear stutters at different moments, that points away from a single broken source stream from BUSSY/Lavalink. A bot-side audio glitch would usually be heard by everyone at the same playback instant. Remaining likely causes are Discord voice distribution, individual client/network jitter, or Discord-side buffering after the bot has already sent valid audio frames.

If everyone hears the exact same crackle at the exact same moment, collect a timestamp and check Lavalink `frameStats`, system load, and recent Lavalink logs for that exact interval.
