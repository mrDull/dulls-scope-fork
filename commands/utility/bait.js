const {InteractionContextType, SlashCommandBuilder, AttachmentBuilder} = require('discord.js');
const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');

const execFilePromise = promisify(execFile);

// pitch shift in ffmpeg works by lying to the decoder about the sample rate
// then resampling back to normal. so we need to know the actual sample rate
// of the input before we can do that math. ffprobe to the rescue.
async function getSampleRate(inputPath) {
	try {
		const {stdout} = await execFilePromise('ffprobe', [
			'-v', 'error',
			'-select_streams', 'a:0',
			'-show_entries', 'stream=sample_rate',
			'-of', 'default=noprint_wrappers=1:nokey=1',
			inputPath
		]);
		return parseInt(stdout.trim()) || 44100;
	} catch (err) {
		return 48000;
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('bait')
		.setDescription('prepends a bait audio to the front of a main audio, optional pitch shift on bait')
		.addAttachmentOption((option) =>
			option.setName('bait')
				.setDescription('the bait audio (goes first)')
				.setRequired(true)
		)
		.addAttachmentOption((option) =>
			option.setName('audio')
				.setDescription('the main audio (goes after bait)')
				.setRequired(true)
		)
		.addNumberOption((option) =>
			option.setName('pitch')
				.setDescription('pitch percent for bait (negative=lower/slower, positive=higher/faster)')
				.setRequired(false)
				.setMinValue(-50)
				.setMaxValue(50)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		await interaction.deferReply();

		const baitAttachment = interaction.options.getAttachment('bait');
		const audioAttachment = interaction.options.getAttachment('audio');
		const pitchPercent = interaction.options.getNumber('pitch') ?? 0;
		const pitchMultiplier = 1 + (pitchPercent / 100);

		const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, {recursive: true});
		}

		const baitExt = path.extname(baitAttachment.name) || '.mp3';
		const audioExt = path.extname(audioAttachment.name) || '.mp3';
		const baitInputPath = path.join(tempDir, `bait_in_${Date.now()}${baitExt}`);
		const audioInputPath = path.join(tempDir, `bait_audio_${Date.now()}${audioExt}`);
		const outputPath = path.join(tempDir, `bait_out_${Date.now()}.ogg`);
		const waveformPath = path.join(tempDir, `bait_wave_${Date.now()}.png`);

		try {
			await interaction.editReply('downloading files...');
			const [baitResp, audioResp] = await Promise.all([
				fetch(baitAttachment.url),
				fetch(audioAttachment.url),
			]);
			fs.writeFileSync(baitInputPath, Buffer.from(await baitResp.arrayBuffer()));
			fs.writeFileSync(audioInputPath, Buffer.from(await audioResp.arrayBuffer()));

			await interaction.editReply('combining...');

			const baitSampleRate = await getSampleRate(baitInputPath);

			// build the bait chain. if no pitch shift, just resample. if there
			// IS a pitch shift, asetrate first (this changes pitch + speed
			// together, like vinyl) then resample to 96k for the concat
			const baitChain = pitchPercent === 0
				? `[0:a]aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp[a0]`
				: `[0:a]asetrate=${baitSampleRate}*${pitchMultiplier},aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp[a0]`;

			// glue [bait][main] together into [out]
			const filter = `${baitChain};[1:a]aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp[a1];[a0][a1]concat=n=2:v=0:a=1[out]`;

			await execFilePromise('ffmpeg', [
				'-y',
				'-i', baitInputPath,
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

			const pitchTag = pitchPercent === 0 ? '' : ` (${pitchPercent > 0 ? '+' : ''}${pitchPercent}%)`;

			await interaction.editReply({
				content: `added bait${pitchTag}`,
				files: [
					new AttachmentBuilder(outputPath, {name: 'bait_output.ogg'}),
					new AttachmentBuilder(waveformPath, {name: 'waveform.png'}),
				],
			});

			setTimeout(() => {
				if (fs.existsSync(baitInputPath)) fs.unlinkSync(baitInputPath);
				if (fs.existsSync(audioInputPath)) fs.unlinkSync(audioInputPath);
				if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
				if (fs.existsSync(waveformPath)) fs.unlinkSync(waveformPath);
			}, 5000);

		} catch (error) {
			console.error('bait error:', error);
			[baitInputPath, audioInputPath, outputPath, waveformPath].forEach((p) => {
				if (fs.existsSync(p)) fs.unlinkSync(p);
			});
			return interaction.editReply(`failed: ${error.message?.slice(0, 200) || 'unknown error'}`);
		}
	},
};
