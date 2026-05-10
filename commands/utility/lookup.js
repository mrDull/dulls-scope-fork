const {InteractionContextType, SlashCommandBuilder, AttachmentBuilder} = require('discord.js');
require('dotenv').config();

// .ROBLOSECURITY cookie. lives in .env so it doesnt get committed.
// note: this is account-level auth so if u leak it ur whole rblx account is
// cooked. dont ever paste it anywhere
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('lookup')
		.setDescription('look up a roblox asset by id and get its info + download')
		.addStringOption((option) =>
			option.setName('id')
				.setDescription('the asset id')
				.setRequired(true)
		)
		.addBooleanOption((option) =>
			option.setName('download')
				.setDescription('download the audio file too (default true)')
				.setRequired(false)
		)
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		if (!ROBLOX_COOKIE) {
			return interaction.reply({content: 'no roblox cookie configured.', ephemeral: true});
		}

		await interaction.deferReply();

		const assetId = interaction.options.getString('id', true).trim();
		const shouldDownload = interaction.options.getBoolean('download') ?? true;

		try {
			// fetch asset info from the user-auth endpoint. this is cookie-auth
			// (open cloud doesnt have a public asset-lookup endpoint right now)
			const infoResponse = await fetch(`https://apis.roblox.com/assets/user-auth/v1/assets/${assetId}`, {
				headers: {
					'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
					'Content-Type': 'application/json'
				}
			});

			if (!infoResponse.ok) {
				if (infoResponse.status === 401) {
					return interaction.editReply('authentication failed. check cookie');
				}
				if (infoResponse.status === 404) {
					return interaction.editReply(`asset \`${assetId}\` not found.`);
				}
				return interaction.editReply(`failed to fetch asset (status ${infoResponse.status})`);
			}

			const data = await infoResponse.json();

			const name = data.displayName || data.path || 'unknown';
			const assetType = data.assetType || 'unknown';
			const modState = data.moderationResult?.moderationState || 'unknown';
			const description = data.description || 'none';
			const creatorId = data.creationContext?.creator?.userId || 'unknown';

			const copyrighted = description.includes('(Removed for violations of Roblox Terms of Use)');

			let info =
				`**${name}**\n` +
				`asset id: \`${assetId}\`\n` +
				`type: ${assetType}\n` +
				`moderation: **${modState}**${copyrighted ? ' (copyrighted)' : ''}\n` +
				`creator: \`${creatorId}\`\n` +
				`https://www.roblox.com/library/${assetId}`;

			// try to download the audio if requested
			if (shouldDownload && assetType === 'Audio') {
				try {
					await interaction.editReply('downloading audio...');

					const dlResponse = await fetch(`https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`, {
						headers: {
							'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
						},
						redirect: 'follow'
					});

					if (dlResponse.ok) {
						const audioBuffer = await dlResponse.arrayBuffer();
						const attachment = new AttachmentBuilder(
							Buffer.from(audioBuffer),
							{name: `${assetId}.ogg`}
						);

						return interaction.editReply({
							content: info,
							files: [attachment]
						});
					} else {
						info += `\n\ncould not download audio (status ${dlResponse.status})`;
					}
				} catch (dlErr) {
					info += `\n\ndownload failed: ${dlErr.message}`;
				}
			}

			return interaction.editReply(info);

		} catch (error) {
			console.error('lookup error:', error);
			return interaction.editReply(`error: ${error.message?.slice(0, 200) || 'unknown error'}`);
		}
	},
};
