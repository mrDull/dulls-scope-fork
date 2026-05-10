// this is like the actual scope handling for when it starts up (duh)
// it only cycles through the random names every 10 seconds
// since this is a 2slimey bot it redirects to Serena by 2slimey as a joke
// probably change it to be your own but honestly to js keep the Charm of scope, keep the 2slimey elements :3
// - typicaalusername (freshmen)

const { Events, ActivityType } = require('discord.js');

const statuses = [
	// destroy lonely
	"if you not nostalgia dont talk to me",
	"i got no stylist i style myself",
	"UND4RW0RLD",
	"you not special you not gang",
	"VNDETTA",
	"prada me prada you prada everything",
	// carti
	"i got me some thots they thought i was gay",
	"STOP BREATHING",
	"IM ON THE X IM ON THE CODEINEEEEEEEEEEEEEEEEEEEEEEEEEE",
	"ever since my brother died",
	"what? what? what? what?",
	"they thought i was gay 🧛",
	"NARCISSIST 💋",
	"i feel like god 🦇",
	"jump out the house jump out the house",

	// ken carson
	"TEEN X",
	"fighting demons but they keep winning",
	"i am the project x",
	"X MAN",
	"they not like us they not like me",
	"MDMA in my system rn",
	"yale or destroy lonely i cant decide",

	// com kid humor
	"bro think he carti",
	"nah this is CRAZY",
	"im in ur walls btw",
	"ratio + fell off + L + cope",
	"this bot has more friends than you",
	"google en passant",
	"are you actually reading this",
	"pro larper"
];

var cli = ""
function randomst() {
	const random = statuses[Math.floor(Math.random() * statuses.length)];

	cli.user.setPresence({
		status: 'online',
		activities: [{
			name: random,
			type: ActivityType.Streaming,
			url: 'https://www.youtube.com/watch?v=p78_INSyKGE'
		}],
	})
}

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(` @${client.user.tag} is active :3`);

		cli = client
		randomst()
		setInterval(randomst, 10000);
	},
};