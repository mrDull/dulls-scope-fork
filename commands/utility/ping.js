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

            // skip the virtual/pass-through gpus (parsec, hyper-v, ms basic
            // display, etc.) then pick whatever's left with the most vram.
            // on a system with integrated + discrete this gets us the discrete one.
            // i did this so i can look cool cuz i have 5080 lol
            const virtualGpus = ['parsec', 'microsoft basic', 'virtual', 'remote', 'hyper-v', 'idd'];
            const realGpus = graphics.controllers.filter((c) => {
                const name = (`${c.model || ''} ${c.vendor || ''}`).toLowerCase();
                return !virtualGpus.some((v) => name.includes(v));
            });
            const realGpu = realGpus.sort((a, b) => (b.vram || 0) - (a.vram || 0))[0];

            await interaction.editReply(
                `im awake and running on ${os.hostname()}\n\n` +
                `os: ${osInfo.distro}\n` +
                `cpu: ${cpu.manufacturer} ${cpu.brand}\n` +
                `ram: ${usedRAM}GB / ${totalRAM}GB\n` +
                `gpu: ${realGpu?.model || graphics.controllers[0]?.model || 'Integrated'}`
            );
        } catch (error) {
            console.error(error);
            await interaction.editReply('failed to fetch system stats.');
        }
	},
};