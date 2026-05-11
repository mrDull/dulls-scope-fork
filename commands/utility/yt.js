const {InteractionContextType, SlashCommandBuilder, AttachmentBuilder} = require('discord.js');
const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');

const execFilePromise = promisify(execFile);

// only allow youtube urls. yt-dlp supports 1000+ sites but we want this
// command to be predictable (and harder to abuse).
const YT_URL_RE = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/;

// discord attachment limit for non-boosted servers
const DISCORD_FILE_LIMIT = 25 * 1024 * 1024; // 25 MB
// hard cap on yt-dlp source download (mp3 is roughly ~1/3 of the source)
const SOURCE_FILESIZE_CAP = '75M';
// hard cap on video duration in seconds (15 min)
const MAX_DURATION_SEC = 900;
// yt-dlp timeout in ms (2 min total)
const YTDLP_TIMEOUT_MS = 120000;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('yt')
		.setDescription('downloads a youtube video as an mp3')
		.addStringOption((option) =>
			option.setName('url')
				.setDescription('youtube video url (watch, shorts, or youtu.be)')
				.setRequired(true)
		)
		.addIntegerOption((option) =>
			option.setName('bitrate')
				.setDescription('mp3 bitrate in kbps (default: 192)')
				.setRequired(false)
				.addChoices(
					{name: '128 kbps (smaller file)', value: 128},
					{name: '192 kbps (default)', value: 192},
					{name: '256 kbps', value: 256},
					{name: '320 kbps (highest)', value: 320},
				)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		await interaction.deferReply();

		const url = interaction.options.getString('url');
		const bitrate = interaction.options.getInteger('bitrate') ?? 192;

		if (!YT_URL_RE.test(url)) {
			return interaction.editReply('that doesn\'t look like a youtube url. supported: youtube.com/watch?v=..., youtube.com/shorts/..., youtu.be/...');
		}

		const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, {recursive: true});
		}

		const stamp = Date.now();
		// yt-dlp appends the actual extension via the %(ext)s template
		const outputStem = path.join(tempDir, `yt_${stamp}`);
		const outputPath = `${outputStem}.mp3`;

		try {
			await interaction.editReply('downloading + converting...');

			await execFilePromise('yt-dlp', [
				'-x',                                       // extract audio
				'--audio-format', 'mp3',
				'--audio-quality', `${bitrate}K`,           // CBR bitrate
				'--no-playlist',                            // ignore &list= in url
				'--max-filesize', SOURCE_FILESIZE_CAP,      // cap source download
				'--match-filter', `duration<=${MAX_DURATION_SEC}`, // cap duration
				'-o', `${outputStem}.%(ext)s`,
				'--no-progress',
				'--quiet',
				url,
			], {
				timeout: YTDLP_TIMEOUT_MS,
				maxBuffer: 10 * 1024 * 1024,
			});

			if (!fs.existsSync(outputPath)) {
				throw new Error('output mp3 not found - yt-dlp may have skipped (duration/size cap?) or failed silently');
			}

			const stats = fs.statSync(outputPath);
			const sizeMb = (stats.size / 1024 / 1024).toFixed(1);

			if (stats.size > DISCORD_FILE_LIMIT) {
				fs.unlinkSync(outputPath);
				return interaction.editReply(`mp3 too large for discord (${sizeMb} MB > 25 MB). try a lower bitrate or a shorter video.`);
			}

			await interaction.editReply({
				content: `here u go (${bitrate} kbps, ${sizeMb} MB)`,
				files: [
					new AttachmentBuilder(outputPath, {name: 'audio.mp3'}),
				],
			});

			setTimeout(() => {
				if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
			}, 5000);

		} catch (error) {
			console.error('ytmp3 error:', error);
			console.error('stderr:', error.stderr);
			if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

			// translate common yt-dlp failure modes into friendly messages
			const stderrStr = (error.stderr || '').toString();
			const msg = error.message || 'unknown error';
			let friendlyMsg;

			if (error.code === 'ENOENT') {
				friendlyMsg = 'yt-dlp is not installed or not on PATH. ask the bot host to run: `pip install yt-dlp` (or `winget install yt-dlp`)';
			} else if (stderrStr.includes('Video unavailable')) {
				friendlyMsg = 'video unavailable (private, deleted, or region-locked)';
			} else if (stderrStr.includes('Sign in to confirm') || stderrStr.includes('age')) {
				friendlyMsg = 'video requires sign-in (probably age-restricted)';
			} else if (stderrStr.includes('max-filesize') || stderrStr.includes('match_filter') || stderrStr.includes('does not pass filter')) {
				friendlyMsg = `video too long (>${MAX_DURATION_SEC / 60} min) or source file too big (>${SOURCE_FILESIZE_CAP})`;
			} else if (error.killed || error.signal === 'SIGTERM' || msg.includes('timeout')) {
				friendlyMsg = `timed out after ${YTDLP_TIMEOUT_MS / 1000}s. video might be too big or yt-dlp is having a slow day`;
			} else {
				const tail = stderrStr.slice(-180) || msg.slice(0, 200);
				friendlyMsg = `failed: ${tail}`;
			}

			return interaction.editReply(friendlyMsg);
		}
	},
};
