const { EmbedBuilder } = require('discord.js');
const customEmoji = '✅'; // Using a hardcoded emoji for simplicity

function addedToQueueEmbed(item, count) { // 'item' can be track object OR playlist name (string)
    const embed = new EmbedBuilder()
        .setColor(0x00ff00); // Green color

    if (typeof item === 'string') { // It's a playlist name
        embed.setDescription(`${customEmoji} Added **${count} tracks** from **${item}** to the queue!`);
    } else { // It's a single track object
        embed.setDescription(`${customEmoji} Added **[${item.info.title || 'Unknown Title'}](${item.info.uri || '#'})** to the queue!`);
    }
    return embed;
}

module.exports = addedToQueueEmbed;
