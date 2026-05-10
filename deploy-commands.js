// run this with `node deploy-commands.js` whenever u add, remove, or change
// the SIGNATURE of a command (name, description, options). u dont need to
// run it if u only changed the inside of a command's execute() function.

const { REST, Routes } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');

// collect every command's .data.toJSON() so we can push them to discord
const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		} else {
			console.log(`[WARNING] the command at ${filePath} is missing a "data" or "execute" property.`);
		}
	}
}

const rest = new REST().setToken(token);

// global deploy. takes up to an hour to propagate to every guild. for testing
// during dev u can swap Routes.applicationCommands(clientId) for
// Routes.applicationGuildCommands(clientId, guildId) which is instant.
(async () => {
	try {
		console.log(`refreshing ${commands.length} application (/) commands...`);
		const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });

		console.log(`reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
	}
})();