const { createNowPlaying } = require('../utils/embeds/play/createNowPlaying');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { refillRadio, stopRadio } = require('../utils/radio');

function rgbToHex(rgb) {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

async function queueCompanionFallback(client, player, track) {
    const apiToken = process.env.COMPANION_API_TOKEN;
    if (!apiToken) throw new Error('COMPANION_API_TOKEN is not configured');

    const query = `${track?.info?.title || ''} ${track?.info?.author || ''}`.trim();
    const search = await player.search({ query, source: 'ytmsearch' }, client.user);
    const sourceTrack = search?.tracks?.find((candidate) =>
        /^[A-Za-z0-9_-]{11}$/.test(candidate?.info?.identifier || '')
    );
    if (!sourceTrack) throw new Error(`No YouTube video ID found for ${query}`);

    const response = await fetch('http://127.0.0.1:8282/companion/youtubei/v1/player', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId: sourceTrack.info.identifier }),
    });
    if (!response.ok) throw new Error(`Companion returned HTTP ${response.status}`);

    const data = await response.json();
    const audio = data?.streamingData?.adaptiveFormats?.find((format) =>
        typeof format.url === 'string' && format.mimeType?.startsWith('audio/webm')
    );
    if (!audio?.url) throw new Error('Companion returned no playable Opus stream');

    const direct = await player.search({ query: audio.url, source: 'http' }, client.user);
    const fallbackTrack = direct?.tracks?.[0];
    if (!fallbackTrack) throw new Error('Lavalink could not load the Companion stream');

    player.queue.splice(player.queue.currentPosition + 1, 0, fallbackTrack);
    return sourceTrack.info.title;
}

