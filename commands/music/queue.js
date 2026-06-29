const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

async function displayQueue({ client, interaction }) {
  try {
    if (!interaction.guildId) return;

    const voiceChannel = interaction.member.voice.channelId;
    const player = client.lavalink.getPlayer(interaction.guildId);

    // For button interactions, validate and respond immediately (like stop button)
    if (interaction.isButton()) {
      if (!player) {
        return interaction.reply({ content: "There is no queue.", ephemeral: true });
      }

      if (player.voiceChannelId !== voiceChannel) {
        return interaction.reply({ content: "You must be in the same voice channel as the bot.", ephemeral: true });
      }

      if (!player.queue || !player.queue.current) {
        return interaction.reply({ content: "There are no songs playing right now.", ephemeral: true });
      }

      const currentTrack = player.queue.current;
      const tracksInQueue = player.queue.tracks || [];
      const maxTracksToShow = 10;
      const tracksToDisplay = tracksInQueue.slice(0, maxTracksToShow);
      const remainingTracks = tracksInQueue.length - maxTracksToShow;

      let upNextValue = tracksToDisplay.length > 0
        ? tracksToDisplay.map((track, index) => `${index + 1}. \`${track.info.title}\``).join("\n")
        : "No more tracks in the queue.";

      if (remainingTracks > 0) {
        upNextValue += `\n\n*...and ${remainingTracks} more track${remainingTracks > 1 ? 's' : ''} in the queue*`;
      }

      const embed = {
        color: 12745742,
        title: `Current Song Queue (${tracksInQueue.length} track${tracksInQueue.length !== 1 ? 's' : ''})`,
        fields: [
          {
            name: "Now Playing",
            value: `🎶 **\`${currentTrack.info.title}\`**`,
          },
          {
            name: "Up Next",
            value: upNextValue,
          },
        ],
      };

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('clear_queue')
            .setLabel('Clear Queue')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('shuffle_queue')
            .setLabel('Shuffle Queue')
            .setStyle(ButtonStyle.Primary)
        );

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // For slash commands, use defer/editReply pattern
    await interaction.deferReply({ephemeral: true});

    if (!player) {
      return interaction.editReply("There is no queue.");
    }

    if (player.voiceChannelId !== voiceChannel) {
      return interaction.editReply("You must be in the same voice channel as the bot.");
    }

    if (!player.queue || !player.queue.current) {
      return interaction.editReply("There are no songs playing right now.");
    }

    const currentTrack = player.queue.current;
    const tracksInQueue = player.queue.tracks || [];
    const maxTracksToShow = 10;
    const tracksToDisplay = tracksInQueue.slice(0, maxTracksToShow);
    const remainingTracks = tracksInQueue.length - maxTracksToShow;

    let upNextValue = tracksToDisplay.length > 0
      ? tracksToDisplay.map((track, index) => `${index + 1}. \`${track.info.title}\``).join("\n")
      : "No more tracks in the queue.";

    if (remainingTracks > 0) {
      upNextValue += `\n\n*...and ${remainingTracks} more track${remainingTracks > 1 ? 's' : ''} in the queue*`;
    }

    // Create an embed to display the queue
    const embed = {
      color: 12745742,
      title: `Current Song Queue (${tracksInQueue.length} track${tracksInQueue.length !== 1 ? 's' : ''})`,
      fields: [
        {
          name: "Now Playing",
          value: `🎶 **\`${player.queue.current.info.title}\`**`,
        },
        {
          name: "Up Next",
          value: upNextValue,
        },
      ],
    };

    // Create action row with buttons
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('clear_queue')
          .setLabel('Clear Queue')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('shuffle_queue')
          .setLabel('Shuffle Queue')
          .setStyle(ButtonStyle.Primary)
      );

    // Reply with the embed
    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error(error);
    return interaction.editReply(
      "An error occurred while processing the command."
    );
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Display the current song queue"),
  execute: displayQueue,
  displayQueue,
}
