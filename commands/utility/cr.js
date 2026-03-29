const {InteractionContextType,SlashCommandBuilder,AttachmentBuilder} = require('discord.js');
const {exec} = require('child_process');
const {promisify} = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = promisify(exec);

function getSampleRate(inputPath) {
    try {
        const command = `ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`;
        const sampleRate = exec(command).toString().trim();
        return parseInt(sampleRate) || 44100;
    } catch(err){
        return 48000;
    }
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('cr')
		.setDescription('duh')
		.addAttachmentOption((option) => 
			option.setName('file')
				.setDescription('aud')
				.setRequired(true)
		)
        .addNumberOption((option) =>
			option.setName('speed')
				.setDescription('speed percentage')
				.setRequired(false)
				.setMinValue(-20)
				.setMaxValue(20)
		)
        .addNumberOption((option) =>
			option.setName('low')
				.setDescription('cut')
				.setRequired(false)
		)
        .addNumberOption((option) =>
			option.setName('high')
				.setDescription('cut')
				.setRequired(false)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		await interaction.deferReply();

		if (interaction.user.id == "1456822669969461483") {
			return interaction.reply({
				content: "you do not have access to this command."
			})
		}

		if (Math.floor(Math.random() * 1500) == 1) {
			return interaction.reply({
				content: "man fuck you"
			})
		}

		const attachment = interaction.options.getAttachment('file');
        const speedPercent = interaction.options.getNumber('speed') ?? 5;
        const speedMultiplier = 1 + (speedPercent / 100);

        const lowcut = interaction.options.getNumber('low') ?? 400;
        const highcut = interaction.options.getNumber('high') ?? 1100;

		const tempDir = path.join(__dirname, '..', 'temp');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}
		const originalExt = path.extname(attachment.name) || `.mp3`;
		const inputPath = path.join(tempDir, `input_${Date.now()}${originalExt}`);
		const outputPath = path.join(tempDir, `output_${Date.now()}.mp3`);
        const spectrogramPath = path.join(tempDir, `spectrogram_${Date.now()}.png`);

		try {
			await interaction.editReply('downloading file...');
			const response = await fetch(attachment.url);
			const buffer = await response.arrayBuffer();
			fs.writeFileSync(inputPath, Buffer.from(buffer));

			await interaction.editReply('processing aud...');

            const centerFreq = (lowcut+highcut)/2;
            const holeWidth = Math.abs(highcut-lowcut); // this retard really had me add ts for him :sob:

			const samplerate = getSampleRate(inputPath)

			const encode = `-c:a libmp3lame -b:a 192k` // im too lazy to restore the old one so itll js stay here as an argument ignore me
			
			const eqFilter = `anequalizer=c0 f=${centerFreq} w=${holeWidth} g=-90 t=2|c1 f=${centerFreq} w=${holeWidth} g=-90 t=2`;
			const command = `ffmpeg -i "${inputPath}" -af "asetrate=${samplerate}*${speedMultiplier}, aresample=48000, ${eqFilter}, ${eqFilter}, ${eqFilter}" ${encode} "${outputPath}"`;

			await execPromise(command);

            await interaction.editReply('generating spectrogram...');
			const spectrogramCommand = `ffmpeg -i "${outputPath}" -lavfi "showspectrumpic=s=1000x240:legend=0:gain=.5:color=cool" "${spectrogramPath}"`;
			
			await execPromise(spectrogramCommand);

			const processedFile = new AttachmentBuilder(outputPath, { 
				name: `output.mp3` 
			});

            const spectrogramImage = new AttachmentBuilder(spectrogramPath, {
				name: 'spectrogram.png'
			});

			await interaction.editReply({ 
				content: 'applied spectrogram hole', 
				files: [processedFile, spectrogramImage] 
			});

			setTimeout(() => {
				if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
				if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                if (fs.existsSync(spectrogramPath)) fs.unlinkSync(spectrogramPath);
			}, 5000);

		} catch (error) {
			console.error('Processing error:', error);
			if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
			if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            if (fs.existsSync(spectrogramPath)) fs.unlinkSync(spectrogramPath);
			return interaction.editReply(`failed.`);
		}
	},
};