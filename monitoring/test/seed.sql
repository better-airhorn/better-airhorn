-- Fake data for the local test stack, shaped like production: usages since 60 days ago with /play args holding a
-- sound id (v5), a sound name (v4) or no JSON at all, the plays log only for the last 3 days, and a stray `setting`
-- table the read-only role must not see.
\set ON_ERROR_STOP 1

INSERT INTO sound_commands (name, guild, "user", "accessType", duration, size, uses, "lastUsedAt", "createdAt")
SELECT 'sound-' || i, 'g' || (i % 20), 'u' || (i % 50), 1 + i % 3,
       CASE WHEN i % 25 = 0 THEN 0 ELSE 500 + i * 37 % 9000 END, 20000 + i * 7919 % 400000,
       CASE WHEN i % 4 = 0 THEN 0 ELSE i % 300 END,
       now() - (i % 200) * interval '1 day', now() - (i * 3) * interval '1 day'
FROM generate_series(1, 300) i;

INSERT INTO usages ("createdAt", command, "user", guild, args)
SELECT now() - random() * interval '60 days',
       (ARRAY['play', 'play', 'play', 'random', 'upload', 'list', 'panel', 'config'])[1 + i % 8],
       'u' || (i % 70), CASE WHEN i % 40 = 0 THEN NULL ELSE 'g' || (i % 25) END,
       CASE WHEN i % 9 = 0 THEN 'sound-' || (i % 300 + 1)
            WHEN i % 5 = 0 THEN json_build_object('sound', 'sound-' || (i % 300 + 1))::text
            ELSE json_build_object('sound', (i % 300 + 1)::text)::text END
FROM generate_series(1, 3000) i;

INSERT INTO plays ("soundId", guild, "user", source, "createdAt")
SELECT 1 + i % 300, 'g' || (i % 25), 'u' || (i % 60),
       (ARRAY['command', 'panel', 'button', 'quiz', 'entrance', 'exit', 'stream'])[1 + i % 7],
       now() - random() * interval '3 days'
FROM generate_series(1, 800) i;

INSERT INTO likes ("createdAt", "user", "soundCommandId")
SELECT now() - random() * interval '60 days', 'u' || i, 1 + i % 300 FROM generate_series(1, 400) i;

INSERT INTO blvotes ("user", "createdAt", list)
SELECT 'u' || i, now() - random() * interval '20 days', 0 FROM generate_series(1, 30) i;

INSERT INTO guild_settings (guild, "leaveAfterPlay", "sendMessageAfterPlay", "entranceSounds", "maxSoundSeconds",
                            "quietStart", "quietEnd", "serverSoundsOnly", "playRole")
SELECT 'g' || i, i % 3 = 0, i % 4 <> 0, i % 5 <> 0, CASE WHEN i % 6 = 0 THEN 10 END,
       CASE WHEN i % 7 = 0 THEN 1380 END, CASE WHEN i % 7 = 0 THEN 420 END, i % 8 = 0, CASE WHEN i % 9 = 0 THEN 'r' || i END
FROM generate_series(0, 24) i;

INSERT INTO entrance_sounds (guild, "user", kind, "soundId")
SELECT 'g' || (i % 10), 'u' || i, (ARRAY['join', 'leave', 'stream'])[1 + i % 3], 1 + i FROM generate_series(1, 40) i;

INSERT INTO soundboard_panels (guild, channel, message, title, sounds, "createdBy")
SELECT 'g' || (i % 6), 'c' || i, 'm' || i, 'Panel ' || i, ARRAY[1, 2, 3], 'u' || i FROM generate_series(1, 9) i;

INSERT INTO blocked_sounds (guild, "soundId", "blockedBy")
SELECT 'g' || (i % 4), 1 + i, 'u1' FROM generate_series(1, 12) i;

CREATE TABLE setting (key varchar PRIMARY KEY, value text);
INSERT INTO setting VALUES ('admin-email', 'nobody@example.com');
