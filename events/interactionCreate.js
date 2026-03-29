const {Events, MessageFlags} = require('discord.js');
const {permcheck, isAuthorized, blacklistedReason} = require('../utils/key')

const globalcommands = ['ping']
const permcmds = ['whitelist']

// this code was poorly put together during a class of mine on my phone.
// modify to remove the wl if u want lol
// - typicaalusername

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;
		
		const command = interaction.client.commands.get(interaction.commandName);
		if (!command) {
			console.error(`no command matching ${interaction.commandName} was found.`);
			return;
		}

		if (interaction.commandName == "whitelist") {
			if (interaction.user.id != "793861073237180427") {
				await interaction.deferReply();
				return interaction.editReply({
					content: "insufficient permissions."
				})
			}
			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(error);
				await interaction.followUp({
					content: 'error check console',
					flags: MessageFlags.Ephemeral,
				});
			}
			return;
		}

		if (!globalcommands.includes(interaction.commandName)) {
			const auth = isAuthorized(interaction.user.id);
			console.log(auth)
			
			if (auth == "blacklisted") {
				console.log(`blacklisted user ${interaction.user.id} tried to run a command.`)
				await interaction.deferReply();
				return interaction.editReply({
					content: `sorry, you have been blacklisted for ${blacklistedReason(interaction.user.id)}.`
				})
			}
			
			if (auth != "user" && auth != "owner") {
				console.log(`non whitelisted user ${interaction.user.id} tried to run a command.`)
				await interaction.deferReply();
				return interaction.editReply({
					content: "not whitelisted. contact @typicaalusername for a whitelist (this does not mean you will get one)"
				})
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