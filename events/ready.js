// this is like the actual scope handling for when it starts up (duh)
// it only cycles through the random names every 10 seconds
// since this is a 2slimey bot it redirects to Serena by 2slimey as a joke
// probably change it to be your own but honestly to js keep the Charm of scope, keep the 2slimey elements :3
// - typicaalusername (freshmen)

const { Events, ActivityType } = require('discord.js');

const statuses = [
	"emperor of mexico",
	"new choppa new choppa new choppa",
	"get the fuck off the airways",
	"ion like nobody",
	"maumaumaumaumaumaumaumaumau",
	"pop alot",
	"high anxiety",
	"more anxiety",
	"no anxiety?",
	"you so hard",
	"ok",
	"audios.. audios.. audios..",
	"stop breathing",
	"she suckin the dick in the crib",
	"i am not nettspend i am 2slimey",
	"vlor5k is my lord",
	"well well well... 2slimey..",
	"bleood gang",
	"I'm having a coffee", // turtwig (BALLHOG)
	"annihilates foid",
	"I personally don't like coffee" // freshmen (OMEGA GOD)
];

var cli = ""
function randomst() {
	const random = statuses[Math.floor(Math.random() * statuses.length)];

	cli.user.setPresence({
		activities: [{
			name: random,
			type: ActivityType.Streaming,
			url: 'https://www.youtube.com/watch?v=luQIkjJQdlA'
		}],
	})
}

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`all set. running on @${client.user.tag}.`);

		cli = client
		randomst()
		setInterval(randomst, 10000);
	},
};