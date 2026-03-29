const { InteractionContextType, SlashCommandBuilder } = require('discord.js');
const si = require('systeminformation');
const os = require('os');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('make sure im online')
		.setContexts([InteractionContextType.Guild, InteractionContextType.PrivateChannel]),
	async execute(interaction) {
		await interaction.deferReply();
        try {
            const cpu = await si.cpu();
            const mem = await si.mem();
            const graphics = await si.graphics();
            const osInfo = await si.osInfo();

            const usedRAM = (mem.active / 1024 / 1024 / 1024).toFixed(2);
            const totalRAM = (mem.total / 1024 / 1024 / 1024).toFixed(2);

            await interaction.editReply(
                `im awake and running on ${os.hostname()}\n\n` +
                `os: ${osInfo.distro}\n` +
                `cpu: ${cpu.manufacturer} ${cpu.brand}\n` +
                `ram: ${usedRAM}GB / ${totalRAM}GB\n` +
                `gpu: ${graphics.controllers[0]?.model || 'Integrated'}`
            );
        } catch (error) {
            console.error(error);
            await interaction.editReply('failed to fetch system stats.');
        }
	},
};