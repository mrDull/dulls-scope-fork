# scope (dull's fork)

discord bot for messing with audio through ffmpeg. all the actual code and design is by [@typicaalusername](https://github.com/typicaalusername) and Turtwig, go check out the [original repo](https://github.com/typicaalusername/scope), thats the real one.

this fork is just me reading through it and dropping casual comments inline so i (and anyone else cloning this) can follow whats going on. most of this here is work of typicalusername and turtwig, i added some cmds and js tidied up a biot. its the same scope with notes in the margins basically. also threw in a `.gitignore` and example config files so its easier to spin up locally.

mostly using this as a way to learn ffmpeg filter chains, audio normalization, spectral editing, and how a discord bot wires up slash commands. not a copyright tool, dont be weird with it.

## what it does

audio processing:

- `/loud` runs a loud chain on a file. pick from 6 presets: `amherst`, `faceslasha`, `angel`, `dollydrugs`, `clean`, `cleansafe` (cleansafe is the new one, targets ~-10 LUFS with a hard ceiling at -1.5 dBFS so it never peaks)
- `/yt` downloads a youtube video as an mp3 (optional bitrate: 128/192/256/320 kbps, default 192). caps duration at 15 min. pairs nicely with /loud
- `/compare` runs every preset on the same file at once so u can a/b them
- `/analyze` duration, bitrate, sample rate, LUFS, peak, waveform image
- `/roblox` runs your file through 2 ogg vorbis passes to simulate what rblx does on upload
- `/cr` spectral notch filter (anequalizer hole) with optional speed shift
- `/intro` prepend an intro audio
- `/bait` prepend a bait audio with optional pitch shift
- `/endbait` append a hard limited endbait (looped to 6:59)
- `/full` bait + intro + audio (+ optional loud chain) + optional endbait, one shot

roblox stuff:

- `/upload` upload audio to roblox via open cloud
- `/batch` upload up to 5 audios at once
- `/lookup` fetch info + download for any rblx asset id
- `/monitor` poll moderation status until it changes
- `/notify` dm u when a roblox artist drops a new release
- `/history` your recent uploads

utility:

- `/setpreset` set your default `/loud` preset
- `/whitelist` and `/blacklist` owner only access control
- `/ping` system info

## setup

u need:

- [node.js](https://nodejs.org/en/download), any recent LTS
- [ffmpeg](https://www.ffmpeg.org/download.html) on your PATH. older builds are buggy with the waveform/spectrogram filters so get a recent one
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your PATH if u want `/yt` to work. install via `pip install -U yt-dlp` or `winget install yt-dlp.yt-dlp` or just grab the .exe from the releases page. verify with `yt-dlp --version`. without it, `/yt` will just reply with a friendly error and the rest of the bot still works fine

clone + install:

```
git clone https://github.com/mrDull/dulls-scope-fork.git
cd dulls-scope-fork
npm install
```

copy the example files and fill in your own values:

```
copy config.example.json config.json
copy .env.example .env
```

what goes in `config.json`:

- `token` is your discord bot token. make a bot at [discord.com/developers/applications](https://discord.com/developers/applications)
- `clientId` is your bot's application id (same page)
- `guildId` is optional. only needed if u switch deploy-commands.js to guild scoped for testing
- `robloxApiKey` is an open cloud api key from [create.roblox.com/dashboard/credentials](https://create.roblox.com/dashboard/credentials). needs `Assets API` with `asset:read` + `asset:write`
- `robloxUserId` is your numeric roblox user id (from your profile url)

what goes in `.env`:

- `ROBLOX_COOKIE` is your `.ROBLOSECURITY` cookie. only needed for `/notify` and `/lookup`. this is account level auth, do NOT leak it.

set urself as the owner. make `utils/owners.json` with your discord user id like this:

```json
["YOUR_DISCORD_ID"]
```

get ur discord id by right clicking ur name with developer mode on. the bot uses owners.json to gate `/whitelist`, `/blacklist`, etc.

deploy the slash commands to discord (only re-run this when u change a command's name, description, or options. NOT when u change the code inside `execute`):

```
node deploy-commands.js
```

run the bot:

```
node index.js
```

## stuff worth reading if ur trying to learn

- `utils/presets.js` every loud preset is a different ffmpeg filter chain with comments breaking down what each stage does (eq, compressor, limiter, etc)
- `commands/utility/cr.js` anequalizer notch filter, asetrate pitch shifting
- `commands/utility/full.js` multi input filter graph that concatenates audio with different processing per source
- `commands/utility/analyze.js` using ebur128 for LUFS / true peak measurement
- `utils/roblox.js` uploading assets through roblox open cloud (multipart + operation polling)
- `utils/monitor.js` polling pattern for an async moderation api

## credits

- original [scope](https://github.com/typicaalusername/scope) by [@typicaalusername](https://github.com/typicaalusername) and Turtwig (@wiimenu)
- inspired by 2slimey ([spotify](https://open.spotify.com/artist/0ZXbQLu4a7sk3iQ8tlgFy4))
- originally made as a contribution to Project: Numlock

## license

[GNU GPL v3.0](https://choosealicense.com/licenses/gpl-3.0/), same as the original. do whatever, just credit where its due.
