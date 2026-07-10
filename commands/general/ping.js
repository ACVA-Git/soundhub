const { SlashCommandBuilder } = require("discord.js");
const { EPHEMERAL_FLAG } = require('../../utils/interactions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong! 🏓"),
    execute: async ({ interaction }) => {
        // Responder al usuario
        await interaction.reply({
            content: "Pong! 🏓",
            flags: EPHEMERAL_FLAG,
        });
    },
};
