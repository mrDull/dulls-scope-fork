const {InteractionContextType, SlashCommandBuilder, AttachmentBuilder} = require('discord.js');
const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');

const execFilePromise = promisify(execFile);

module.exports = {
	data: new SlashCommandBuilder()
		.setName('intro')
		.setDescription('prepends an intro audio to the front of a main audio (intro then audio, hard cut)')
		.addAttachmentOption((option) =>
			option.setName('intro')
				.setDescription('the intro audio (goes first)')
				.setRequired(true)
		)
		.addAttachmentOption((option) =>
			option.setName('audio')
				.setDescription('the main audio (goes after intro)')
				.setRequired(true)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		await interaction.deferReply();

		const introAttachment = interaction.options.getAttachment('intro');
		const audioAttachment = interaction.options.getAttachment('audio');

		const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, {recursive: true});
		}

		const introExt = path.extname(introAttachment.name) || '.mp3';
		const audioExt = path.extname(audioAttachment.name) || '.mp3';
		const introInputPath = path.join(tempDir, `intro_in_${Date.now()}${introExt}`);
		const audioInputPath = path.join(tempDir, `intro_audio_${Date.now()}${audioExt}`);
		const outputPath = path.join(tempDir, `intro_out_${Date.now()}.ogg`);
		const waveformPath = path.join(tempDir, `intro_wave_${Date.now()}.png`);

		try {
			await interaction.editReply('downloading files...');
			const [introResp, audioResp] = await Promise.all([
				fetch(introAttachment.url),
				fetch(audioAttachment.url),
			]);
			fs.writeFileSync(introInputPath, Buffer.from(await introResp.arrayBuffer()));
			fs.writeFileSync(audioInputPath, Buffer.from(await audioResp.arrayBuffer()));

			await interaction.editReply('combining...');

			// ffmpeg filter graph:
			//   take intro and main, resample both to 96khz mono fltp, then
			//   concat them into one stream called [out]. -ac/-ar later make
			//   sure the output is consistent regardless of source files
			const filter = `[0:a]aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp[a0];[1:a]aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp[a1];[a0][a1]concat=n=2:v=0:a=1[out]`;

			await execFilePromise('ffmpeg', [
				'-y',
				'-i', introInputPath,
				'-i', audioInputPath,
				'-filter_complex', filter,
				'-map', '[out]',
				'-map_metadata', '-1',
				'-fflags', '+bitexact',
				'-flags:a', '+bitexact',
				'-c:a', 'libvorbis',
				'-q:a', '6',
				'-ar', '96000',
				'-ac', '1',
				outputPath,
			]);

			await interaction.editReply('generating waveform...');
			await execFilePromise('ffmpeg', [
				'-y',
				'-i', outputPath,
				'-filter_complex', '[0:a]showwavespic=s=1000x240:colors=3232C8:filter=peak[peaks];[0:a]showwavespic=s=1000x240:colors=6464DC:filter=average[rms];[peaks][rms]overlay',
				'-update', '1',
				waveformPath,
			]);

			await interaction.editReply({
				content: 'added intro',
				files: [
					new AttachmentBuilder(outputPath, {name: 'intro_output.ogg'}),
					new AttachmentBuilder(waveformPath, {name: 'waveform.png'}),
				],
			});

			setTimeout(() => {
				if (fs.existsSync(introInputPath)) fs.unlinkSync(introInputPath);
				if (fs.existsSync(audioInputPath)) fs.unlinkSync(audioInputPath);
				if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
				if (fs.existsSync(waveformPath)) fs.unlinkSync(waveformPath);
			}, 5000);

		} catch (error) {
			console.error('intro error:', error);
			[introInputPath, audioInputPath, outputPath, waveformPath].forEach((p) => {
				if (fs.existsSync(p)) fs.unlinkSync(p);
			});
			return interaction.editReply(`failed: ${error.message?.slice(0, 200) || 'unknown error'}`);
		}
	},
};
