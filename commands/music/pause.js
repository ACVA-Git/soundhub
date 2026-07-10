const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { EPHEMERAL_FLAG, safeInteractionError } = require('../../utils/interactions');
const {
    joinVoiceChannelEmbed,
    botNotConnectedEmbed,
    sameVoiceChannelEmbed,
    noSongPlayingEmbed,
    pausedPlayingEmbed,
    pauseErrorEmbed,
    alreadyPausedEmbed,
    processingErrorEmbed
} = require("../../utils/embeds/index")

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

async function pauseTrack({ client, interaction }) {
    try {
        if (!interaction.guildId) return;

        const voiceChannel = interaction.member.voice.channelId;
        const player = client.lavalink.getPlayer(interaction.guildId);

        // For button interactions, validate and respond immediately (like stop button)
        if (interaction.isButton()) {
            if (!voiceChannel) {
                const embed = joinVoiceChannelEmbed()
                return interaction.reply({embeds: [embed], flags: EPHEMERAL_FLAG});
            }

            if (!player) {
                const embed = botNotConnectedEmbed()
                return interaction.reply({embeds:[embed], flags: EPHEMERAL_FLAG});
            }

            if (player.voiceChannelId !== voiceChannel) {
                const embed = sameVoiceChannelEmbed()
                return interaction.reply({embeds:[embed], flags: EPHEMERAL_FLAG});
            }

            if (!player.queue.current) {
                const embed = noSongPlayingEmbed()
                return interaction.reply({embeds:[embed], flags: EPHEMERAL_FLAG});
            }

            if (!player.paused) {
                await interaction.deferReply({ flags: EPHEMERAL_FLAG });
                await player.pause();
                const embed = pausedPlayingEmbed();
                const components = createMusicButtons(player.queue.current);
                return interaction.editReply({embeds:[embed], components});
            } else {
                const embed = alreadyPausedEmbed();
                const components = createMusicButtons(player.queue.current);
                return interaction.reply({embeds:[embed], components, flags: EPHEMERAL_FLAG});
            }
        }

        // For slash commands, use defer/editReply pattern
        await interaction.deferReply({flags: EPHEMERAL_FLAG});

        if (!voiceChannel) {
            const embed = joinVoiceChannelEmbed()
            return interaction.editReply({embeds: [embed]});
        }

        if (!player) {
            const embed = botNotConnectedEmbed()
            return interaction.editReply({embeds:[embed]});
        }

        if (player.voiceChannelId !== voiceChannel) {
            const embed = sameVoiceChannelEmbed()
            return interaction.editReply({embeds:[embed]});
        }

        if (!player.queue.current) {
            const embed = noSongPlayingEmbed()
            return interaction.editReply({embeds:[embed]});
        }

        if (!player.paused) {
            try {
                await player.pause();
                const embed = pausedPlayingEmbed();
                const components = createMusicButtons(player.queue.current);
                await interaction.editReply({embeds:[embed], components});
            } catch (error) {
                console.error(error);
                const embed = pauseErrorEmbed()
                await interaction.editReply({embeds:[embed]});
            }
        } else {
            const embed = alreadyPausedEmbed();
            const components = createMusicButtons(player.queue.current);
            await interaction.editReply({embeds:[embed], components});
        }
    } catch (error) {
        console.error(error);
        const embed = processingErrorEmbed()
        return safeInteractionError(interaction, {embeds:[embed]});
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("Pause the currently playing song."),
    execute: pauseTrack,
    pauseTrack, // Export the function
};
