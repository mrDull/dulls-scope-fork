const {InteractionContextType, SlashCommandBuilder} = require('discord.js');
const {getHistory} = require('../../utils/userdata');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('history')
		.setDescription('view your recent roblox uploads')
		.addIntegerOption((option) =>
			option.setName('count')
				.setDescription('how many to show (default 10, max 20)')
				.setRequired(false)
				.setMinValue(1)
				.setMaxValue(20)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		const count = interaction.options.getInteger('count') ?? 10;
		const entries = getHistory(interaction.user.id, count);

		if (entries.length === 0) {
			return interaction.reply({content: 'no upload history yet', ephemeral: true});
		}

		// format each entry like:  1. `assetId` name [status] (m/d hh:mm)
		const lines = entries.map((e, i) => {
			const d = new Date(e.date);
			const time = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
			const status = e.status ? ` [${e.status}]` : '';
			return `${i + 1}. \`${e.assetId}\` ${e.name}${status} (${time})`;
		});

		return interaction.reply({
			content: `**recent uploads:**\n${lines.join('\n')}`,
			ephemeral: true,
		});
	},
};
