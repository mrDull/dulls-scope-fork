const {InteractionContextType, SlashCommandBuilder} = require('discord.js');
const {PRESETS, PRESET_CHOICES} = require('../../utils/presets');
const {getPreset, setPreset} = require('../../utils/userdata');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setpreset')
		.setDescription('set your default loud preset')
		.addStringOption((option) =>
			option.setName('preset')
				.setDescription('preset to use as default (leave empty to see current)')
				.setRequired(false)
				.addChoices(...PRESET_CHOICES)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		const preset = interaction.options.getString('preset');
		const userId = interaction.user.id;

		if (!preset) {
			const current = getPreset(userId) ?? 'amherst';
			return interaction.reply({content: `your default preset is **${current}**`, ephemeral: true});
		}

		if (!PRESETS[preset]) {
			return interaction.reply({content: `unknown preset: ${preset}`, ephemeral: true});
		}

		setPreset(userId, preset);
		return interaction.reply({content: `default preset set to **${preset}**`, ephemeral: true});
	},
};
