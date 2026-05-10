const {InteractionContextType, SlashCommandBuilder, MessageFlags} = require('discord.js');
const {blacklist, unblacklist, isBlacklisted, blacklistedReason, getBlacklist, isOwner} = require('../../utils/key');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('blacklist')
		.setDescription('manage the blacklist (bot owner only)')
		.addSubcommand((sub) =>
			sub.setName('add')
				.setDescription('blacklist a user (ban them from using the bot)')
				.addUserOption((opt) =>
					opt.setName('user').setDescription('user to blacklist').setRequired(true)
				)
				.addStringOption((opt) =>
					opt.setName('reason').setDescription('why').setRequired(false)
				)
		)
		.addSubcommand((sub) =>
			sub.setName('remove')
				.setDescription('remove a user from the blacklist')
				.addUserOption((opt) =>
					opt.setName('user').setDescription('user to unblacklist').setRequired(true)
				)
		)
		.addSubcommand((sub) =>
			sub.setName('list')
				.setDescription('show every blacklisted user and their reason')
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),

	async execute(interaction) {
		if (!isOwner(interaction.user.id)) {
			return interaction.reply({
				content: 'only the bot owner can manage the blacklist.',
				flags: MessageFlags.Ephemeral,
			});
		}

		const sub = interaction.options.getSubcommand();

		if (sub === 'add') {
			const target = interaction.options.getUser('user');
			const reason = interaction.options.getString('reason') ?? 'no reason given';

			if (isOwner(target.id)) {
				return interaction.reply({
					content: 'you cant blacklist an owner lol.',
					flags: MessageFlags.Ephemeral,
				});
			}

			blacklist(target.id, reason);
			return interaction.reply({
				content: `${target.username} has been blacklisted. reason: ${reason}`,
				flags: MessageFlags.Ephemeral,
			});
		}

		if (sub === 'remove') {
			const target = interaction.options.getUser('user');
			const removed = unblacklist(target.id);
			return interaction.reply({
				content: removed
					? `${target.username} has been removed from the blacklist.`
					: `${target.username} wasn't on the blacklist.`,
				flags: MessageFlags.Ephemeral,
			});
		}

		if (sub === 'list') {
			const map = getBlacklist();
			const ids = Object.keys(map);
			if (ids.length === 0) {
				return interaction.reply({
					content: 'the blacklist is empty.',
					flags: MessageFlags.Ephemeral,
				});
			}
			const lines = await Promise.all(ids.map(async (id) => {
				try {
					const u = await interaction.client.users.fetch(id);
					return `- ${u.username} (${id}): ${map[id]}`;
				} catch {
					return `- <unknown user> (${id}): ${map[id]}`;
				}
			}));
			return interaction.reply({
				content: `blacklist (${ids.length}):\n${lines.join('\n')}`,
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
