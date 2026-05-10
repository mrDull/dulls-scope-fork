const {InteractionContextType, SlashCommandBuilder, AttachmentBuilder} = require('discord.js');
const {execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');
const {PRESETS, PRESET_CHOICES} = require('../../utils/presets');
const {getPreset} = require('../../utils/userdata');

const execFilePromise = promisify(execFile);

// same limiter as /endbait standalone. audacity Hard Limit equivalent:
// boost +5dB input, then +10dB, hard clip at 0, drop -10dB. no makeup.
const ENDBAIT_LIMITER = 'volume=5dB,volume=10dB,asoftclip=type=hard,volume=-10dB';

// cap output at 6:59. rblx max is 7:00 so 419s leaves a 1s safety margin,
// and endbait loops to fill whatever gap is left up to that
const TARGET_DURATION = 419;

// safe-mode normalize target. -1 dBFS leaves room so vorbis intersample
// peaks stay under 0 dBFS after rblx re-encodes the file
const SAFE_PEAK_DB = -1;

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
		.setName('full')
		.setDescription('bait + intro + audio (optionally loud) + endbait, all in one shot')
		.addAttachmentOption((option) =>
			option.setName('bait')
				.setDescription('the bait audio (goes first)')
				.setRequired(true)
		)
		.addAttachmentOption((option) =>
			option.setName('intro')
				.setDescription('the intro audio')
				.setRequired(true)
		)
		.addAttachmentOption((option) =>
			option.setName('audio')
				.setDescription('the main audio')
				.setRequired(true)
		)
		.addAttachmentOption((option) =>
			option.setName('endbait')
				.setDescription('the endbait audio (appended at end with hard-limit at -10dBFS)')
				.setRequired(false)
		)
		.addBooleanOption((option) =>
			option.setName('loud')
				.setDescription('apply a loud chain (default true). false = peak-normalize, no clipping (Roblox-safe)')
				.setRequired(false)
		)
		.addStringOption((option) =>
			option.setName('preset')
				.setDescription('which loud preset to use when loud=true (default: amherst)')
				.setRequired(false)
				.addChoices(...PRESET_CHOICES)
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
		const introAttachment = interaction.options.getAttachment('intro');
		const audioAttachment = interaction.options.getAttachment('audio');
		const endbaitAttachment = interaction.options.getAttachment('endbait');
		const applyLoud = interaction.options.getBoolean('loud') ?? true;
		const presetName = interaction.options.getString('preset') ?? getPreset(interaction.user.id) ?? 'amherst';
		const pitchPercent = interaction.options.getNumber('pitch') ?? 0;
		const pitchMultiplier = 1 + (pitchPercent / 100);

		const preset = PRESETS[presetName];
		if (!preset) {
			return interaction.editReply(`unknown preset: ${presetName}`);
		}

		const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, {recursive: true});

		const ts = Date.now();
		const baitPath = path.join(tempDir, `full_bait_${ts}${path.extname(baitAttachment.name) || '.mp3'}`);
		const introPath = path.join(tempDir, `full_intro_${ts}${path.extname(introAttachment.name) || '.mp3'}`);
		const audioPath = path.join(tempDir, `full_audio_${ts}${path.extname(audioAttachment.name) || '.mp3'}`);
		const endbaitPath = endbaitAttachment
			? path.join(tempDir, `full_endbait_${ts}${path.extname(endbaitAttachment.name) || '.mp3'}`)
			: null;
		const preCombinedPath = path.join(tempDir, `full_pre_${ts}.ogg`);
		const finalPath = path.join(tempDir, `full_out_${ts}.ogg`);
		const waveformPath = path.join(tempDir, `full_wave_${ts}.png`);

		const cleanup = () => {
			[baitPath, introPath, audioPath, endbaitPath, preCombinedPath, finalPath, waveformPath]
				.filter(Boolean)
				.forEach((p) => { if (fs.existsSync(p)) fs.unlinkSync(p); });
		};

		try {
			await interaction.editReply('downloading files...');
			const downloads = [
				fetch(baitAttachment.url).then(async (r) => fs.writeFileSync(baitPath, Buffer.from(await r.arrayBuffer()))),
				fetch(introAttachment.url).then(async (r) => fs.writeFileSync(introPath, Buffer.from(await r.arrayBuffer()))),
				fetch(audioAttachment.url).then(async (r) => fs.writeFileSync(audioPath, Buffer.from(await r.arrayBuffer()))),
			];
			if (endbaitAttachment) {
				downloads.push(fetch(endbaitAttachment.url).then(async (r) => fs.writeFileSync(endbaitPath, Buffer.from(await r.arrayBuffer()))));
			}
			await Promise.all(downloads);

			// ok so we combine intro + audio only. we hold the bait back so the
			// loud (or safe-normalize) chain doesnt touch it. bait gets glued
			// onto the front in stage 3 instead.
			await interaction.editReply('combining intro + audio...');
			const combineFilter =
				`[0:a]aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp[a0];` +
				`[1:a]aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp[a1];` +
				`[a0][a1]concat=n=2:v=0:a=1[out]`;

			await execFilePromise('ffmpeg', [
				'-y',
				'-i', introPath,
				'-i', audioPath,
				'-filter_complex', combineFilter,
				'-map', '[out]',
				'-map_metadata', '-1',
				'-fflags', '+bitexact',
				'-flags:a', '+bitexact',
				'-c:a', 'libvorbis',
				'-q:a', '6',
				'-ar', '96000',
				'-ac', '1',
				preCombinedPath,
			]);

			// now  build the processing chain for the main sectio
			let mainProcessChain;
			if (applyLoud) {
				await interaction.editReply(`detecting peak [${presetName}]...`);
				const peakDb = await detectPeakDb(preCombinedPath, preset.preNormFilter);
				const normalizeGain = -peakDb;
				mainProcessChain = preset.buildChain(normalizeGain);
			} else {
				// safe mode: no clipping, no eq, no compression. just normalize to
				// SAFE_PEAK_DB!! good when u want a rblx-safe upload that stays clean
				await interaction.editReply('detecting peak (safe mode)...');
				const peakDb = await detectPeakDb(preCombinedPath, 'aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp');
				const normalizeGain = SAFE_PEAK_DB - peakDb; // brings the peak to SAFE_PEAK_DB

				mainProcessChain = [
					'aresample=96000',
					'aformat=channel_layouts=mono:sample_fmts=fltp',
					`volume=${normalizeGain.toFixed(3)}dB`,
				].join(',');
			}

			// ok so we r gonna  build the final file. layout is:
			//   untouched bait  +  loud-processed main  +  (optional) looped endbait
			// bait is its own input so the loud chain never sees it. only thing we
			// do to bait is the optional pitch shift.
			// -stream_loop -1 on endbait + -t TARGET_DURATION caps total at 6:59
			const modeLabel = applyLoud ? presetName : 'safe';
			await interaction.editReply(applyLoud ? `applying ${presetName} chain...` : 'normalizing volume...');

			const baitRate = await getSampleRate(baitPath);
			const baitInChain = pitchPercent === 0
				? `[0:a]aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp[bait]`
				: `[0:a]asetrate=${baitRate}*${pitchMultiplier},aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp[bait]`;

			let finalArgs;
			if (endbaitAttachment) {
				const finalFilter =
					`${baitInChain};` +
					`[1:a]${mainProcessChain},aformat=sample_fmts=fltp[main];` +
					`[2:a]aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp,${ENDBAIT_LIMITER}[eb];` +
					`[bait][main][eb]concat=n=3:v=0:a=1[out]`;
				finalArgs = [
					'-y',
					'-i', baitPath,
					'-i', preCombinedPath,
					'-stream_loop', '-1', '-i', endbaitPath,
					'-filter_complex', finalFilter,
					'-map', '[out]',
					'-t', String(TARGET_DURATION),
				];
			} else {
				const finalFilter =
					`${baitInChain};` +
					`[1:a]${mainProcessChain},aformat=sample_fmts=fltp[main];` +
					`[bait][main]concat=n=2:v=0:a=1[out]`;
				finalArgs = [
					'-y',
					'-i', baitPath,
					'-i', preCombinedPath,
					'-filter_complex', finalFilter,
					'-map', '[out]',
					'-t', String(TARGET_DURATION),
				];
			}
			finalArgs.push(
				'-map_metadata', '-1',
				'-fflags', '+bitexact',
				'-flags:a', '+bitexact',
				'-c:a', 'libvorbis',
				'-q:a', '6',
				'-ar', '96000',
				'-ac', '1',
				finalPath,
			);
			await execFilePromise('ffmpeg', finalArgs);

			await interaction.editReply('generating waveform...');
			await execFilePromise('ffmpeg', [
				'-y',
				'-i', finalPath,
				'-filter_complex', '[0:a]showwavespic=s=1000x240:colors=3232C8:filter=peak[peaks];[0:a]showwavespic=s=1000x240:colors=6464DC:filter=average[rms];[peaks][rms]overlay',
				'-update', '1',
				waveformPath,
			]);

			const pitchTag = pitchPercent === 0 ? '' : ` (bait pitched ${pitchPercent > 0 ? '+' : ''}${pitchPercent}%)`;
			const ebTag = endbaitAttachment ? ' + endbait (looped to 6:59)' : '';

			await interaction.editReply({
				content: `built [${modeLabel}]: bait + intro + audio${ebTag}${pitchTag}`,
				files: [
					new AttachmentBuilder(finalPath, {name: 'full_output.ogg'}),
					new AttachmentBuilder(waveformPath, {name: 'waveform.png'}),
				],
			});

			setTimeout(cleanup, 5000);

		} catch (error) {
			console.error('full error:', error);
			console.error('stderr:', error.stderr);
			cleanup();
			return interaction.editReply(`failed: ${error.message?.slice(0, 200) || 'unknown error'}`);
		}
	},
};
