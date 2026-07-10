const { SlashCommandBuilder } = require("discord.js");
const { safeInteractionError } = require('../../utils/interactions');
const { joinVoiceChannelEmbed, sameVoiceChannelEmbed, botNotConnectedEmbed, noSongPlayingEmbed, processingErrorEmbed } = require("../../utils/embeds");
const { successfullyLeftChannelEmbed } = require("../../utils/embeds/leave");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("leave")
        .setDescription("Destroy the song and leave the voice channel"),

    async execute({ client, interaction }) {
        try {
            if (!interaction.guildId) return;

            await interaction.deferReply();

            const voiceChannel = interaction.member.voice.channelId;

            if (!voiceChannel) {
                const embed = joinVoiceChannelEmbed();
                return interaction.editReply({ embeds: [embed]});
            }

            const player = client.lavalink.getPlayer(interaction.guildId);

            if (!player) {
                const embed = botNotConnectedEmbed();
                return interaction.editReply({ embeds: [embed]});
            }

            if (player.voiceChannelId !== voiceChannel) {
                const embed = sameVoiceChannelEmbed();
                return interaction.editReply({ embeds: [embed]});
            }

            if (!player.queue.current) {
                const embed = noSongPlayingEmbed();
                return interaction.editReply({ embeds: [embed]});
            }

            await player.destroy();

            const embed = successfullyLeftChannelEmbed(interaction.user);
            await interaction.editReply({ embeds: [embed]});

        } catch (error) {
            console.error(error);
            const embed = processingErrorEmbed();
            return safeInteractionError(interaction, { embeds: [embed] });
        }
    }
};
