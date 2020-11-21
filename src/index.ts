import Discord = require("discord.js");
import fs = require("fs");
import crypto = require("crypto");
import * as stringSimilarity from "string-similarity"
interface insultList {
    insults: {
        content: string,
        used: number
    }[]
}
let list: insultList;
list = readInsults();
let config: {token: string, user: string, channel: string, submitters: string[], approbationcode: string, min: number, max: number};
config = readCfg();
config.approbationcode = "##" + crypto.randomBytes(16).toString("hex");
saveCfg();

function saveInsults() {
    fs.writeFile("./insults.json", JSON.stringify(list, null, 4), (err)=>console.log);
}

function readInsults() {
    return JSON.parse(fs.readFileSync("./insults.json", {encoding: "utf-8"}));
}

function addInsult(insult: string) {
    let similarity = stringSimilarity.findBestMatch(insult,list.insults.map((element)=>element.content));
    if (similarity.bestMatch.rating > 0.9) return similarity.bestMatch.target;
    list.insults.sort((a,b)=> (a.used > b.used) ? 1 : -1);
    list.insults.push({content: insult, used: list.insults[list.insults.length / 3].used});
    saveInsults();
    return null;
}

function useRandomInsult(): string {
    list.insults.sort((a,b)=> (a.used > b.used) ? 1 : -1)
    let index = between(0, list.insults.length / 3);
    list.insults[index].used++;
    saveInsults();
    return list.insults[index].content;
}

function between(min: number, max: number) {
    return Math.floor(
        Math.random() * (max - min) + min
    )
}

function saveCfg() {
    fs.writeFile("./config.json", JSON.stringify(config, null, 4), (err)=>console.log);
}

function readCfg() {
    return JSON.parse(fs.readFileSync("./config.json", {encoding: "utf-8"}));
}

function approve(message: Discord.Message) {
    if (!message.content.includes(config.approbationcode)) {
        message.channel.send("Not a valid approbation code.")
    } else {
        config.submitters.push(message.author.id);
        config.approbationcode = "##"+crypto.randomBytes(16).toString("hex");
        saveCfg();
        message.channel.send("Approved! Insults go in here.")
    }
}

const client = new Discord.Client();
client.on("message", (message) => {
    if (message.channel.type != "dm" || message.author.bot) return;
    readCfg();
    if (message.content.startsWith("##")) {
        approve(message);
    } else {
        if (config.submitters.includes(message.author.id)) {
            let denied = addInsult(message.content);
            if (denied) message.channel.send("Too similar to: " + denied);
            else message.channel.send("Added!");
        } else {
            message.channel.send("Not an approved submitter. Please contact the owner.")
        }
    }
})
let ic: Discord.TextChannel;
let user: Discord.GuildMember;
client.login(config.token);

client.once('ready', async () =>{
    let channel = await client.channels.fetch(config.channel);
    if (channel instanceof Discord.TextChannel) {
        ic = channel;
    }
    user = await ic.guild.members.fetch(config.user);
    doit();
});

function doit() {
    ic.send(user.toString() + " " + useRandomInsult());
    setTimeout(doit, between(config.min * 1000,config.max * 1000))
}