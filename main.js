import { COLLECTION_ID, GUILD_ID, ROLES_LIST} from "./config.js";
import { Client, Intents, Collection} from "discord.js";
import { Soon } from "soonaverse";

let intents = new Intents(Intents.NON_PRIVILEGED);

intents.add('GUILDS');
intents.add('GUILD_MEMBERS');

const client = new Client({intents : intents});
const soon = new Soon();

var interval = 180 * 1000;
var timeout = 0;

const rolesArray = ROLES_LIST;

function update() {
    if(timeout > 0){
        setTimeout(update, timeout);
        console.log("TIMEOUT: " + timeout);
        timeout = 0;
    } else {
        updateCurrentHolders();
        setTimeout(update, interval);
    }
}

function updateCurrentHolders() {
    soon.getNftsByCollections([COLLECTION_ID]).then(async (obj) => {
        let ethNftCount = new Map();
        let owner_addresses = new Array();
        for(var i = 0; i < obj.length; i++) 
        {
            if(owner_addresses.indexOf(obj[i]["owner"]) === -1){
                owner_addresses.push(obj[i]["owner"]);
                ethNftCount.set(obj[i]["owner"], 1);
            }
            else {
                ethNftCount.set(obj[i]["owner"], (ethNftCount.get(obj[i]["owner"]) + 1));
            }
        }
        
        const chunkSize = 10;
        let chunked = new Array();
        for (let i = 0; i < owner_addresses.length; i += chunkSize) {
            chunked.push(owner_addresses.slice(i, i + chunkSize));
        }
        
        const nftHolders = new Map();
        await Promise.all(chunked.map(async (addresses) => {
            const members = await soon.getMemberByIds(addresses);
            members.forEach( (member) => {
                if(member.discord){
                    nftHolders.set(member.discord, ethNftCount.get(member.uid));
                }    
            });
        }));
        syncBatchRoles(rolesArray, nftHolders);
    });
}

function syncBatchRoles(rolesArr, nftHolders){
    client.guilds.fetch(GUILD_ID).then(async (guild) => {
        guild.members.fetch().then(async (members) => {
            members.forEach( (member) => {
                let memberRoles = member.roles.cache;
                if(nftHolders.has(member.user.tag)){
                    let nftCount = nftHolders.get(member.user.tag);
                    let roleId;
                    for(let i = 0; i < rolesArr.length;i++){
						if(rolesArr[i].reqNFTs <= nftCount){
							roleId = rolesArr[i].roleid;
						}
					}
                    if(!member.roles.cache.has(roleId)){
                        member.roles.add(roleId, "NFT-Holder").then( (member) => {
                            console.log(member.user.tag + " - added role: " + roleId);
                        })
                    }
                    memberRoles.forEach((role) => {
                        rolesArr.forEach( entry => {
                            if(role.id == entry.roleid && role.id != roleId){
                                member.roles.remove(entry.roleid);
                                console.log(member.user.tag + " - removed role: " + entry.roleid);
                            }
                        })
                    })
                }
                else {
                    memberRoles.forEach((role) => {
                        rolesArr.forEach(entry => {
                            if(role.id == entry.roleid){
                                member.roles.remove(entry.roleid);
                                console.log(member.tag.tag + " - removed role: " + entry.roleid);
                            }
                        })
                    })
                }
            })
        })
    })
}

client.once("ready", () => {
	rolesArray.sort((a,b) => {
		return a.reqNFTs - b.reqNFTs
	})
    update();
});

client.on("rateLimit", (limit) => {
    timeout = limit.timeout;
    console.log("[TIMEOUT]: " + timeout);
});
client.on("warn", (warning) => console.log(warning));
client.on("error", console.error);

process.on('unhandledRejection', error => {
    console.log('Test error:', error);
});

client.login(process.env.API_TOKEN);