function PlayerEvents(client) {
    const nowPlayingMessages = new Map(); // Store message IDs per guild: guildId -> messageId
    const idleTimers = new Map(); // Store idle timers for each guild

    client.lavalink.on('trackStart', async (player, track) => {
        console.log(`[Track Start] -> ${track?.info?.title} -> Guilds ${player.guildId} -> Volume ${player.volume}%`);
        console.log(`[DEBUG] nowPlayingMessageId at start of trackStart: ${nowPlayingMessages.get(player.guildId)}`);

        // Clear idle timer when a new track starts
        if (idleTimers.has(player.guildId)) {
            clearTimeout(idleTimers.get(player.guildId));
            idleTimers.delete(player.guildId);
            console.log(`[Auto-Disconnect] Cleared idle timer for guild ${player.guildId}`);
        }

        // Keep radio sessions supplied before the listener reaches the end of
        // the current short queue. A failure is logged inside refillRadio and
        // never prevents ordinary playback or now-playing updates.
        await refillRadio(player);

        const currentTrack = player.queue.current;
        if (!currentTrack) return;

        const hexColor = "#00ff00";
        const config = require('../config/emojis.json');
        const nextEmoji = config.emojis.next;

        const nextTrack = player.queue.tracks[0];
        const nextTrackDescription = nextTrack ?
            `\n${nextEmoji}・Next Song **[${nextTrack.info.title || 'Unknown Title'}](${nextTrack.info.uri || '#'}) - ${nextTrack.info.author || 'Unknown Artist'}**` : '';

        const { embed, components } = createNowPlaying(currentTrack, player, hexColor, null);
        embed.setDescription(`🔊・Now Playing **[${currentTrack.info.title || 'Unknown Title'}](${currentTrack.info.uri || '#'}) - ${currentTrack.info.author || 'Unknown Artist'}**${nextTrackDescription || ''}`);

        const channel = client.channels.cache.get(player.textChannelId);
        if (channel) {
            const currentMessageId = nowPlayingMessages.get(player.guildId);
            if (currentMessageId) {
                try {
                    const oldMessage = await channel.messages.fetch(currentMessageId);
                    if (oldMessage) {
                        await oldMessage.delete();
                        console.log(`[Track Start] Deleted old "Now Playing" message.`);
                    }
                } catch (error) {
                    if (error.code === 10008) {
                        console.log(`[Track Start] Old "Now Playing" message already deleted or not found.`);
                        nowPlayingMessages.delete(player.guildId);
                    } else {
                        console.error(`[Track Start] Error deleting old "Now Playing" message:`, error);
                    }
                }
            }

            const message = await channel.send({ embeds: [embed], components });
            nowPlayingMessages.set(player.guildId, message.id);
            console.log(`[Track Start] Sent new "Now Playing" message with ID: ${message.id}`);
        }
    })
    .on('trackEnd', async (player, track) => {
        console.log(`[Track End] -> ${track?.info?.title} -> Guilds ${player.guildId}`);
        console.log(`Queue length after track end: ${player.queue.tracks.length}`);

        const channel = client.channels.cache.get(player.textChannelId);
        const currentMessageId = nowPlayingMessages.get(player.guildId);
        if (channel && currentMessageId) {
            try {
                const message = await channel.messages.fetch(currentMessageId);
                if (message) {
                    await message.delete();
                    nowPlayingMessages.delete(player.guildId);
                }
            } catch (error) {
                if (error.code === 10008) {
                    console.log(`[Track End] Old "now playing" message already deleted or not found.`);
                    nowPlayingMessages.delete(player.guildId);
                } else {
                    console.error(`[Track End] Error deleting old "now playing" message:`, error);
                }
            }
        }

        // Check if queue is empty and start idle timer
        if (!player.queue.current && player.queue.tracks.length === 0) {
            const guildId = player.guildId;

            // Clear existing timer if any
            if (idleTimers.has(guildId)) {
                clearTimeout(idleTimers.get(guildId));
            }

            console.log(`[Auto-Disconnect] Starting 5-minute idle timer for guild ${guildId}`);

            // Set 30 second timer for testing (change to 5 * 60 * 1000 for 5 minutes)
            const timer = setTimeout(async () => {
                const currentPlayer = client.lavalink.getPlayer(guildId);

                // Check if still idle
                if (currentPlayer && !currentPlayer.queue.current && currentPlayer.queue.tracks.length === 0) {
                    console.log(`[Auto-Disconnect] Guild ${guildId} - Idle for 30 seconds, disconnecting`);

                    // Send message to text channel
                    const textChannel = client.channels.cache.get(currentPlayer.textChannelId);
                    if (textChannel) {
                        const embed = new EmbedBuilder()
                            .setColor(0xFF6B6B)
                            .setDescription("👋 Disconnected due to inactivity.");
                        await textChannel.send({ embeds: [embed] });
                    }

                    // Disconnect
                    try {
                        await currentPlayer.destroy();
                        nowPlayingMessages.delete(guildId);
                    } catch (destroyError) {
                        console.error(`[Auto-Disconnect] Error destroying player for guild ${guildId}:`, destroyError);
                    }
                } else {
                    console.log(`[Auto-Disconnect] Guild ${guildId} is no longer idle, timer cancelled`);
                }

                idleTimers.delete(guildId);
            }, 300 * 1000); // 30 seconds for testing

            idleTimers.set(guildId, timer);
        }
    })
    .on('trackError', async (player, track, payload) => {
        console.log(`[Track Error] -> ${track?.info?.title} -> Guilds ${player.guildId}`);
        console.error(`Error details: ${track?.error || 'No specific error message provided.'}`);
        console.log(`Payload error message: ${payload?.exception?.message || 'N/A'}`);

        const channel = client.channels.cache.get(player.textChannelId);
        if (!channel) return;

        if (payload?.exception?.message?.includes('All clients failed to load the item')) {
            try {
                const title = await queueCompanionFallback(client, player, track);
                await channel.send({
                    embeds: [new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setDescription(`⚠️ YouTube blocked the original stream. Retrying **${title}** through the local audio fallback.`)],
                });
                await player.skip();
                return;
            } catch (fallbackError) {
                console.error(`[Track Error] Companion fallback failed for ${track?.info?.title}:`, fallbackError);
            }
        }

        if (payload?.exception?.message?.includes("This video is not available") || payload?.exception?.message?.includes("The uploader has not made this video available")) {
            console.log(`Attempting to find replacement for deleted video: ${track?.info?.title}`);
            const query = `${track?.info?.title} ${track?.info?.author || ''}`;

            try {
                let searchResponse;
                let replacementTrack = null;

                searchResponse = await player.search({ query, source: "ytsearch" }, client.user);

                if (searchResponse && searchResponse.tracks.length > 0) {
                    for (const foundTrack of searchResponse.tracks) {
                        if (foundTrack.info.uri && !foundTrack.info.isStream) {
                            replacementTrack = foundTrack;
                            break;
                        }
                    }
                }

                if (replacementTrack) {
                    player.queue.splice(player.queue.currentPosition + 1, 0, replacementTrack);

                    const embed = new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setDescription(`⚠️ Video for **[${track?.info?.title || 'Unknown Track'}](${track?.info?.uri || '#'})** is unavailable. Trying **[${replacementTrack.info.title || 'Unknown Title'}](${replacementTrack.info.uri || '#'})** instead.`);

                    await channel.send({ embeds: [embed] });
                    console.log(`Found and queued replacement for ${track?.info?.title}: ${replacementTrack.info.title}`);

                    try {
                        player.skip();
                    } catch (skipError) {
                        console.error(`[Track Error] Error skipping to replacement track:`, skipError);
                    }
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setDescription(`❌ Video for **[${track?.info?.title || 'Unknown Track'}](${track?.info?.uri || '#'})** is unavailable, and no playable replacement could be found. Skipping.`);
                    await channel.send({ embeds: [embed] });
                    console.log(`No playable replacement found for ${track?.info?.title}. Skipping.`);
                    try {
                        player.skip();
                    } catch (skipError) {
                        console.error(`[Track Error] Error skipping track with no replacement:`, skipError);
                    }
                }
            } catch (searchError) {
                console.error(`Error during replacement search for ${track?.info?.title}:`, searchError);
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription(`❌ Video for **[${track?.info?.title || 'Unknown Track'}](${track?.info?.uri || '#'})** is unavailable. An error occurred during replacement search. Skipping.`);
                await channel.send({ embeds: [embed] });
                try {
                    player.skip();
                } catch (skipError) {
                    console.error(`[Track Error] Error skipping after search error:`, skipError);
                }
            }
        } else {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription(`❌ An unexpected error occurred with **[${track?.info?.title || 'Unknown Track'}](${track?.info?.uri || '#'})**. Skipping.`);
            await channel.send({ embeds: [embed] });
            try {
                player.skip();
            } catch (skipError) {
                console.error(`[Track Error] Error skipping after unexpected error:`, skipError);
            }
        }
    })
    .on('trackStuck', (player, track) => {
        console.log(`[Track Stuck] -> ${track?.info?.title} -> Guilds ${player.guildId}`);
        const channel = client.channels.cache.get(player.textChannelId);
        if (channel) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription(`⚠️ Track **[${track?.info?.title || 'Unknown Track'}](${track?.info?.uri || '#'})** got stuck. Skipping.`);
            channel.send({ embeds: [embed] });
        }
        try {
            player.skip();
        } catch (skipError) {
            console.error(`[Track Stuck] Error skipping stuck track:`, skipError);
        }
    })
    .on('queueEnd', async (player) => {
        console.log(`[Queue Ended] -> Guilds ${player.guildId}`);
        stopRadio(player.guildId);

        const channel = client.channels.cache.get(player.textChannelId);
        const currentMessageId = nowPlayingMessages.get(player.guildId);
        if (channel && currentMessageId) {
            try {
                const message = await channel.messages.fetch(currentMessageId);
                if (message) {
                    await message.delete();
                    nowPlayingMessages.delete(player.guildId);
                }
            } catch (error) {
                if (error.code === 10008) {
                    console.log(`[Queue End] Old "now playing" message already deleted or not found.`);
                    nowPlayingMessages.delete(player.guildId);
                } else {
                    console.error(`[Queue End] Error deleting old "now playing" message:`, error);
                }
            }
        }

        // Start idle timer when queue ends
        const guildId = player.guildId;

        // Clear existing timer if any
        if (idleTimers.has(guildId)) {
            clearTimeout(idleTimers.get(guildId));
        }

        console.log(`[Auto-Disconnect] Starting 30-second idle timer for guild ${guildId}`);

        // Set 30 second timer for testing (change to 5 * 60 * 1000 for 5 minutes)
        const timer = setTimeout(async () => {
            const currentPlayer = client.lavalink.getPlayer(guildId);

            // Check if still idle
            if (currentPlayer && !currentPlayer.queue.current && currentPlayer.queue.tracks.length === 0) {
                console.log(`[Auto-Disconnect] Guild ${guildId} - Idle for 5 minutes, disconnecting`);

                // Send message to text channel
                const textChannel = client.channels.cache.get(currentPlayer.textChannelId);
                if (textChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF6B6B)
                        .setDescription("👋 Disconnected due to inactivity.");
                    await textChannel.send({ embeds: [embed] });
                }

                // Disconnect
                try {
                    await currentPlayer.destroy();
                    nowPlayingMessages.delete(guildId);
                } catch (destroyError) {
                    console.error(`[Auto-Disconnect] Error destroying player for guild ${guildId}:`, destroyError);
                }
            } else {
                console.log(`[Auto-Disconnect] Guild ${guildId} is no longer idle, timer cancelled`);
            }

            idleTimers.delete(guildId);
        }, 300 * 1000); // 30 seconds for testing - change to 5 * 60 * 1000 for 5 minutes

        idleTimers.set(guildId, timer);
    });
}

module.exports = PlayerEvents;
