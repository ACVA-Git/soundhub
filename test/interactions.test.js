const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');

const {
    getVoiceControlError,
    isUnknownInteraction,
    replyEphemeral,
    safeInteractionError,
} = require('../utils/interactions');

test('voice controls require a player and the same voice channel', () => {
    const interaction = { member: { voice: { channelId: null } } };
    assert.equal(getVoiceControlError(interaction, null), 'No player found!');
    assert.match(getVoiceControlError(interaction, { voiceChannelId: 'one' }), /Join a voice channel/);

    interaction.member.voice.channelId = 'two';
    assert.match(getVoiceControlError(interaction, { voiceChannelId: 'one' }), /same voice channel/);

    interaction.member.voice.channelId = 'one';
    assert.equal(getVoiceControlError(interaction, { voiceChannelId: 'one' }), null);
});

test('ephemeral replies use flags and follow up after acknowledgement', async () => {
    const calls = [];
    const fresh = {
        replied: false,
        deferred: false,
        reply: async payload => calls.push(['reply', payload]),
    };
    await replyEphemeral(fresh, 'hello');
    assert.equal(calls[0][0], 'reply');
    assert.equal(calls[0][1].flags, MessageFlags.Ephemeral);

    const acknowledged = {
        replied: true,
        deferred: false,
        followUp: async payload => calls.push(['followUp', payload]),
    };
    await replyEphemeral(acknowledged, { content: 'again' });
    assert.equal(calls[1][0], 'followUp');
    assert.equal(calls[1][1].flags, MessageFlags.Ephemeral);
});

test('unknown/stale interaction errors are contained', async () => {
    const logged = [];
    const logger = { error: (...args) => logged.push(args) };
    const interaction = {
        replied: false,
        deferred: false,
        reply: async () => {
            const error = new Error('Unknown interaction');
            error.code = 10062;
            throw error;
        },
    };

    assert.equal(isUnknownInteraction({ rawError: { code: 10062 } }), true);
    assert.equal(await safeInteractionError(interaction, { content: 'error' }, logger), false);
    assert.deepEqual(logged, []);
});
