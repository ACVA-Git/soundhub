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

        if (response.loadType === 'playlist') {
            player.queue.add(response.tracks);

            if (!player.playing && !player.paused) {
                await player.play();
            }

            const playlistName = response.playlistInfo?.name || 'Unknown Playlist';
            const embed = addedToQueueEmbed(playlistName, response.tracks.length);
            await interaction.editReply({ embeds: [embed] });

        } else {
            const track = response.tracks[0];

            player.queue.add(track);

            if (!player.playing && !player.paused) {
                await player.play();
            }

            const embed = addedToQueueEmbed(track, player.queue.tracks.length);
            await interaction.editReply({ embeds: [embed] });
        }
    }
};
