const { InteractionContextType, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const activeMonitors = new Map();
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('monitor')
		.setDescription('monitors a roblox asset id moderation status')
		.addStringOption((option) => option.setName('id').setDescription('the asset').setRequired(true))
        .setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		const assetid = interaction.options.getString('id', true).toLowerCase();

        if (!ROBLOX_COOKIE) {
			return interaction.reply({ content: 'no roblox cookie detected (retard?)', ephemeral: true });
		}

        if (activeMonitors.has(assetid)) {
			return interaction.reply({ content: `already monitoring \`${assetid}\`. ignoring...`, ephemeral: false });
		}

        await interaction.deferReply();

        try {
			const initialResponse = await fetch(`https://apis.roblox.com/assets/user-auth/v1/assets/${assetid}`, {
				headers: {
					'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
					'Content-Type': 'application/json'
				}
			});
			
			if (!initialResponse.ok) {
				if (initialResponse.status === 401) {
					return interaction.editReply('❌ authentication failed. check cookie');
				}
				return interaction.editReply('❌ failed to fetch asset. check the asset ID.');
			}

			const initialData = await initialResponse.json();
			const initialState = initialData?.moderationResult?.moderationState;
            const assetDisplay = initialData?.displayName

			if (!initialState) {
				return interaction.editReply('could not read moderation state.');
			}

			if (initialState !== 'Reviewing') {
				return interaction.editReply(`asset is already **${initialState}**`);
			}

			await interaction.editReply(`monitoring asset \`${assetid}\` (${assetDisplay})\ncurrent status: **${initialState}**`);

			const intervalId = setInterval(async () => {
				try {
					const response = await fetch(`https://apis.roblox.com/assets/user-auth/v1/assets/${assetid}`, {
						headers: {
							'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
							'Content-Type': 'application/json'
						}
					});
					
					if (!response.ok) {
						clearInterval(intervalId);
						activeMonitors.delete(assetid);
						
						if (response.status === 401) {
							return interaction.followUp('❌ authentication expired retard. monitoring stopped.');
						}
						return interaction.followUp('❌ error fetching asset. monitoring stopped.');
					}

					const data = await response.json();
					const currentState = data?.moderationResult?.moderationState;
                    const currentDescription = data?.description;

					if (currentState && currentState !== 'Reviewing' && currentState !== initialState) {
						clearInterval(intervalId);
						activeMonitors.delete(assetid);
						
						const emoji = currentState === 'Approved' ? '✅' : '❌';
                        const copyrighted = currentDescription.includes("(Removed for violations of Roblox Terms of Use)")
						await interaction.followUp(`${emoji} asset \`${assetid}\` (${assetDisplay}) is now: **${currentState}**`);
                        if(copyrighted){
                            await interaction.followUp(`asset was copyrighted btw`);
                        } 
					}
				} catch (error) {
					console.error('Monitor error:', error);
					clearInterval(intervalId);
					activeMonitors.delete(assetid);
					await interaction.followUp('error. stopped monitoring lol.');
				}
			}, 6000);
			activeMonitors.set(assetid, intervalId);
			setTimeout(() => {
				if (activeMonitors.has(assetid)) {
					clearInterval(intervalId);
					activeMonitors.delete(assetid);
					interaction.followUp('monitoring timed out after 15 minutes.').catch(() => {});
				}
			}, 890000);

		} catch (error) {
			console.error('Execute error:', error);
			return interaction.editReply('an error occurred while setting up monitoring.');
		}
	},
};