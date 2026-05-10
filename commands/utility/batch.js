const {InteractionContextType, SlashCommandBuilder} = require('discord.js');
const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');
const {uploadAudio} = require('../../utils/roblox');
const {startMonitoring} = require('../../utils/monitor');
const {addHistory} = require('../../utils/userdata');

const execFilePromise = promisify(execFile);
const MAX_DURATION_SEC = 7 * 60;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTS = new Set(['.ogg', '.oga', '.mp3', '.wav', '.flac']);

module.exports = {
	data: new SlashCommandBuilder()
		.setName('batch')
		.setDescription('upload multiple audio files to roblox at once')
		.addAttachmentOption((o) => o.setName('audio1').setDescription('file 1').setRequired(true))
		.addAttachmentOption((o) => o.setName('audio2').setDescription('file 2').setRequired(false))
		.addAttachmentOption((o) => o.setName('audio3').setDescription('file 3').setRequired(false))
		.addAttachmentOption((o) => o.setName('audio4').setDescription('file 4').setRequired(false))
		.addAttachmentOption((o) => o.setName('audio5').setDescription('file 5').setRequired(false))
		.addBooleanOption((o) => o.setName('automonitor').setDescription('monitor moderation (default true)').setRequired(false))
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		await interaction.deferReply();

		let config;
		try {
			delete require.cache[require.resolve('../../config.json')];
			config = require('../../config.json');
		} catch { return interaction.editReply('config.json is missing or unreadable.'); }

		if (!config.robloxApiKey || !config.robloxUserId) {
			return interaction.editReply('`robloxApiKey` or `robloxUserId` missing in config.json.');
		}

		const automonitor = interaction.options.getBoolean('automonitor') ?? true;
		const attachments = [];
		for (let i = 1; i <= 5; i++) {
			const a = interaction.options.getAttachment(`audio${i}`);
			if (a) attachments.push(a);
		}

		const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, {recursive: true});

		const results = [];
		const tempFiles = [];

		for (let i = 0; i < attachments.length; i++) {
			const attachment = attachments[i];
			const ext = (path.extname(attachment.name) || '.mp3').toLowerCase();
			const name = path.basename(attachment.name, path.extname(attachment.name));

			if (!ALLOWED_EXTS.has(ext)) {
				results.push(`❌ \`${attachment.name}\`: bad format (${ext})`);
				continue;
			}
			if (attachment.size > MAX_FILE_SIZE) {
				results.push(`❌ \`${attachment.name}\`: too large`);
				continue;
			}

			const inputPath = path.join(tempDir, `batch_${Date.now()}_${i}${ext}`);
			tempFiles.push(inputPath);

			try {
				await interaction.editReply(`uploading ${i + 1}/${attachments.length}: \`${attachment.name}\`...`);
				const response = await fetch(attachment.url);
				fs.writeFileSync(inputPath, Buffer.from(await response.arrayBuffer()));

				// probe the duration so we can reject anything over 7:00
				const probe = await execFilePromise('ffprobe', [
					'-v', 'error', '-print_format', 'json', '-show_format', inputPath,
				]);
				const duration = parseFloat(JSON.parse(probe.stdout).format.duration);
				if (duration > MAX_DURATION_SEC) {
					results.push(`❌ \`${attachment.name}\`: too long (${duration.toFixed(0)}s)`);
					continue;
				}

				const result = await uploadAudio(config.robloxApiKey, config.robloxUserId, inputPath, name, name);
				results.push(`✅ \`${attachment.name}\` → \`${result.assetId}\``);

				addHistory(interaction.user.id, {
					assetId: result.assetId,
					name,
					fileName: attachment.name,
					status: 'uploaded',
				});

				if (automonitor) {
					startMonitoring(interaction, String(result.assetId), {silent: true}).catch(() => {});
				}
			} catch (err) {
				results.push(`❌ \`${attachment.name}\`: ${(err.message || String(err)).slice(0, 100)}`);
			}
		}

		// nuke temp files after a few seconds (delay so discord finishes the upload)
		setTimeout(() => {
			tempFiles.forEach((p) => { if (fs.existsSync(p)) fs.unlinkSync(p); });
		}, 5000);

		const monitorNote = automonitor ? '\n\nmonitoring all uploaded assets...' : '';
		await interaction.editReply(`**batch upload (${attachments.length} files):**\n${results.join('\n')}${monitorNote}`);
	},
};
