const { SlashCommandBuilder } = require("discord.js");
const { joinVoiceChannelEmbed, botNotConnectedEmbed, sameVoiceChannelEmbed, noSongPlayingEmbed, processingErrorEmbed, noSongToSkipEmbed, skipTrackEmbed } = require("../../utils/embeds/index");

async function skipTrack({ client, interaction }) {
    try {
        if (!interaction.guildId) return;

        
        const voiceChannel = interaction.member.voice.channelId;
        
        if (!voiceChannel) {
            const embed = joinVoiceChannelEmbed();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        const player = client.lavalink.getPlayer(interaction.guildId);
        
        if (!player) {
            const embed = botNotConnectedEmbed();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (player.voiceChannelId !== voiceChannel) {
            const embed = sameVoiceChannelEmbed();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        if (!player.queue.current) {
            const embed = noSongPlayingEmbed();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        const currentTrack = player.queue.current;
        const nextTrack = player.queue.tracks[0];

        if (!nextTrack) {
            const embed = noSongToSkipEmbed
            return interaction.reply({embeds: [embed], ephemeral: true});
        }

        // For button interactions, respond immediately (like stop button)
        if (interaction.isButton()) {
            const skipQueue = 1; // Buttons always skip 1
            await interaction.deferReply({ ephemeral: true });
            await player.skip(skipQueue);
            const embed = skipTrackEmbed(currentTrack);
            return interaction.editReply({ embeds: [embed] });
        }

        // For slash commands, use defer/editReply pattern
        await interaction.deferReply();

        const skipQueue = interaction.options?.getInteger("skip_queue") || 1;
        await player.skip(skipQueue);

        const embed = skipTrackEmbed(currentTrack);
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        const embed = processingErrorEmbed();
        return interaction.editReply({ embeds: [embed] });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Skip a song to go to the next song from the queue.")
        .addIntegerOption(option =>
            option.setName("skip_queue")
                .setDescription("Skip to the next song queue.")
                .setRequired(false)),
    execute: skipTrack,
    skipTrack, // Export the function
};
