const {
    SlashCommandBuilder,
} = require('discord.js');

// Embeds
const {
    noSongPlayingEmbed,
    joinVoiceChannelEmbed,
    noTracksFoundEmbed,
    addedToQueueEmbed,
    startedPlayingEmbed
} = require('../../utils/embeds/index');

const COMPANION_PLAYER_URL = 'http://127.0.0.1:8282/companion/youtubei/v1/player';
const pendingPlaybackStarts = new Map();
const PLAYLIST_RESOLUTION_CONCURRENCY = 4;

function preserveSourceMetadata(directTrack, sourceTrack) {
    const directInfo = directTrack?.info || {};
    const sourceInfo = sourceTrack?.info || {};

    return {
        ...directTrack,
        info: {
            ...directInfo,
            title: sourceInfo.title || directInfo.title,
            author: sourceInfo.author || directInfo.author,
            uri: sourceInfo.uri || directInfo.uri,
            identifier: sourceInfo.identifier || directInfo.identifier,
            artworkUrl: sourceInfo.artworkUrl || directInfo.artworkUrl,
            length: sourceInfo.length || directInfo.length,
        },
    };
}

async function resolveCompanionTrack(player, track, requester) {
    let videoId = track?.info?.identifier;

    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) {
        const query = `${track?.info?.title || ''} ${track?.info?.author || ''}`.trim();
        const search = await player.search({ query, source: 'ytmsearch' }, requester);
        const match = search?.tracks?.find((candidate) =>
            /^[A-Za-z0-9_-]{11}$/.test(candidate?.info?.identifier || '')
        );
        videoId = match?.info?.identifier;
    }

    if (!videoId) throw new Error(`No YouTube video ID found for ${track?.info?.title || 'track'}`);

    const response = await fetch(COMPANION_PLAYER_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.COMPANION_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId }),
    });
    if (!response.ok) throw new Error(`Companion returned HTTP ${response.status}`);

    const data = await response.json();
    const audio = data?.streamingData?.adaptiveFormats?.find((format) =>
        typeof format.url === 'string' && format.mimeType?.startsWith('audio/webm')
    );
    if (!audio?.url) throw new Error('Companion returned no playable Opus stream');

    const direct = await player.search({ query: audio.url, source: 'http' }, requester);
    if (!direct?.tracks?.[0]) throw new Error('Lavalink could not load the Companion stream');

    return preserveSourceMetadata(direct.tracks[0], track);
}

async function resolveTracksForPlayback(player, tracks, requester) {
    const resolved = [];
    for (const track of tracks) {
        try {
            resolved.push(await resolveCompanionTrack(player, track, requester));
        } catch (error) {
            console.warn(`[Companion] Primary resolution failed for ${track?.info?.title}; using Lavalink fallback.`, error);
            resolved.push(track);
        }
    }
    return resolved;
}

function resolveQueuedPlaylistTracks(player, tracks, requester) {
    const pendingTracks = [...tracks];
    const worker = async () => {
        while (pendingTracks.length) {
            const track = pendingTracks.shift();
            try {
                const resolvedTrack = await resolveCompanionTrack(player, track, requester);
                const queueIndex = player.queue.tracks.findIndex((queuedTrack) => queuedTrack === track);
                if (queueIndex >= 0) await player.queue.splice(queueIndex, 1, resolvedTrack);
            } catch (error) {
                console.warn(`[Companion] Background resolution failed for ${track?.info?.title}; keeping Lavalink fallback.`, error);
            }
        }
    };

    const workerCount = Math.min(PLAYLIST_RESOLUTION_CONCURRENCY, pendingTracks.length);
    void Promise.all(Array.from({ length: workerCount }, worker)).catch((error) =>
        console.error('[Companion] Unexpected playlist resolver error:', error)
    );
}

function startPlayerIfIdle(player) {
    if (player.playing || player.paused || pendingPlaybackStarts.has(player.guildId)) return;

    const startPromise = (async () => {
        try {
            if (!player.playing && !player.paused) await player.play();
        } finally {
            setTimeout(() => pendingPlaybackStarts.delete(player.guildId), 10000);
        }
    })();

    pendingPlaybackStarts.set(player.guildId, startPromise);
    void startPromise.catch((error) => console.error('[Playback] Could not start player:', error));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a song from a query or URL")
        .addStringOption(option =>
            option.setName("query")
                .setDescription("The Song name or URL to play")
                .setRequired(true)
        ),

    async execute({ client, interaction }) {
        if (!interaction.guildId) return;

        // Acknowledge immediately so Discord never leaves the request on "thinking".
        const requestStartedAt = performance.now();
        const logTiming = (stage) => console.log(`[Play] guild=${interaction.guild.id} stage=${stage} elapsed_ms=${Math.round(performance.now() - requestStartedAt)}`);
        await interaction.deferReply();
        await interaction.editReply({ content: '🔎 Finding a playable stream…' });
        logTiming('acknowledged');

        const query = interaction.options.getString("query");
        const voiceChannel = interaction.member?.voice.channel;

        if (!voiceChannel) {
            const embed = joinVoiceChannelEmbed();
            return interaction.editReply({ content: '', embeds: [embed] });
        }

        const player = client.lavalink.getPlayer(interaction.guild.id) || await client.lavalink.createPlayer({
            guildId: interaction.guild.id,
            voiceChannelId: voiceChannel.id,
            textChannelId: interaction.channel.id,
            selfDeaf: true,
            selfMute: false,
            volume: 80,
        });

        if (!player.connected) await player.connect();
        logTiming('voice-connected');

        // --- Intelligent Source Detection ---
        let searchSource;
        if (query.includes("spotify.com/playlist") || query.includes("spotify.com/track") || query.includes("spotify.com/album")) {
            searchSource = "spotify";
        } else if (query.includes("youtube.com/playlist") || query.includes("youtu.be/")) {
            searchSource = "youtube";
        } else {
            searchSource = "ytsearch"; // Default fallback for general queries
        }

        const response = await player.search({ query, source: searchSource }, interaction.user);
        logTiming('source-found');

        if (!response || !response.tracks.length) {
            const embed = noTracksFoundEmbed(query);
            return interaction.editReply({ content: '', embeds: [embed] });
        }

        if (response.loadType === 'playlist') {
            const [firstTrack, ...remainingTracks] = response.tracks;
            const [playbackTrack] = await resolveTracksForPlayback(player, [firstTrack], interaction.user);
            logTiming('first-track-resolved');

            await player.queue.add(playbackTrack);
            await player.queue.add(remainingTracks);

            const playlistName = response.playlistInfo?.name || 'Unknown Playlist';
            const embed = addedToQueueEmbed(playlistName, response.tracks.length);
            await interaction.editReply({ content: '', embeds: [embed] });

            startPlayerIfIdle(player);
            logTiming('queued');
            resolveQueuedPlaylistTracks(player, remainingTracks, interaction.user);

        } else {
            const playbackTracks = await resolveTracksForPlayback(player, response.tracks, interaction.user);
            logTiming('track-resolved');
            const track = playbackTracks[0];

            await player.queue.add(track);

            const embed = addedToQueueEmbed(track, player.queue.tracks.length);
            await interaction.editReply({ content: '', embeds: [embed] });

            startPlayerIfIdle(player);
            logTiming('queued');
        }
    }
};
