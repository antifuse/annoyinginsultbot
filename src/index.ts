import Discord = require("discord.js");
import fs = require("fs");
import crypto = require("crypto");
import * as stringSimilarity from "string-similarity";
import * as winston from "winston";
import moment from "moment";
interface insultList {
    insults: {
        content: string,
        used: number
    }[]
}

const log = winston.createLogger({
    format: winston.format.combine(winston.format.timestamp({format:'DD.MM. HH:mm:ss'}), winston.format.printf(info=>`${info.timestamp} ${info.level} | ${info.message}`)),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({filename: 'insult.log'})
    ]
})

// on start: read insults and config, generate first approbation code
let list: insultList;
list = readInsults();
let config: {token: string, victims:[{user: string, channel: string}], submitters: string[], approbationcode: string, min: number, max: number};
config = readCfg();
config.approbationcode = "##" + crypto.randomBytes(16).toString("hex");
saveCfg();

function saveInsults() {
    log.info('Saving insults...');
    fs.writeFile("./insults.json", JSON.stringify(list, null, 4), (err)=>log.error);
}

function readInsults() {
    return JSON.parse(fs.readFileSync("./insults.json", {encoding: "utf-8"}));
}

function addInsult(insult: string) {
    // Check similarity with existing insults
    let similarity = stringSimilarity.findBestMatch(insult.toLowerCase(),list.insults.map((element)=>element.content.toLowerCase()));
    log.info(`Best match: ${similarity.bestMatch.target} // Rating: ${similarity.bestMatch.rating}`);
    
    if (similarity.bestMatch.rating > 0.8) {
        log.info(`Insult ${insult} was not added.`)
        return similarity.bestMatch.target;
    } 
    list.insults.sort((a,b)=> (a.used > b.used) ? 1 : -1);
    log.info('No objections. Inserting...');
    let nsize = list.insults.push({content: insult, used: 0});
    saveInsults();
    log.info(`There are now ${nsize} insults in the list.`);
    return null;
}

function useRandomInsult(): string {
    list.insults.sort((a,b)=> (a.used > b.used) ? 1 : -1)
    let index = between(0, list.insults.length / 3);
    list.insults[index].used++;
    saveInsults();
    return list.insults[index].content;
}

// duh. get your shit together, Math
function between(min: number, max: number) {
    return Math.floor(
        Math.random() * (max - min) + min
    )
}

function saveCfg() {
    fs.writeFile("./config.json", JSON.stringify(config, null, 4), (err)=>log.error);
}

function readCfg() {
    return JSON.parse(fs.readFileSync("./config.json", {encoding: "utf-8"}));
}

function approve(message: Discord.Message) {
    log.info(`User ${message.author.username}${message.author.discriminator} trying to authenticate with code ${message.content}.`)
    if (!message.content.includes(config.approbationcode)) {
        log.warn(`Doesn't match current code ${config.approbationcode}. Denied!`)
        message.channel.send("Not a valid approbation code.")
    } else {
        config.submitters.push(message.author.id);
        config.approbationcode = "##"+crypto.randomBytes(16).toString("hex");
        saveCfg();
        message.channel.send("Approved! Insults go in here.");
        log.info(`Approved! New code generated. There are now ${config.submitters.length} approved submitters.`)
    }
}

const client = new Discord.Client();
client.on("message", (message) => {
    if (message.channel.type != "dm" || message.author.bot) return;
    config = readCfg();
    if (message.content.startsWith("##")) {
        approve(message);
    } else {
        log.info(`Received proposition ${message.content} from user ${message.author.username}${message.author.discriminator}`)
        if (config.submitters.includes(message.author.id)) {
            log.info('Approved submitter, processing...');
            let denied = addInsult(message.content);
            if (denied) message.channel.send("Too similar to: " + denied);
            else message.channel.send("Added!");
        } else {
            log.warn('Not an approved submitter!')
            message.channel.send("Not an approved submitter. Please contact the owner.")
        }
    }
});

class Insulter {
    channel: Discord.TextChannel;
    user: Discord.GuildMember;
    name: string;
    constructor(channel: Discord.TextChannel, user: Discord.GuildMember) {
        this.channel = channel;
        this.user = user;
        this.name = user.user.username + "#" + user.user.discriminator;
    }

    insult(line: string) {
        this.channel.send(this.user.toString() + " " + line);
    }
}

client.login(config.token);
let insulters: Insulter[];
client.once('ready', async () =>{
    log.info(`Logged in! Bazinga!`);
    for (let victim of config.victims) {
        let channel = await client.channels.fetch(victim.channel);
        if (!(channel instanceof Discord.TextChannel)) continue;
        let user = await channel.guild.members.fetch(victim.user);
        if (user) {
            insulters.push(new Insulter(channel, user));
        }
    }
    log.info(`Starting insult session with ${insulters.length} targets.`);
    for (let v of insulters) {
        doit(v);
    }
});

function doit(target: Insulter) {
    let insult = useRandomInsult();
    target.insult(insult);
    log.info(`Told ${target.name} this: "${insult}". They weren't amused.`)
    let timeout = between(config.min * 1000,config.max * 1000);
    log.info(`Next insult in ${timeout} ms, that is at ${moment().add(timeout, 'milliseconds').format('HH:mm')}`);
    setTimeout(()=>{doit(target)}, timeout);
}