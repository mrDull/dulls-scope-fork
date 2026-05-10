const {InteractionContextType, SlashCommandBuilder, MessageFlags} = require('discord.js');
const {whitelist, unwhitelist, isWhitelisted, getWhitelist, isOwner} = require('../../utils/key');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('whitelist')
		.setDescription('manage the audio-command whitelist (bot owner only)')
		.addSubcommand((sub) =>
			sub.setName('add')
				.setDescription('whitelist a user (give them access to gated audio commands)')
				.addUserOption((opt) =>
					opt.setName('user').setDescription('user to whitelist').setRequired(true)
				)
		)
		.addSubcommand((sub) =>
			sub.setName('remove')
				.setDescription('remove a user from the whitelist')
				.addUserOption((opt) =>
					opt.setName('user').setDescription('user to remove').setRequired(true)
				)
		)
		.addSubcommand((sub) =>
			sub.setName('list')
				.setDescription('show every currently whitelisted user')
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),

	async execute(interaction) {
		// interactionCreate.js already gates this command to owners, but we
		// re-check here too so the file is safe to call from anywhere
		if (!isOwner(interaction.user.id)) {
			return interaction.reply({
				content: 'only the bot owner can manage the whitelist.',
				flags: MessageFlags.Ephemeral,
			});
		}

		const sub = interaction.options.getSubcommand();

		if (sub === 'add') {
			const target = interaction.options.getUser('user');
			const added = whitelist(target.id);
			return interaction.reply({
				content: added
					? `${target.username} has been whitelisted.`
					: `${target.username} was already on the whitelist.`,
				flags: MessageFlags.Ephemeral,
			});
		}

		if (sub === 'remove') {
			const target = interaction.options.getUser('user');
			const removed = unwhitelist(target.id);
			return interaction.reply({
				content: removed
					? `${target.username} has been removed from the whitelist.`
					: `${target.username} wasn't on the whitelist.`,
				flags: MessageFlags.Ephemeral,
			});
		}

		if (sub === 'list') {
			const ids = getWhitelist();
			if (ids.length === 0) {
				return interaction.reply({
					content: 'the whitelist is empty.',
					flags: MessageFlags.Ephemeral,
				});
			}
			const lines = await Promise.all(ids.map(async (id) => {
				try {
					const u = await interaction.client.users.fetch(id);
					return `- ${u.username} (${id})`;
				} catch {
					return `- <unknown user> (${id})`;
				}
			}));
			return interaction.reply({
				content: `whitelist (${ids.length}):\n${lines.join('\n')}`,
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
