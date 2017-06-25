const stats = require('./stats.json');
const config = require('./config.js');
const Discord = require('discord.js');
const logger = require('./util/logger')
const fs = require('fs');

const client = new Discord.Client();
const token = config.token;

var isSharded = false;

// cache audios in memory
// TODO

// set listeners
setListeners(client);

// log our bot in
client.login(token);

function setListeners(client) {

    /* 
    Disabled because this catches all kinds of errors that should be debugged instead of ignored.
    
    process.on('uncaughtException', function (exception) {
        logger.log("Global error: " + exception);
    });

    process.on("unhandledRejection", err => {
        logger.log("Uncaught Promise Error: \n" + err.stack);
    });
    */
    
    client.on('ready', () => {
        // if != null there are shards
        isSharded = (client.shard != null);

        logger.log(client.shard, "Ready!");

        // wait 10 seconds after ready to ensure readiness and set status
        setTimeout(function () {
            logger.log(client.shard, "Status set");
            client.user.setStatus('online');
            client.user.setGame(isSharded ? "!thekairi --help (" + client.shard.id + ")" : "!thekairi --help");
        }, 10000);

        // write stats every 30 seconds
        // dont use if the bot is startet by sharder.js!
        if (!isSharded) {
            setInterval(function () {
                writeStats();
            }, 30000);
        }

    });

    client.on('reconnecting', () => {
        logger.log(client.shard, "Reconnecting shard");
    });

    client.on("disconnect", closeevent => {
        logger.log(client.shard, "Disconnected with code " + closeevent.code + " (" + closeevent.reason + ")!");

        // https://github.com/hammerandchisel/discord-api-docs/issues/33
        // 4005 == already authenticated
        // 4004 == authentication failed

        if (closeevent.code == 4005 ||
            closeevent.code == 4004) {
            return;
        }

        logger.log(client.shard, "Reconnecting automatically...");
        client.destroy().then(() => client.login(token))

    });

    // create listener for messages
    client.on('message', message => {
        handleMessage(message);
    });

}

function handleMessage(message) {
    var content = message.content.toLowerCase();
    var textChannel = message.channel;
    var guild = message.guild;
    var author = message.author;

    var politician;

    if (content.startsWith("!thekairi")) {
        politician = "thekairi";
    }
    if (content.startsWith("!clinton")) {
        politician = "clinton";
    }
    if (content.startsWith("!merkel")) {
        politician = "merkel";
    }
    if (content.startsWith("!erdogan")) {
        politician = "erdogan";
    }

    if (politician == null) {
        return;
    }

    // make sure the text channel is a guild channel (type = text)
    if (textChannel.type != "text") {
        textChannel.send("I can't be invoked in private messages, only in guilds.");
        return;
    }

    logger.log(client.shard, "  Handling message: '" + content + "'")

    var options = new Object();

    // default, will be overwritten by argument if needed
    options.voiceChannel = message.member.voiceChannel;
    options.play = true;
    options.file = getRandomAudio(politician);

    // has arguments?
    content = content.replace("!" + politician, "").trim();

    if (content != "") {
        var argumentParser = require("./util/argumentParser");
        argumentParser.parse(options, client, content, politician, guild, author, textChannel);
    }

    if (options.leave) {
        var voiceConnection = client.voiceConnections.get(guild.id);

        if (voiceConnection) {
            voiceConnection.disconnect();
            voiceConnection.channel.leave();
        }
    }

    var isBusy = isBusyInGuild(guild);

    if (isBusy) {
        textChannel.send("I am currently needed in Channel '" + isBusy.name + "'.");
        options.play = false;
    }

    if (options.play) {
        if (options.voiceChannel) {
            playAudio(options.voiceChannel, options.file, politician, textChannel);
        } else {
            textChannel.send("You have to be in a voice channel to do this.");
        }
    }
}

function isBusyInGuild(guild) {

    var connections = Array.from(client.voiceConnections.values());

    for (i = 0; i < connections.length; i++) {
        var connection = connections[i];

        if (connection.channel.guild == guild) {
            return connection.channel;
        }
    }
    return false;
}

function playAudio(voiceChannel, file, politician, textChannel) {

    // check for permissions first
    if (!voiceChannel.permissionsFor(client.user.id).has("CONNECT")) {
        textChannel.send("No permission to join this channel.")
        return;
    };
    if (!voiceChannel.permissionsFor(client.user.id).has("SPEAK")) {
        textChannel.send("No permission to speak in this channel.")
        return;
    };

    voiceChannel.join().then(connection => {

        connection.playFile(file).on("end", () => {
            connection.disconnect();
            voiceChannel.leave();
        });

    }).catch(error => {
        textChannel.send(error.toString());
    });
}

function getRandomAudio(politician) {

    var fs = require('fs');
    var files = fs.readdirSync("./audio/" + politician);

    var index = Math.floor(Math.random() * (files.length));

    return "./audio/" + politician + "/" + files[index];
}

function writeStats() {

    // write current stats
    var fileName = './stats.json';
    var file = require(fileName);

    file.guildCount = client.guilds.size;

    fs.writeFile(
        fileName,
        JSON.stringify(file, null, 2),
        function (error) {
            if (error) return logger.log(client.shard, error);
        }
    );
}