const {InteractionContextType, SlashCommandBuilder, MessageFlags} = require('discord.js');
const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');
const {uploadAudio} = require('../../utils/roblox');
const {startMonitoring} = require('../../utils/monitor');
const {addHistory} = require('../../utils/userdata');

const execFilePromise = promisify(execFile);

// rblx hard limits. anything over these gets rejected by the api anyway,
// we just check them on our end first to fail fast
const MAX_DURATION_SEC = 7 * 60;        // 7 minutes
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// formats rblx will actually accept
const ALLOWED_EXTS = new Set(['.ogg', '.oga', '.mp3', '.wav', '.flac']);

module.exports = {
	data: new SlashCommandBuilder()
		.setName('upload')
		.setDescription('upload an audio file to your Roblox account (Open Cloud / API key)')
		.addAttachmentOption((option) =>
			option.setName('audio')
				.setDescription('the audio file to upload')
				.setRequired(true)
		)
		.addStringOption((option) =>
			option.setName('name')
				.setDescription('display name for the asset (default: filename)')
				.setRequired(false)
		)
		.addBooleanOption((option) =>
			option.setName('automonitor')
				.setDescription('automatically monitor moderation status after upload (default: true)')
				.setRequired(false)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		// gate this command to just me. swap the id for ur own discord id if u
		// forked this. could be moved into the whitelist system but its just me
		if (interaction.user.id !== "271387672986124289") {
			return interaction.reply({
				content: "you do not have access to this command.",
				flags: MessageFlags.Ephemeral,
			});
		}

		await interaction.deferReply();

		let config;
		try {
			delete require.cache[require.resolve('../../config.json')];
			config = require('../../config.json');
		} catch (err) {
			return interaction.editReply('config.json is missing or unreadable.');
		}

		if (!config.robloxApiKey) {
			return interaction.editReply(
				'`robloxApiKey` is not set in config.json. Generate one at\n' +
				'https://create.roblox.com/dashboard/credentials'
			);
		}
		if (!config.robloxUserId) {
			return interaction.editReply(
				'`robloxUserId` is not set in config.json. Numeric user id from your Roblox profile URL.'
			);
		}

		const attachment = interaction.options.getAttachment('audio');
		const name = interaction.options.getString('name')
			?? path.basename(attachment.name, path.extname(attachment.name));
		const automonitor = interaction.options.getBoolean('automonitor') ?? true;

		const ext = (path.extname(attachment.name) || '.mp3').toLowerCase();
		if (!ALLOWED_EXTS.has(ext)) {
			return interaction.editReply(`Roblox doesn't accept ${ext}. allowed: ${[...ALLOWED_EXTS].join(', ')}.`);
		}
		if (attachment.size > MAX_FILE_SIZE) {
			return interaction.editReply(`file is ${(attachment.size / 1024 / 1024).toFixed(1)} MB. Roblox max is 20 MB.`);
		}

		const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, {recursive: true});

		const ts = Date.now();
		const inputPath = path.join(tempDir, `upload_in_${ts}${ext}`);
		let duration = 0;
		let sampleRate = 0;

		try {
			await interaction.editReply('downloading file...');
			const response = await fetch(attachment.url);
			fs.writeFileSync(inputPath, Buffer.from(await response.arrayBuffer()));

			await interaction.editReply('probing audio...');
			const probe = await execFilePromise('ffprobe', [
				'-v', 'error',
				'-print_format', 'json',
				'-show_format',
				'-show_streams',
				inputPath,
			]);
			const data = JSON.parse(probe.stdout);
			const stream = data.streams.find((s) => s.codec_type === 'audio');
			if (!stream) throw new Error('no audio stream found in file');

			sampleRate = parseInt(stream.sample_rate, 10);
			duration = parseFloat(data.format.duration);

			if (duration > MAX_DURATION_SEC) {
				return interaction.editReply(`audio is ${duration.toFixed(1)}s. Roblox max is ${MAX_DURATION_SEC}s (7 minutes).`);
			}

			await interaction.editReply(`uploading "${name}" to Roblox...`);
			const result = await uploadAudio(config.robloxApiKey, config.robloxUserId, inputPath, name, name);

			addHistory(interaction.user.id, {
				assetId: result.assetId,
				name,
				fileName: attachment.name,
				status: 'uploaded',
			});

			const minutes = Math.floor(duration / 60);
			const seconds = Math.floor(duration % 60);

			await interaction.editReply({
				content:
					`uploaded \`${attachment.name}\`\n` +
					`asset id: ${result.assetId}\n` +
					`duration: ${minutes}:${seconds.toString().padStart(2, '0')}\n` +
					`sample rate: ${sampleRate}hz\n` +
					`https://www.roblox.com/library/${result.assetId}` +
					(automonitor ? '\n\nauto-monitoring moderation status...' : ''),
			});

			setTimeout(() => {
				if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
			}, 5000);

			// Auto-monitor moderation status
			if (automonitor) {
				try {
					const monResult = await startMonitoring(interaction, String(result.assetId), {silent: true});
					if (!monResult.success) {
						await interaction.followUp(`⚠️ auto-monitor: ${monResult.reason}`);
					} else {
						await interaction.followUp(`👁️ monitoring asset \`${result.assetId}\` for moderation changes...`);
					}
				} catch (monErr) {
					console.error('auto-monitor setup error:', monErr);
					await interaction.followUp('⚠️ upload succeeded but auto-monitor failed to start.').catch(() => {});
				}
			}

		} catch (error) {
			console.error('upload error:', error);
			if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
			const msg = (error.message || String(error)).slice(0, 1500);
			return interaction.editReply(`failed: ${msg}`);
		}
	},
};
