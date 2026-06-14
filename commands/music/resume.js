const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const {
    joinVoiceChannelEmbed,
    botNotConnectedEmbed,
    sameVoiceChannelEmbed,
    noSongPlayingEmbed,
    resumePlayingEmbed,
    resumeErrorEmbed,
    alreadyPlayingEmbed,
    processingErrorEmbed
} = require("../../utils/embeds/index");

function createMusicButtons(currentTrack) {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('resume')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('pause')
                .setEmoji('⏸️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('skip')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel('Listen Here')
                .setStyle(ButtonStyle.Link)
                .setURL(currentTrack.info.uri)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('queue')
                .setLabel('View Queue')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('volume_down')
                .setLabel('🔉 Volume Down')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('volume_up')
                .setLabel("🔊 Volume Up")
                .setStyle(ButtonStyle.Secondary),
        );

    return [row1, row2];
}

async function resumeTrack({ client, interaction }) {
    try {
        if (!interaction.guildId) return;

        const voiceChannel = interaction.member.voice.channelId;
        const player = client.lavalink.getPlayer(interaction.guildId);

        // For button interactions, validate and respond immediately (like stop button)
        if (interaction.isButton()) {
            if (!voiceChannel) {
                const embed = joinVoiceChannelEmbed();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

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

            if (player.paused) {
                await interaction.deferReply({ ephemeral: true });
                await player.resume();
                const embed = resumePlayingEmbed();
                const components = createMusicButtons(player.queue.current);
                return interaction.editReply({ embeds: [embed], components });
            } else {
                const embed = alreadyPlayingEmbed();
                const components = createMusicButtons(player.queue.current);
                return interaction.reply({ embeds: [embed], components, ephemeral: true });
            }
        }

        // For slash commands, use defer/editReply pattern
        await interaction.deferReply({ephemeral: true});

        if (!voiceChannel) {
            const embed = joinVoiceChannelEmbed();
            return interaction.editReply({ embeds: [embed] });
        }

        if (!player) {
            const embed = botNotConnectedEmbed();
            return interaction.editReply({ embeds: [embed] });
        }

        if (player.voiceChannelId !== voiceChannel) {
            const embed = sameVoiceChannelEmbed();
            return interaction.editReply({ embeds: [embed] });
        }

        if (!player.queue.current) {
            const embed = noSongPlayingEmbed();
            return interaction.editReply({ embeds: [embed] });
        }

        if (player.paused) {
            try {
                await player.resume();
                const embed = resumePlayingEmbed();
                const components = createMusicButtons(player.queue.current);
                await interaction.editReply({ embeds: [embed], components });
            } catch (error) {
                console.error(error);
                const embed = resumeErrorEmbed();
                await interaction.editReply({ embeds: [embed] });
            }
        } else {
            const embed = alreadyPlayingEmbed();
            const components = createMusicButtons(player.queue.current);
            await interaction.editReply({ embeds: [embed], components });
        }
    } catch (error) {
        console.error(error);
        const embed = processingErrorEmbed();
        return interaction.editReply({ embeds: [embed] });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription("Resume the currently playing song."),
    execute: resumeTrack,
    resumeTrack, // Export the function
};
