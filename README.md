
# scope : utility bot
![Logo](https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT_NH_qgsL6wVSx42yn8xVYLtKFRA-IAPFdmSv9guPuJKA9B1-iZglIePrA4uqXTkYBjlJNScT_JqTxEnANjc1AKcNGyvPfSfGnOahIDg&s=10)

scope by typicaalusername and turtwig

inspired heavily by 2slimey

[Stream More Anxiety by 2slimey on Spotify](https://open.spotify.com/album/7sSUDNtZti6vG3kzRIdCF3?si=KdfVJVEzTBWG23ltwdEfCw)
## Authors

- [@typicaalusername](https://www.github.com/typicaalusername)
- [2slimey](https://open.spotify.com/artist/0ZXbQLu4a7sk3iQ8tlgFy4?si=bqfN260qRUCACFcTx2oxfg)
- Turtwig (@wiimenu)

Project originally made as a contribution to Project: Numlock (God Bless 1985)
## License

[GNU General Public License v3.0](https://choosealicense.com/licenses/gpl-3.0/)

scope is an open source project for  a reason as none of these features should even be behind any paywall nor a private community

feel free to do as you wish with scope, just please add credit if you are going to reuse bits of my code
## Installation

install via git

```bash
git clone https://github.com/typicaalusername/scope.git
cd scope
```

make sure you have the latest version of [Node.JS](https://nodejs.org/en/download) alongside the latest version of [FFmpeg](https://www.ffmpeg.org/download.html) for the bot to run and have support for the ffmpeg related commands (older ffmpeg versions mess up with the image processing for some reason ???)

deploy commands before adding new ones or js hosting the bot for the first time

```bash
node deploy-commands.js
```

to run the bot genuinely just do

```bash
node index.js
```

and itll be fine until it crashes lol

you have to provide a roblox cookie in the .env file for /monitor and the /notify commands to work.

everything else is in config.json which i think most of you can figure out yourselves
## Acknowledgements

theres some bugs where the bot can just randomly crashed that i never fully diagnosed nor cared about

one prime example being when its running in a gc and the member running it gets kicked, itll immediately crash LOL

you can easily fix these issues but honestly its not my problem as this was a passion project nonetheless
## FAQ

#### Will you continue to add features to scope?

probably not unless i come across someone selling something easy to implement and add it for free. i hate people that upsell shit that can be easily remade and distributed for No cost whatsoever

#### Why are you releasing scope?

people kept dming me about scope and it overtime got annoying since people used me for it. i also just didnt like constantly having to worry about it turning off. plus the code was Bound to be remade without a whitelist behind it so i dont mind releasing it so people dont have to make more vibecoded slop.

#### Can I remove the whitelist?

yh i dont care

#### Why isn't the copyright method always working?

as with other cr settings, its hit or miss. most of the time if you increase the high a bit itll work on higher cr songs but most if not all will work by default. distrokid can flag some songs with default settings btw (hence why i added arguments to customize it to your likeness)

#### Why 2slimey?

thought it was funny as this bot was initially made as a little jab at those paywalled bots that are horrid, and also i never really take developing seriously since this is all a hobby of mine.

#### Why is some of the code abysmal?

because im lazy and why fix what aint broke lol. i also just really dont care since i just made this to make my life easier

## Usage

add the app to your profile and then use it

i am not teaching you how to use self-explanatory commands.
## Features

- copyright bypass
- file analyzation for people that rely on nearly useless file info
- distrokid artist notifications (just tells you when ur audio gets uploaded fully lol)
- asset monitoring
- user whitelists
