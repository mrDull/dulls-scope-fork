const { InteractionContextType, SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('reload')
		.setDescription('ditto')
		.addStringOption((option) => option.setName('command').setDescription('command').setRequired(true))
        .setContexts(InteractionContextType.PrivateChannel),
	async execute(interaction) {

        // owner-only. lets me reload a single command file at runtime without
        // restarting the whole bot. swap the id if u forked this
        if (interaction.user.id != "271387672986124289") {
			return interaction.reply({
				content: "you do not have access to this command."
			})
		}

		const commandName = interaction.options.getString('command', true).toLowerCase();
		const command = interaction.client.commands.get(commandName);

        // bust node's require cache so the next require() reads from disk again
        delete require.cache[require.resolve(`./${command.data.name}.js`)];

        try {
            const newCommand = require(`./${command.data.name}.js`);
            interaction.client.commands.set(newCommand.data.name, newCommand);
            await interaction.reply(`\`${newCommand.data.name}\` reloaded`);
        } catch (error) {
            console.error(error);
            await interaction.reply(
                `error while reloading a command \`${command.data.name}\`:\n\`${error.message}\``,
            );
        }
	},
};