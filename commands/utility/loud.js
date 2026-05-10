const {InteractionContextType, SlashCommandBuilder, AttachmentBuilder} = require('discord.js');
const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');
const {PRESETS, PRESET_CHOICES} = require('../../utils/presets');
const {getPreset} = require('../../utils/userdata');
const {measureLoudness} = require('../../utils/loudness');

const execFilePromise = promisify(execFile);

async function detectPeakDb(inputPath, prependFilter) {
	const filter = prependFilter ? `${prependFilter},volumedetect` : 'volumedetect';
	try {
		const {stderr} = await execFilePromise('ffmpeg', [
			'-i', inputPath,
			'-af', filter,
			'-f', 'null', '-',
		]);
		const match = stderr.match(/max_volume:\s+([-\d.]+)\s+dB/);
		return match ? parseFloat(match[1]) : 0;
	} catch (err) {
		if (err.stderr) {
			const match = err.stderr.match(/max_volume:\s+([-\d.]+)\s+dB/);
			if (match) return parseFloat(match[1]);
		}
		return 0;
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('loud')
		.setDescription('applies a loud processing chain to an audio file')
		.addAttachmentOption((option) =>
			option.setName('audio')
				.setDescription('the audio to make LOUD')
				.setRequired(true)
		)
		.addStringOption((option) =>
			option.setName('preset')
				.setDescription('which loud preset to use (default: amherst)')
				.setRequired(false)
				.addChoices(...PRESET_CHOICES)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		await interaction.deferReply();

		const attachment = interaction.options.getAttachment('audio');
		const presetName = interaction.options.getString('preset') ?? getPreset(interaction.user.id) ?? 'amherst';
		const preset = PRESETS[presetName];

		if (!preset) {
			return interaction.editReply(`unknown preset: ${presetName}`);
		}

		const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, {recursive: true});
		}

		const ext = path.extname(attachment.name) || '.mp3';
		const inputPath = path.join(tempDir, `loud_in_${Date.now()}${ext}`);
		const outputPath = path.join(tempDir, `loud_out_${Date.now()}.ogg`);
		const waveformPath = path.join(tempDir, `loud_wave_${Date.now()}.png`);

		try {
			await interaction.editReply('downloading file...');
			const response = await fetch(attachment.url);
			fs.writeFileSync(inputPath, Buffer.from(await response.arrayBuffer()));

			await interaction.editReply(`detecting peak for normalize pass [${presetName}]...`);
			const peakDb = await detectPeakDb(inputPath, preset.preNormFilter);
			const normalizeGain = -peakDb;

			await interaction.editReply(`applying ${presetName} chain...`);
			const fullChain = preset.buildChain(normalizeGain);

			await execFilePromise('ffmpeg', [
				'-y',
				'-i', inputPath,
				'-af', fullChain,
				'-map_metadata', '-1',
				'-fflags', '+bitexact',
				'-flags:a', '+bitexact',
				'-c:a', 'libvorbis',
				'-q:a', '6',
				'-ar', '96000',
				'-ac', '1',
				outputPath,
			]);

			await interaction.editReply('generating waveform + measuring loudness...');
			const [, loudness] = await Promise.all([
				execFilePromise('ffmpeg', [
					'-y',
					'-i', outputPath,
					'-filter_complex', '[0:a]showwavespic=s=1000x240:colors=3232C8:filter=peak[peaks];[0:a]showwavespic=s=1000x240:colors=6464DC:filter=average[rms];[peaks][rms]overlay',
					'-update', '1',
					waveformPath,
				]),
				measureLoudness(outputPath),
			]);

			const lufsTag = loudness.lufs !== null ? `${loudness.lufs.toFixed(1)} LUFS` : '?';
			const peakTag = loudness.peak !== null ? `${loudness.peak.toFixed(1)} dBFS peak` : '?';

			await interaction.editReply({
				content: `made loud [${presetName}]: ${lufsTag}, ${peakTag}`,
				files: [
					new AttachmentBuilder(outputPath, {name: 'loud_output.ogg'}),
					new AttachmentBuilder(waveformPath, {name: 'waveform.png'}),
				],
			});

			setTimeout(() => {
				if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
				if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
				if (fs.existsSync(waveformPath)) fs.unlinkSync(waveformPath);
			}, 5000);

		} catch (error) {
			console.error('loud error:', error);
			console.error('stderr:', error.stderr);
			[inputPath, outputPath, waveformPath].forEach((p) => {
				if (fs.existsSync(p)) fs.unlinkSync(p);
			});
			return interaction.editReply(`failed: ${error.message?.slice(0, 200) || 'unknown error'}`);
		}
	},
};
