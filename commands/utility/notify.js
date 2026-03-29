const { InteractionContextType, SlashCommandBuilder, InviteStageInstance } = require('discord.js');
require('dotenv').config();

const artists = new Map();
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('notify')
		.setDescription('checks an artist name for a new release')
		.addStringOption((option) => option.setName('artist').setDescription('artist you want (case sensitive)').setRequired(true))
        .setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
        const artist = interaction.options.getString('artist', true);

        if (!ROBLOX_COOKIE) {
			return interaction.reply({ content: 'no roblox cookie detected (retard?)', ephemeral: true });
		}

        if (artists.has(artist)) {
            clearInterval(artists.get(artist));
            artists.delete(artist);
			return interaction.reply({content: `removed ${artist} from the monitoring pool`});
		}

        await interaction.deferReply();

        const apilink = `https://apis.roblox.com/toolbox-service/v1/marketplace/3?artist=${artist}&limit=999999&uiSortIntent=10`

        try {
            const initialResponse = await fetch(apilink, {
				headers: {
					'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
					'Content-Type': 'application/json'
				}
			});

            // god

            if (!initialResponse.ok) {
				if (initialResponse.status === 401) {
					return interaction.editReply('authentication failed. check cookie');
				}
				return interaction.editReply(`failed ${initialResponse.status}`);
			}

            const data = await initialResponse.json();
            var results = data.totalResults; // this might change if an aud gets deleted btw

            if (results <= 0) {
                return interaction.editReply("this artist is empty. did you type in the name correctly");
            }

            await interaction.editReply(`now starting to check artist ${artist} for a new release.`)

            const int = setInterval(async function() {
                try {
                    const response = await fetch(apilink, {
                        headers: {
                            'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (!response.ok) {
                        if (response.status === 401) {
                            clearInterval(int);
                            artists.delete(artist);
                            return interaction.followUp('authentication expired.');
                        }

                        if (response.status == 429) {
                            return console.log('ratelimited for a moment. could be due to multiple artists being monitored at once. continuing..');
                        }

                        return interaction.followUp('random error.');
                    }

                    const returned = await response.json();
                    const newresults = returned.totalResults;

                    if (newresults > results) {
                        clearInterval(int);
                        artists.delete(artist);
                        
                        const newid = returned.data[0].id.toString();

                        const user = await interaction.client.users.fetch(interaction.user.id);

                        try {
                            const assetResponse = await fetch(`https://assetdelivery.roblox.com/v1/asset/?id=${newid}`, {
                                headers: {
                                    'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                                },
                                redirect: 'follow'
                            });

                            if (assetResponse.ok) {
                                const audioBuffer = await assetResponse.arrayBuffer();
                                const attachment = new (require('discord.js').AttachmentBuilder)(
                                    Buffer.from(audioBuffer),
                                    { name: `${artist}_${newid}.ogg` }
                                );

                                user.send({
                                    content: `<@${interaction.user.id}> new release detected for artist ${artist}.\nasset id: \`${newid}\`\nroblox link: https://roblox.com/library/${newid}`,
                                    files: [attachment]
                                });
                            } else {
                                user.send(`<@${interaction.user.id}> new release detected for artist ${artist}.\nasset id: \`${newid}\`\nroblox link: https://roblox.com/library/${newid}\ncould not download audio (status ${assetResponse.status})`);
                            }
                        } catch (downloadError) {
                            user.send(`<@${interaction.user.id}> new release detected for artist ${artist}.\nasset id: \`${newid}\`\nroblox link: https://roblox.com/library/${newid}\ndownload failed: ${downloadError.message}`);
                        }
                    } else if (newresults < results) {
                        results = newresults;

                        const user = await interaction.client.users.fetch(interaction.user.id);
                        user.send(`<@${interaction.user.id}> a release for artist ${artist} was moderated/archived. just letting you know.`);
                    }
                } catch(error) {
                    clearInterval(int);
                    artists.delete(artist);
                    await interaction.followUp(`error. ${error}`);
                }
            }, 60000);//60000);
            artists.set(artist, int);
        } catch (error) {
			console.error('execute error:', error);
			return interaction.editReply(`error: ${error}`);
		}
	},
};