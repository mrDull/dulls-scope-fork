const {InteractionContextType,SlashCommandBuilder,AttachmentBuilder,EmbedBuilder} = require('discord.js');
const {exec, execFile} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = promisify(exec);
const execFilePromise = promisify(execFile);

function getLoudness(filePath) {
  return new Promise(function(resolve, reject) {
        execFilePromise("ffmpeg", ["-i", filePath, "-af", "ebur128=peak=true", "-f", "null", "-"], (_, __, stderr) => {
            console.log(stderr)
            if (!stderr) return reject(new Error("no output from ffmpeg ???"));

            resolve({
                lufs: parseFloat(stderr.match(/Integrated loudness[\s\S]*?I:\s+([-\d.]+) LUFS/)?.[1]),
                peak: parseFloat(stderr.match(/Peak:\s+([-\d.]+) dBFS/)?.[1]),
            });
        });
    });
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('analyze')
		.setDescription('gives audio file info, similar to rosound but not ai lol')
		.addAttachmentOption((option) => 
			option.setName('file')
				.setDescription('aud')
				.setRequired(true)
		)
        .setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        await interaction.deferReply();

        const attachment = interaction.options.getAttachment('file');
        const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}

		const originalExt = path.extname(attachment.name) || `.mp3`;
		const inputPath = path.join(tempDir, `input_${Date.now()}${originalExt}`);
        const waveformPath = path.join(tempDir, `waveform_analyze_${Date.now()}.png`);

        await interaction.editReply('downloading file...');
		const response = await fetch(attachment.url);
		const buffer = await response.arrayBuffer();
		fs.writeFileSync(inputPath, Buffer.from(buffer));

        // i swear like most of this is reused code from past commands LMFAO

        await interaction.editReply('analyzing...');
        const [probeResult, loudness] = await Promise.all([
            execFilePromise("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", inputPath]),
            getLoudness(inputPath),
        ]).catch(e => { console.error("analysis failed:", e); throw e; });

        const data = JSON.parse(probeResult.stdout);
        const fmt = data.format;
        const stream = data.streams.find(s => s.codec_type === "audio");

        const waveformSize = "1920x660"

        await execFilePromise("ffmpeg", [
            "-i", inputPath,
            "-filter_complex", `[0:a]showwavespic=s=${waveformSize}:colors=3232C8:filter=peak[peaks];[0:a]showwavespic=s=${waveformSize}:colors=6464DC:filter=average[rms];[peaks][rms]overlay`,
            "-update", "1", waveformPath
        ]);

        const duration = parseFloat(fmt.duration);
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);

        await interaction.editReply({
            content: `processed file \`${attachment.name}\`\nduration: ${minutes}:${seconds.toString().padStart(2, "0")}\nbitrate: ${Math.round(fmt.bit_rate / 1000)} kbps\nsample rate: ${stream.sample_rate}hz\nintegrated: ${loudness.lufs} LUFS\npeak: ${loudness.peak} dBFS`,
            files: [new AttachmentBuilder(waveformPath, { name: "waveform.png" })]
        });

        fs.unlinkSync(inputPath);
        fs.unlinkSync(waveformPath);
    }
}