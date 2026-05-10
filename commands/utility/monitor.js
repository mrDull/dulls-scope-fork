const { InteractionContextType, SlashCommandBuilder } = require('discord.js');
const { startMonitoring, activeMonitors } = require('../../utils/monitor');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('monitor')
		.setDescription('monitors a roblox asset id moderation status')
		.addStringOption((option) => option.setName('id').setDescription('the asset').setRequired(true))
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		const assetid = interaction.options.getString('id', true).toLowerCase();

		if (activeMonitors.has(assetid)) {
			return interaction.reply({ content: `already monitoring \`${assetid}\`. ignoring...`, ephemeral: false });
		}

		await interaction.deferReply();

		try {
			const result = await startMonitoring(interaction, assetid);
			if (!result.success) {
				return interaction.editReply(result.reason);
			}
			// startMonitoring already sends the initial "monitoring..." followUp,
			// so we just edit the deferred reply with a confirmation
			await interaction.editReply(`set up monitoring for \`${assetid}\``);
		} catch (error) {
			console.error('execute error:', error);
			return interaction.editReply('something broke while setting up the monitor.');
		}
	},
};
