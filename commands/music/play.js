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

    return direct.tracks[0];
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

        // Defer reply immediately to avoid timeout
        await interaction.deferReply();

        const query = interaction.options.getString("query");
        const voiceChannel = interaction.member?.voice.channel;

        if (!voiceChannel) {
            const embed = joinVoiceChannelEmbed();
            return interaction.editReply({ embeds: [embed] });
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

        if (!response || !response.tracks.length) {
            const embed = noTracksFoundEmbed(query);
            return interaction.editReply({ embeds: [embed] });
        }

        const playbackTracks = await resolveTracksForPlayback(player, response.tracks, interaction.user);

        if (response.loadType === 'playlist') {
            player.queue.add(playbackTracks);

            if (!player.playing && !player.paused) {
                await player.play();
            }

            const playlistName = response.playlistInfo?.name || 'Unknown Playlist';
            const embed = addedToQueueEmbed(playlistName, response.tracks.length);
            await interaction.editReply({ embeds: [embed] });

        } else {
            const track = playbackTracks[0];

            player.queue.add(track);

            if (!player.playing && !player.paused) {
                await player.play();
            }

            const embed = addedToQueueEmbed(track, player.queue.tracks.length);
            await interaction.editReply({ embeds: [embed] });
        }
    }
};
