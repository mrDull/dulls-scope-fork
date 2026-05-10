const {InteractionContextType, SlashCommandBuilder, AttachmentBuilder} = require('discord.js');
const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');
const {PRESETS} = require('../../utils/presets');
const {measureLoudness} = require('../../utils/loudness');

const execFilePromise = promisify(execFile);

async function detectPeakDb(inputPath, prependFilter) {
	const filter = prependFilter ? `${prependFilter},volumedetect` : 'volumedetect';
	try {
		const {stderr} = await execFilePromise('ffmpeg', [
			'-i', inputPath, '-af', filter, '-f', 'null', '-',
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
		.setName('compare')
		.setDescription('run all loud presets on one file and compare results')
		.addAttachmentOption((o) =>
			o.setName('audio').setDescription('the audio to compare').setRequired(true)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		await interaction.deferReply();

		const attachment = interaction.options.getAttachment('audio');
		const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, {recursive: true});

		const ts = Date.now();
		const ext = path.extname(attachment.name) || '.mp3';
		const inputPath = path.join(tempDir, `cmp_in_${ts}${ext}`);
		const tempFiles = [inputPath];

		try {
			await interaction.editReply('downloading file...');
			const response = await fetch(attachment.url);
			fs.writeFileSync(inputPath, Buffer.from(await response.arrayBuffer()));

			const presetNames = Object.keys(PRESETS);
			const results = [];
			const audioFiles = [];
			const waveFiles = [];

			// loop every preset and process the input through each one
			for (let i = 0; i < presetNames.length; i++) {
				const name = presetNames[i];
				const preset = PRESETS[name];
				const outPath = path.join(tempDir, `cmp_${name}_${ts}.ogg`);
				const wavePath = path.join(tempDir, `cmp_wave_${name}_${ts}.png`);
				tempFiles.push(outPath, wavePath);

				await interaction.editReply(`processing ${i + 1}/${presetNames.length}: **${name}**...`);

				// detect peak first, then build the chain w/ the right normalize gain
				const peakDb = await detectPeakDb(inputPath, preset.preNormFilter);
				const chain = preset.buildChain(-peakDb);

				// run the chain on the input. output is ogg vorbis to match /loud
				await execFilePromise('ffmpeg', [
					'-y', '-i', inputPath,
					'-af', chain,
					'-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
					'-c:a', 'libvorbis', '-q:a', '6', '-ar', '96000', '-ac', '1',
					outPath,
				]);

				// grab the LUFS + true peak so we can tag em in the comparison
				const loudness = await measureLoudness(outPath);

				// render the waveform. shorter height (120px) 
				await execFilePromise('ffmpeg', [
					'-y', '-i', outPath,
					'-filter_complex',
					'[0:a]showwavespic=s=1000x120:colors=3232C8:filter=peak[p];[0:a]showwavespic=s=1000x120:colors=6464DC:filter=average[r];[p][r]overlay',
					'-update', '1', wavePath,
				]);

				results.push({
					name,
					lufs: loudness.lufs,
					peak: loudness.peak,
				});
				audioFiles.push(outPath);
				waveFiles.push(wavePath);
			}

			// stack every waveform image into one tall PNG (vstack filter)
			await interaction.editReply('building comparison...');
			const combinedPath = path.join(tempDir, `cmp_combined_${ts}.png`);
			tempFiles.push(combinedPath);

			const vstackArgs = [];
			waveFiles.forEach((w) => { vstackArgs.push('-i', w); });
			const vstackChain = waveFiles.map((_, i) => `[${i}]`).join('') +
				`vstack=inputs=${waveFiles.length}`;
			vstackArgs.push(
				'-filter_complex', vstackChain,
				'-y', combinedPath,
			);
			await execFilePromise('ffmpeg', vstackArgs);

			// build the per-preset text summary
			const lines = results.map((r) => {
				const lufs = r.lufs !== null ? `${r.lufs.toFixed(1)} LUFS` : '?';
				const peak = r.peak !== null ? `${r.peak.toFixed(1)} dBFS peak` : '?';
				return `**${r.name}**: ${lufs}, ${peak}`;
			});

			const files = [
				new AttachmentBuilder(combinedPath, {name: 'comparison.png'}),
				...audioFiles.map((p, i) =>
					new AttachmentBuilder(p, {name: `${results[i].name}.ogg`})
				),
			];

			await interaction.editReply({
				content: `**preset comparison** (top to bottom):\n${lines.join('\n')}`,
				files,
			});

			setTimeout(() => {
				tempFiles.forEach((p) => { if (fs.existsSync(p)) fs.unlinkSync(p); });
			}, 10000);

		} catch (error) {
			console.error('compare error:', error);
			console.error('stderr:', error.stderr);
			return interaction.editReply(`failed: ${error.message?.slice(0, 200) || 'unknown error'}`);
		}
	},
};
