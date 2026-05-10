const {InteractionContextType, SlashCommandBuilder, AttachmentBuilder} = require('discord.js');
const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');

const execFilePromise = promisify(execFile);

// cap output at 6:59. rblx max upload is 7:00 so 419s leaves a 1s safety
// margin. endbait loops as many times as needed to fill up to that target
const TARGET_DURATION = 419;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('endbait')
		.setDescription('appends an endbait audio to the end of a main audio (audio then endbait, hard cut)')
		.addAttachmentOption((option) =>
			option.setName('audio')
				.setDescription('the main audio (goes first)')
				.setRequired(true)
		)
		.addAttachmentOption((option) =>
			option.setName('endbait')
				.setDescription('the endbait audio (goes at the end, untouched by /loud)')
				.setRequired(true)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		await interaction.deferReply();

		const audioAttachment = interaction.options.getAttachment('audio');
		const endbaitAttachment = interaction.options.getAttachment('endbait');

		const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, {recursive: true});
		}

		const audioExt = path.extname(audioAttachment.name) || '.mp3';
		const endbaitExt = path.extname(endbaitAttachment.name) || '.mp3';
		const audioInputPath = path.join(tempDir, `endbait_audio_${Date.now()}${audioExt}`);
		const endbaitInputPath = path.join(tempDir, `endbait_in_${Date.now()}${endbaitExt}`);
		const outputPath = path.join(tempDir, `endbait_out_${Date.now()}.ogg`);
		const waveformPath = path.join(tempDir, `endbait_wave_${Date.now()}.png`);

		try {
			await interaction.editReply('downloading files...');
			const [audioResp, endbaitResp] = await Promise.all([
				fetch(audioAttachment.url),
				fetch(endbaitAttachment.url),
			]);
			fs.writeFileSync(audioInputPath, Buffer.from(await audioResp.arrayBuffer()));
			fs.writeFileSync(endbaitInputPath, Buffer.from(await endbaitResp.arrayBuffer()));

			await interaction.editReply('combining...');

			// filter graph:
			//   [a0] = main audio (just resample to 96k mono)
			//   [a1] = endbait but with a hard limiter chain on it
			//          (audacity Hard Limit: +5dB in, +10dB, clip at 0, drop -10dB)
			//          so it stays loud-but-controlled at the end
			//   then concat them together
			const filter = `[0:a]aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp[a0];[1:a]aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp,volume=5dB,volume=10dB,asoftclip=type=hard,volume=-10dB[a1];[a0][a1]concat=n=2:v=0:a=1[out]`;

			await execFilePromise('ffmpeg', [
				'-y',
				'-i', audioInputPath,
				'-stream_loop', '-1', '-i', endbaitInputPath,
				'-filter_complex', filter,
				'-map', '[out]',
				'-t', String(TARGET_DURATION),
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
				content: 'added endbait (looped to 6:59)',
				files: [
					new AttachmentBuilder(outputPath, {name: 'endbait_output.ogg'}),
					new AttachmentBuilder(waveformPath, {name: 'waveform.png'}),
				],
			});

			setTimeout(() => {
				if (fs.existsSync(audioInputPath)) fs.unlinkSync(audioInputPath);
				if (fs.existsSync(endbaitInputPath)) fs.unlinkSync(endbaitInputPath);
				if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
				if (fs.existsSync(waveformPath)) fs.unlinkSync(waveformPath);
			}, 5000);

		} catch (error) {
			console.error('endbait error:', error);
			[audioInputPath, endbaitInputPath, outputPath, waveformPath].forEach((p) => {
				if (fs.existsSync(p)) fs.unlinkSync(p);
			});
			return interaction.editReply(`failed: ${error.message?.slice(0, 200) || 'unknown error'}`);
		}
	},
};
