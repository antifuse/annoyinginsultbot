import Discord = require("discord.js");
import fs = require("fs");
import crypto = require("crypto");
import * as stringSimilarity from "string-similarity";
import * as winston from "winston";
import moment from "moment";
import { DataTypes, Model, Sequelize, where } from "sequelize";
import { Submitter } from "./SubmitterModel";
import { Insult } from "./InsultModel";

interface insultList {
    insults: {
        content: string,
        used: number
    }[]
}

class Insulter {
    channel: Discord.TextChannel;
    user: Discord.GuildMember;
    name: string;
    constructor(channel: Discord.TextChannel, user: Discord.GuildMember) {
        this.channel = channel;
        this.user = user;
        this.name = user.user.username + "#" + user.user.discriminator;
    }

    async insult(line: string) {
        return await this.channel.send(this.user.toString() + " " + line);
    }
}

const log = winston.createLogger({
    format: winston.format.combine(winston.format.timestamp({ format: "DD.MM. HH:mm:ss" }), winston.format.printf(info => `${info.timestamp} ${info.level} | ${info.message}`)),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "insult.log" })
    ]
});

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'insults.sqlite',
    logging: log.debug.bind(log)
});

Submitter.init({
    sid: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    userid: DataTypes.STRING,
    free: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    authcode: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        unique: true
    }
}, {
    sequelize,
    modelName: 'Submitter',
    timestamps: true,
    createdAt: false
});

Insult.init({
    iid: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    content: DataTypes.STRING,
    used: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
    }
}, {
    sequelize,
    tableName: 'Insult',
    timestamps: true,
    updatedAt: 'lastUsed'
});

let config: { token: string, victims: [{ user: string, channel: string }], min: number, max: number };
sequelize.sync().then(()=>{
    // on start: read config, import possible starting list
    let list: insultList;
    list = readInsults();
    
    config = readCfg();
    Insult.count().then(count=>{
        if (count == 0) {
            Insult.bulkCreate(list.insults.map(insult=>{return {content: insult.content, used: insult.used};}));
            Submitter.create({});
        }
    });
    client.login(config.token);
});

function readInsults() {
    return JSON.parse(fs.readFileSync("./insults.json", { encoding: "utf-8" }));
}

async function addInsult(insult: string) {
    // Check similarity with existing insults
    let insults = await Insult.findAll();
    let similarity = stringSimilarity.findBestMatch(insult.toLowerCase(), insults.map((element) => element.content.toLowerCase()));
    log.info(`Best match: ${similarity.bestMatch.target} // Rating: ${similarity.bestMatch.rating}`);

    if (similarity.bestMatch.rating > 0.8) {
        log.info(`Insult ${insult} was not added.`)
        return similarity.bestMatch.target;
    }
    log.info("No objections. Inserting...");
    Insult.create({content: insult}).then(()=>{log.info(`There are now ${insults.length + 1} insults in the list.`);});
    return null;
}

async function useRandomInsult() {
    let insults = await Insult.findAll({order: [['used','ASC']]});
    let index = between(0, insults.length / 5);
    insults[index].used++;
    insults[index].save();
    return insults[index].content;
}

// duh. get your shit together, Math
function between(min: number, max: number) {
    return Math.floor(
        Math.random() * (max - min) + min
    )
}

function readCfg() {
    return JSON.parse(fs.readFileSync("./config.json", { encoding: "utf-8" }));
}

async function approve(message: Discord.Message) {
    log.info(`User ${message.author.username}${message.author.discriminator} trying to authenticate with code ${message.content}.`);
    let freeSpace = await Submitter.findOne({where: {free: true}});
    if (!freeSpace) log.error('No active approbation code in Submitter table! Please check whatever you\'ve done wrong this time.');
    else if (freeSpace.authcode != message.content) {
        log.warn(`Doesn't match current code ${freeSpace.authcode}. Denied!`)
        message.channel.send("You are not yet an approved submitter. Please contact the owner!")
    } else {
        freeSpace.free = false;
        freeSpace.userid = message.author.id;
        await freeSpace.save();
        Submitter.create({});
        message.channel.send("Approved! Insults go in here.");
        log.info(`Approved! New code generated. There are now ${await Submitter.count()-1} approved submitters.`)
    }
}

const client = new Discord.Client();
client.on("message", async (message) => {
    if (message.channel.type != "dm" || message.author.bot) return;
    if (await Submitter.count({where:{userid: message.author.id}}) == 0) {
        approve(message);
    } else {
        log.info(`Received proposition ${message.content} from approved user ${message.author.username}#${message.author.discriminator}`)
        let denied = await addInsult(message.content);
        if (denied) message.channel.send("Too similar to: " + denied);
        else message.channel.send("Added!");
    }
});


let insulters: Insulter[] = [];
client.once("ready", async () => {
    log.info("Logged in! Bazinga!");
    for (let victim of config.victims) {
        let channel = await client.channels.fetch(victim.channel);
        if (!(channel instanceof Discord.TextChannel)) continue;
        let user = await channel.guild.members.fetch(victim.user);
        if (user) {
            insulters.push(new Insulter(channel, user));
        }
    }
    log.info(`Starting insult session with ${insulters.length} targets.`);
    insulters.forEach(doit);
});

function doit(target: Insulter) {
    useRandomInsult().then(insult=>{
        target.insult(insult).then(() => {
            log.info(`Told ${target.name} this: "${insult}". They weren't amused.`)
        }).catch((err) => {
            log.warn(`There was an error insulting ${target.name}.`);
        });
        let timeout = between(config.min * 1000, config.max * 1000);
        log.info(`Next insult in ${timeout} ms, that is at ${moment().add(timeout, "milliseconds").format("HH:mm")}`);
        setTimeout(() => { doit(target) }, timeout);
    });
}