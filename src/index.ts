import Discord = require("discord.js");
import fs = require("fs");
import crypto = require("crypto");
import * as stringSimilarity from "string-similarity";
import * as winston from "winston";
import moment from "moment";
import { CreateDatabaseOptions, DataTypes, Model, Sequelize, where } from "sequelize";
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
let config: { token: string, victims: [{ user: string, channel: string }], min: number, max: number, database: string};
config = readCfg();

const sequelize = new Sequelize(config.database, {logging: log.debug.bind(log)});

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
    tableName: 'submitter',
    timestamps: true,
    createdAt: false,
    updatedAt: 'registeredat'
});

Insult.init({
    iid: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    content: DataTypes.STRING(4096),
    used: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
    },
    by: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    sequelize,
    tableName: 'insult',
    timestamps: true,
    updatedAt: 'lastused',
    createdAt: 'createdat'
});

Submitter.hasMany(Insult, {
    as: 'insults',
    foreignKey: 'by'
});


const client = new Discord.Client();

function readInsults() {
    return JSON.parse(fs.readFileSync("./insults.json", { encoding: "utf-8" }));
}

async function addInsult(insult: string, submitter: Submitter) {
    // Check similarity with existing insults
    let insults = await Insult.findAll();
    let similarity = stringSimilarity.findBestMatch(insult.toLowerCase(), insults.map((element) => element.content.toLowerCase()));
    if (similarity.bestMatch.rating > 0.8) {
        log.info(`Insult ${insult} was rejected due to ${similarity.bestMatch.rating * 100}% similarity with  ${similarity.bestMatch.target}.`)
        return similarity.bestMatch.target;
    }
    log.info("No objections. Inserting...");
    submitter.createInsult({content: insult}).then(()=>{log.info(`There are now ${insults.length + 1} insults in the list.`);});
    submitter.save();
    return null;
}

async function useRandomInsult() {
    let insults = await Insult.findAll({order: [['used','ASC'], ['lastused', 'ASC']]});
    let index = between(0, insults.length / 5);
    insults[index].used++;
    insults[index].save();
    return insults[index].content;
}

// duh. get your shit together, Math
function between(min: number, max: number) {
    return Math.floor(
        Math.random() * (max - min) + min
    );
}

function readCfg() {
    return JSON.parse(fs.readFileSync("./config.json", { encoding: "utf-8" }));
}

async function approve(message: Discord.Message) {
    log.info(`User ${message.author.username}${message.author.discriminator} trying to authenticate with code ${message.content}.`);
    let space = await Submitter.findOne({where: {free: true, authcode: message.content}});
    if (!space) {
        log.warn(`Doesn't match current code. Denied!`)
        message.channel.send("You are not yet an approved submitter. Please contact the owner!")
    } else {
        space.free = false;
        space.userid = message.author.id;
        await space.save();
        message.channel.send("Approved! Insults go in here.");
        log.info(`Approved! There are now ${await Submitter.count({where: {free: false}})} approved submitters.`);
    }
}


client.on("message", async (message) => {
    if (message.channel.type != "dm" || message.author.bot) return;
    let submitter: Submitter | null = await Submitter.findOne({where:{userid: message.author.id}});
    if (submitter === null) {
        approve(message);
    } else {
        log.info(`Received proposition ${message.content} from approved user ${message.author.username}#${message.author.discriminator}`)
        let denied = await addInsult(message.content, submitter);
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

client.on("messageReactionAdd", (reaction, user)=>{
    if (client.user && reaction.message.author.id == client.user.id && user.id == "710217844742291516") reaction.message.reactions.removeAll();
});

async function doit(target: Insulter) {
    let insult = await useRandomInsult();
    target.insult(insult).then(()=>{
        log.info(`Told ${target.name} this: "${insult}". They weren't amused.`);
    }).catch((err) => {
        log.warn(`There was an error insulting ${target.name}.`);
    }).finally(()=>{
        let timeout = between(config.min * 1000, config.max * 1000);
        setTimeout(() => { doit(target) }, timeout);
        log.info(`Next insult in ${timeout} ms, that is at ${moment().add(timeout, "milliseconds").format("HH:mm")}`);
   });
}

(async ()=>{
    await sequelize.sync();
    // on start: read config, import possible starting list
    let list: insultList;
    list = readInsults();
    Promise.all([Insult.count(), Submitter.count()]).then(([insults, submitters])=>{
        if (insults == 0) {
            Insult.bulkCreate(list.insults);
        }
        if (submitters == 0) {
            Submitter.create();
        }
        client.login(config.token);
    })
})();
