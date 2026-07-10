const { MessageFlags } = require("discord.js");

const EPHEMERAL_FLAG = MessageFlags.Ephemeral;

function getVoiceControlError(interaction, player) {
    if (!player) return "No player found!";

    const memberVoiceChannelId = interaction.member?.voice?.channelId;
    if (!memberVoiceChannelId) return "Join a voice channel before using music controls.";
    if (player.voiceChannelId !== memberVoiceChannelId) {
        return "You must be in the same voice channel as the bot.";
    }
    return null;
}

function isUnknownInteraction(error) {
    return error?.code === 10062 || error?.rawError?.code === 10062;
}

async function replyEphemeral(interaction, payload) {
    const response = typeof payload === "string" ? { content: payload } : { ...payload };
    response.flags = EPHEMERAL_FLAG;

    if (interaction.replied || interaction.deferred) {
        return interaction.followUp(response);
    }
    return interaction.reply(response);
}

async function safeInteractionError(interaction, payload, logger = console) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(payload);
        } else {
            await replyEphemeral(interaction, payload);
        }
        return true;
    } catch (error) {
        if (!isUnknownInteraction(error)) {
            logger.error("Could not send interaction error response:", error);
        }
        return false;
    }
}

module.exports = {
    EPHEMERAL_FLAG,
    getVoiceControlError,
    isUnknownInteraction,
    replyEphemeral,
    safeInteractionError,
};
