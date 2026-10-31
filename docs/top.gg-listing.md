# top.gg listing for Better Airhorn v5

Copy-paste text for https://top.gg/bot/503996428042108928 → Edit. Sound counts are from production on 2026-10-31 (18,797 public sounds).

## Short description

Pick one (all under 140 characters, so none gets cut off on cards and in search):

1. **No slot limit: upload your own sounds, play long clips, pin button boards and give everyone an entrance sound.**
2. **Upload sounds, play them in voice, and pin one-click soundboards. Longer clips and more slots than Discord's built-in soundboard.**
3. **The community soundboard: over 18,000 sounds to play in voice, your own uploads, pinned button panels and entrance sounds.**

Option 1 leads with what Discord's built-in soundboard can't do, which is what most visitors want to know.

## Tags

Choose from top.gg's tag list, most relevant first: **Fun**, **Music**, **Meme**, **Utility**, **Social**. Leave out
anything else; irrelevant tags put the bot in front of people who will not invite it.

## Long description

```markdown
# Better Airhorn: a soundboard with no slot limit

Discord's built-in soundboard gives a server a handful of slots and 5 seconds per sound. Better Airhorn has no slot
limit, plays clips several minutes long, and comes with over 18,000 public sounds from the community.

## What you can do

- 🔊 `/play` searches as you type, typos included. With an empty search it suggests sounds based on your likes.
- ⬆️ `/upload` takes mp3, wav, ogg, flac, m4a and more. Trim the sound in the upload form. Every sound is
  loudness-normalised, so nothing blasts your ears.
- 🎛️ `/panel` posts a board of up to 20 buttons in any channel. One click plays the sound, and `/panel repost` brings the board back when chat buries it.
- 🚪 `/entrance` plays your sound when you join a voice channel.
- 💾 Right-click a voice message or audio file and pick **Apps → Save as sound**.
- ⭐ `/export` cuts a sound to Discord's limits and adds it to your server's built-in soundboard.
- 📤 `/share` posts a sound as a file, also in DMs once you add the app to your account.
- 🔒 You decide who can play each upload: everyone, one server, or only you.
- ❤️ Likes rank the sounds, and `/list` shows the top ones.

There is no daily play limit, and voting is never required to play.

## Getting started

1. Invite the bot and join a voice channel.
2. `/play` and start typing, or `/random` for a surprise.
3. `/upload` your first sound, then `/panel create` to pin a board for your server.

## Storage

Every user gets 250 MB (10 MB per sound), which is hours of audio. Voting for Better Airhorn here raises that to
750 MB (25 MB per sound) for 7 days.

## Privacy

Sounds are stored only to play them back; nothing is sold or shared. Read the
[Privacy Policy](https://github.com/better-airhorn/better-airhorn/blob/v5/Privacy%20Policy.md) and the
[Terms of Service](https://github.com/better-airhorn/better-airhorn/blob/v5/Terms%20of%20Service.md).
```

## Visibility beyond the text

Ordered by expected effect:

1. **Get votes.** The listing shows 0 votes this month, and top.gg ranks by votes. v5 rewards a vote with 3× the
   storage for 7 days and links the vote page whenever an upload does not fit and in `/list mine`. Also post the vote link in your
   support server and answer every new review.
2. **Keep the server count fresh.** top.gg shows 4.71K servers, but nothing has posted the count since the old
   gateway bot (`apps/bot`) was switched off, so the number is years old. v5 fixes this: voicenode posts `client.guilds.cache.size` to `POST https://top.gg/api/bots/<id>/stats` every 30
   minutes when `BOTLISTS_TOPGG` (already in the prod env file) is passed to it.
3. **New avatar and banner.** Upload `assets/branding/logo-avatar.png` as the bot avatar in the Discord developer
   portal (top.gg mirrors it), and use the wordmark on a dark background as the listing banner.
4. **Answer the open reviews.** The 2-star "is offline" review and the favourites request are still unanswered.
   Answer the favourites one with `/panel`; that is exactly what it asked for.
5. **Fill in the links:** support server, GitHub (`better-airhorn/better-airhorn`), and an invite link with the v5
   permissions (from `/invite`).
6. **Screenshots in the long description.** Once v5 runs, a screenshot of a panel and of a play card shows more
   than the text does. Upload them to the support server or the repo and embed them with `![...](url)`.
