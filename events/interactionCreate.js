const {Events, MessageFlags} = require('discord.js');
const {permcheck, isAuthorized, blacklistedReason, isOwner} = require('../utils/key');

const globalcommands = ['ping'];
const permcmds = ['whitelist'];



module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);
		if (!command) {
			console.error(`no command matching ${interaction.commandName} was found.`);
			return;
		}

		// /whitelist (and any future permcmds) are owner-only.
		if (permcmds.includes(interaction.commandName)) {
			if (!isOwner(interaction.user.id)) {
				await interaction.deferReply({flags: MessageFlags.Ephemeral});
				return interaction.editReply({
					content: 'insufficient permissions.',
				});
			}
			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(error);
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({
						content: 'error check console',
						flags: MessageFlags.Ephemeral,
					});
				} else {
					await interaction.reply({
						content: 'error check console',
						flags: MessageFlags.Ephemeral,
					});
				}
			}
			return;
		}

		// Everything else (except global commands like /ping) needs a whitelist/owner check.
		if (!globalcommands.includes(interaction.commandName)) {
			const auth = isAuthorized(interaction.user.id);
			console.log(`auth(${interaction.user.id}) = ${auth}`);

			if (auth === 'blacklisted') {
				console.log(`blacklisted user ${interaction.user.id} tried to run a command.`);
				await interaction.deferReply();
				return interaction.editReply({
					content: `sorry, you have been blacklisted for ${blacklistedReason(interaction.user.id)}.`,
				});
			}

			if (auth !== 'user' && auth !== 'owner') {
				console.log(`non whitelisted user ${interaction.user.id} tried to run a command.`);
				await interaction.deferReply();
				return interaction.editReply({
					content: 'not whitelisted. contact the bot owner for a whitelist (this does not mean you will get one)',
				});
			}
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: 'error check console',
					flags: MessageFlags.Ephemeral,
				});
			} else {
				await interaction.reply({
					content: 'error check console',
					flags: MessageFlags.Ephemeral,
				});
			}
		}
	},
};
