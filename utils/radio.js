const RADIO_QUEUE_TARGET = 8;
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const UNDESIRED_VARIANT = /\b(slowed(?:\s*(?:\+|and)\s*reverb)?|sped\s*up|nightcore|remix|cover|karaoke|8d|bass\s*boost(?:ed)?|instrumental|live)\b/i;

// Radio state is deliberately in memory: a radio session belongs to the current
// voice player and should end if the bot or player is restarted.
const radioSessions = new Map();

function trackKey(track) {
    const info = track?.info || {};
    return String(
        info.uri || info.identifier || `${info.title || ""}-${info.author || ""}`
    ).trim().toLowerCase();
}

function isUndesiredVariant(track) {
    const info = track?.info || {};
    return UNDESIRED_VARIANT.test(`${info.title || ""} ${info.author || ""}`);
}

function words(value) {
    return new Set(
        String(value || "").toLowerCase().match(/[a-z0-9]+/g)?.filter(word => word.length > 2) || []
    );
}

function sharedWordCount(first, second) {
    let count = 0;
    for (const word of first) if (second.has(word)) count += 1;
    return count;
}

function normalizedTitle(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
        .replace(/\b(official|audio|video|lyrics?|remaster(?:ed)?|visuali[sz]er|hd|4k)\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function isSeedTrack(track, session) {
    if (track?.info?.identifier === session.seedVideoId) return true;
    const candidateTitle = normalizedTitle(track?.info?.title);
    return Boolean(candidateTitle && session.seedTitle && candidateTitle === session.seedTitle);
}

function chooseRadioSeed(tracks, sourceTrack) {
    const sourceTitleWords = words(sourceTrack?.info?.title);
    const sourceAuthorWords = words(sourceTrack?.info?.author);

    const candidates = (tracks || []).filter(track =>
        isYouTubeVideoId(track?.info?.identifier) && !isUndesiredVariant(track)
    );
    if (!candidates.length) return null;

    return candidates
        .map(track => ({
            track,
            score: sharedWordCount(sourceTitleWords, words(track.info.title)) * 10
                + sharedWordCount(sourceAuthorWords, words(track.info.author)) * 6,
        }))
        .sort((first, second) => second.score - first.score)[0].track;
}

function queuedTrackKeys(player) {
    const tracks = [player.queue?.current, ...(player.queue?.tracks || [])];
    return new Set(tracks.map(trackKey).filter(Boolean));
}

function isYouTubeVideoId(value) {
    return YOUTUBE_VIDEO_ID.test(value || "");
}

function spotifyTrackIdFromUrl(value) {
    const match = String(value || "").match(
        /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})(?:[/?].*)?$/i
    );
    return match?.[1] || null;
}

function getRadioSession(guildId) {
    return radioSessions.get(guildId) || null;
}

function stopRadio(guildId) {
    return radioSessions.delete(guildId);
}

async function refillRadio(player, { target = RADIO_QUEUE_TARGET } = {}) {
    const session = getRadioSession(player.guildId);
    if (!session || session.refilling) return 0;

    const queuedTracks = player.queue?.tracks || [];
    if (queuedTracks.length >= target) return 0;

    session.refilling = true;
    try {
        const response = await player.search({
            // YouTube Music's RD playlist is its generated mix for the seed
            // video. It works with the host's installed YouTube plugin and
            // does not depend on Spotify's restricted recommendation API.
            query: `https://www.youtube.com/watch?v=${session.seedVideoId}&list=RD${session.seedVideoId}`,
        }, session.requester);
        const knownTracks = queuedTrackKeys(player);
        const needed = target - queuedTracks.length;
        const additions = [];

        for (const track of response?.tracks || []) {
            const key = trackKey(track);
            if (
                !key
                || isSeedTrack(track, session)
                || isUndesiredVariant(track)
                || knownTracks.has(key)
                || session.playedTrackKeys.has(key)
            ) continue;

            knownTracks.add(key);
            session.playedTrackKeys.add(key);
            additions.push(track);
            if (additions.length === needed) break;
        }

        if (additions.length) player.queue.add(additions);
        return additions.length;
    } catch (error) {
        console.error(`[Radio] Could not refill radio for guild ${player.guildId}:`, error);
        return 0;
    } finally {
        session.refilling = false;
    }
}

async function startRadio(player, seedVideoId, requester, sourceTrack = null) {
    if (!isYouTubeVideoId(seedVideoId)) {
        throw new Error("Radio needs a YouTube Music seed video ID.");
    }

    const session = {
        seedVideoId,
        seedTitle: normalizedTitle(sourceTrack?.info?.title),
        requester,
        playedTrackKeys: queuedTrackKeys(player),
        refilling: false,
    };
    radioSessions.set(player.guildId, session);

    const added = await refillRadio(player);
    if (!added) {
        radioSessions.delete(player.guildId);
        throw new Error("No related tracks were available for that seed.");
    }
    return added;
}

module.exports = {
    RADIO_QUEUE_TARGET,
    getRadioSession,
    isYouTubeVideoId,
    isUndesiredVariant,
    isSeedTrack,
    chooseRadioSeed,
    refillRadio,
    spotifyTrackIdFromUrl,
    startRadio,
    stopRadio,
    trackKey,
};
