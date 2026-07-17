const test = require('node:test');
const assert = require('node:assert/strict');

const {
    chooseRadioSeed,
    getRadioSession,
    refillRadio,
    spotifyTrackIdFromUrl,
    startRadio,
    stopRadio,
} = require('../utils/radio');

function track(identifier, title = identifier) {
    return { info: { identifier, title, author: 'Artist' } };
}

test('Spotify track URLs yield their seed identifier', () => {
    assert.equal(
        spotifyTrackIdFromUrl('https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8?si=abc'),
        '4PTG3Z6ehGkBFwjybzWkR8'
    );
    assert.equal(spotifyTrackIdFromUrl('https://open.spotify.com/playlist/abc'), null);
});

test('radio favors an original YouTube Music match and rejects altered variants', () => {
    const source = { info: { title: 'Midnight City', author: 'M83' } };
    const selected = chooseRadioSeed([
        track('aaaaaaaaaaa', 'Midnight City (Slowed + Reverb)'),
        { info: { identifier: 'bbbbbbbbbbb', title: 'Midnight City', author: 'M83' } },
        track('ccccccccccc', 'Midnight City (Nightcore)'),
    ], source);

    assert.equal(selected.info.identifier, 'bbbbbbbbbbb');
});

test('radio queues only new related tracks and refills a short queue', async () => {
    const guildId = 'radio-test-guild';
    const seed = 'dQw4w9WgXcQ';
    const calls = [];
    const player = {
        guildId,
        queue: {
            current: track('current'),
            tracks: [track('already')],
            add(items) { this.tracks.push(...items); },
        },
        async search(query) {
            calls.push(query);
            return {
                tracks: [
                    track('current'),
                    track('already'),
                    track('new-1'),
                    track('new-2'),
                    track('new-3', 'New 3 (Slowed + Reverb)'),
                ],
            };
        },
    };

    const added = await startRadio(player, seed, { id: 'requester' }, track('seed-track', 'Seed Song'));
    assert.equal(added, 2);
    assert.equal(getRadioSession(guildId).seedVideoId, seed);
    assert.deepEqual(calls[0], { query: `https://www.youtube.com/watch?v=${seed}&list=RD${seed}` });
    assert.deepEqual(player.queue.tracks.map(item => item.info.identifier), ['already', 'new-1', 'new-2']);

    player.queue.tracks = [track('new-1')];
    assert.equal(await refillRadio(player), 0, 'already-played recommendations are not repeated');
    assert.equal(stopRadio(guildId), true);
    assert.equal(getRadioSession(guildId), null);
});

test('radio excludes the seed track and title-equivalent uploads', async () => {
    const guildId = 'seed-filter-test-guild';
    const seed = 'dQw4w9WgXcQ';
    const player = {
        guildId,
        queue: { current: null, tracks: [], add(items) { this.tracks.push(...items); } },
        async search() {
            return {
                tracks: [
                    { info: { identifier: seed, title: 'Different Upload', author: 'Artist' } },
                    track('other-upload', 'Seed Song (Official Audio)'),
                    track('different-song', 'Actually Different Song'),
                ],
            };
        },
    };

    assert.equal(await startRadio(player, seed, { id: 'requester' }, track('seed-track', 'Seed Song')), 1);
    assert.deepEqual(player.queue.tracks.map(item => item.info.identifier), ['different-song']);
    stopRadio(guildId);
});
