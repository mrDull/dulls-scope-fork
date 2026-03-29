const {InteractionContextType,SlashCommandBuilder,MessageFlags,PermissionFlagsBits} = require('discord.js');
const {whitelist} = require('../../utils/key');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('whitelist a user')
        .addUserOption(opt =>
            opt.setName('user').setDescription('ditto').setRequired(true)
        )
        .setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const target = interaction.options.getUser('user');

        whitelist(target.id);

        await interaction.reply({
            content: `${target.username} has been whitelisted`,
        });
    },
};