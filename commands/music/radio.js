const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
    chooseRadioSeed,
    getRadioSession,
    refillRadio,
    spotifyTrackIdFromUrl,
    startRadio,
    stopRadio,
} = require("../../utils/radio");

async function getOrCreatePlayer(client, interaction) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) throw new Error("Join a voice channel before starting radio.");

    const player = client.lavalink.getPlayer(interaction.guildId) || await client.lavalink.createPlayer({
        guildId: interaction.guildId,
        voiceChannelId: voiceChannel.id,
        textChannelId: interaction.channel.id,
        selfDeaf: true,
        selfMute: false,
        volume: 80,
    });

    if (player.voiceChannelId !== voiceChannel.id) {
        throw new Error("You must be in the same voice channel as the bot.");
    }
    if (!player.connected) await player.connect();
    return player;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("radio")
        .setDescription("Play an automatically refilled similar-track radio")
        .addSubcommand(subcommand => subcommand
            .setName("start")
            .setDescription("Start a similar-track radio from a Spotify track URL")
            .addStringOption(option => option
                .setName("spotify_track_url")
                .setDescription("Spotify track URL to use as the radio seed")
                .setRequired(true)
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName("stop")
            .setDescription("Stop automatically adding similar tracks")
        )
        .addSubcommand(subcommand => subcommand
            .setName("status")
            .setDescription("Show the current radio seed")
        ),

    async execute({ client, interaction }) {
        if (!interaction.guildId) return;
        await interaction.deferReply();

        const action = interaction.options.getSubcommand();
        const player = client.lavalink.getPlayer(interaction.guildId);
        const memberVoiceChannelId = interaction.member?.voice?.channelId;

        if (action === "stop") {
            if (!getRadioSession(interaction.guildId)) {
                return interaction.editReply("Radio mode is not active.");
            }
            if (!memberVoiceChannelId || !player || player.voiceChannelId !== memberVoiceChannelId) {
                return interaction.editReply("You must be in the same voice channel as the bot.");
            }
            stopRadio(interaction.guildId);
            return interaction.editReply("Radio mode stopped. Existing queued tracks will still play.");
        }

        if (action === "status") {
            const session = getRadioSession(interaction.guildId);
            if (!session) return interaction.editReply("Radio mode is not active.");
            return interaction.editReply("Radio is active and will keep about 8 related tracks queued.");
        }

        try {
            const spotifyUrl = interaction.options.getString("spotify_track_url", true);
            if (!spotifyTrackIdFromUrl(spotifyUrl)) {
                return interaction.editReply("Please provide a Spotify **track** URL (not a playlist, album, or artist URL).");
            }

            const radioPlayer = await getOrCreatePlayer(client, interaction);
            const seedResponse = await radioPlayer.search({ query: spotifyUrl, source: "spotify" }, interaction.user);
            const seedTrack = seedResponse?.tracks?.[0];
            if (!seedTrack) return interaction.editReply("I could not load that Spotify track.");

            const youtubeResponse = await radioPlayer.search({
                query: `${seedTrack.info.title} ${seedTrack.info.author} official audio`,
                source: "ytmsearch",
            }, interaction.user);
            const youtubeSeed = chooseRadioSeed(youtubeResponse?.tracks, seedTrack);
            if (!youtubeSeed) {
                return interaction.editReply("I could not find a YouTube Music match to build radio from that Spotify track.");
            }

            const seedWasQueued = Boolean(radioPlayer.queue.current) || radioPlayer.queue.tracks.length > 0;
            if (!seedWasQueued) radioPlayer.queue.add(seedTrack);

            const added = await startRadio(radioPlayer, youtubeSeed.info.identifier, interaction.user, seedTrack);
            if (!radioPlayer.playing && !radioPlayer.paused) await radioPlayer.play();

            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle("Similar-track radio started")
                .setDescription(`Using **${seedTrack.info.title}** by **${seedTrack.info.author}** as the seed.`)
                .addFields({ name: "Up next", value: `${added} related track${added === 1 ? "" : "s"} added; radio refills the queue when it gets low.` });
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("[Radio] Could not start radio:", error);
            return interaction.editReply("I could not start similar-track radio for that seed. Please try another Spotify track.");
        }
    },

    refillRadio,
};
