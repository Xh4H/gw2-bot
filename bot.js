const Discord = require('discord.js');
const client = new Discord.Client();
const api_client = require('gw2api-client');
const mariadb = require('mariadb');
var moment = require('moment');
const https = require('https');
///////////////////////////////////////////////////
/////////////// MariaDB Connection ///////////////
/////////////////////////////////////////////////
var pool = mariadb.createPool({
	host: 'host',
	port: 'port',
	user: 'user',
	password: "password",
	database: 'database'
});

///////////////////////////////////////////////////
/////////////////// BOT VARS /////////////////////
/////////////////////////////////////////////////

let baruch;
let worlds = {};
let scores = {};
let channels = ["549301022930108427", "549301145386876975", "549301159740047380"];
const GUILD_ID = "515468719519170561";
var GUILD_OBJECT;
var BOT_ROLE_CONTROLLER;
var ROLE_BARUCHIANO;

const clean = text => {
	if (typeof(text) === "string")
		return text.replace(/`/g, "`" + String.fromCharCode(8203)).replace(/@/g, "@" + String.fromCharCode(8203));
	else
		return text;
}

pool.getConnection()
	.then(conn => {

		function hasRights(member) {
			if (!member) return false;
			let hasRole = false;

			member.roles.map((obj, id) => {
				if (id == BOT_ROLE_CONTROLLER.id) hasRole = true;
			});

			return hasRole;
		}

		function retrieveAPIKeyInfo(key) {
			let api = api_client();

			api.language('en');
			api.authenticate(key);

			return api.account().get()	
		}

		function existsAPIFromDB(key) {
			return new Promise(function(resolve, reject) {
				conn.query({
						rowsAsArray: true,
						sql: 'SELECT api FROM `apis` WHERE api = ?'
					}, [key])
						.then(api => {
							resolve(api[0] && api[0][0]);
						});
			});
		}

		function insertKey(key, author) {
			return conn.query("INSERT INTO apis(api, discord_id) VALUE (?, ?)", [key, author]);
		}

		function removeAPIFromDB(user) {
			return conn.query("DELETE FROM `apis` WHERE discord_id = ?", [user]);
		}

		function retrieveBans() {
			return new Promise(function(resolve, reject) {
				conn.query({
						rowsAsArray: true,
						sql: 'SELECT nombre, motivo FROM `bans`'
					})
						.then(data => {
							let output = ""
							if (data[0]) {
								for (let i = 0; i <= data.length -1; i++) {
									output += data[i][0] + ": " + data[i][1] + "\n";
								}
							}
							resolve(output);
						});
			})
		}

		function changeBanStatus(user, author, status, reason, nombre) {
			let num_status = status ? 1 : 0; // true -> 1 ; false -> 0
			let datetime = moment().format('YYYY-MM-DD hh:mm:ss');
			return new Promise(function(resolve, reject) {
				conn.query({
						rowsAsArray: true,
						sql: "SELECT user FROM `bans` WHERE user = ? "
					}, [user])
					.then(usr => {
						if (!usr[0]) {
							if (status) {
								conn.query("INSERT INTO bans(banned_by, banned_at, user, motivo, nombre) VALUE (?, ?, ?, ?);", [
										author,
										datetime,
										user,
										reason,
										nombre
									])
									.then(() => {
										conn.query({
												rowsAsArray: true,
												sql: "SELECT ban_id FROM bans WHERE user = ?;"
											}, [user])
											.then(ban_id => {
												ban_id = ban_id[0][0];
												conn.query("UPDATE `apis` SET ban_id = ? WHERE discord_id = ?", [ban_id, user])
													.then(() => resolve(true))
													.catch(err => reject(err));
											})
											.catch(err => reject(err));
									})
									.catch(err => reject(err));
							} else {
								conn.query("INSERT INTO unbans(unbanned_by, unbanned_at, user, motivo, nombre) VALUE (?, ?, ?, ?);", [
										author,
										datetime,
										user,
										reason,
										nombre
									])
									.then(() => {
										conn.query("DELETE FROM `bans` WHERE user = ?", [user]);
										conn.query("UPDATE `apis` SET ban_id = NULL WHERE discord_id = ?", [user])
											.then(() => resolve(true))
											.catch(err => reject(err));

									})
									.catch(err => reject(err));
							}
						} else {
							if (status) {
								reject("Este usuario ya ha sido baneado anteriormente.");
							} else {
								reject("Este usuario no ha sido baneado aún.");
							}
							
						}
					})
			});
		}

		function check(id) {
			return new Promise(function(resolve, reject) {
				conn.query({
						rowsAsArray: true,
						sql: "SELECT api FROM `apis` WHERE discord_id = ? "
					}, [id])
					.then(data => {
						resolve(data[0]);
					})
			});
		}

		function success(message, content) {
			let msg = message.channel.send({embed: {
				color: 4387977,
				title: "Info",
				description: content,
				footer: {
					icon_url: "https://cdn.discordapp.com/avatars/544918362686357531/53ee0ebaf9395b3650ee808d9b7b64e1.png?size=128",
					text: "Bot creado por Async#0001"
				}
			}})
		}

		function warning(message, content) {
			let msg = message.channel.send({embed: {
				color: 15856705,
				title: "Warning",
				description: content,
				footer: {
					icon_url: "https://cdn.discordapp.com/avatars/544918362686357531/53ee0ebaf9395b3650ee808d9b7b64e1.png?size=128",
					text: "Bot creado por Async#0001"
				}
			}})
		}

		function error(message, content) {
			message.channel.send({embed: {
				color: 16008769,
				title: "Error",
				description: content,
				footer: {
					icon_url: "https://cdn.discordapp.com/avatars/544918362686357531/53ee0ebaf9395b3650ee808d9b7b64e1.png?size=128",
					text: "Bot creado por Async#0001"
				}
			}})
		}

		client.on('ready', () => {
			console.log(`Logged in as ${client.user.tag}!`);

			client.guilds.map((obj, id) => {
				if (id === GUILD_ID) GUILD_OBJECT = obj;
			})
			GUILD_OBJECT.roles.map((obj, id) => {
				if (obj.name === "wvw-controller") BOT_ROLE_CONTROLLER = obj;
				if (obj.name === "Baruchiano") ROLE_BARUCHIANO = obj;
			})
			if (BOT_ROLE_CONTROLLER == undefined) {
				GUILD_OBJECT.createRole({
					name: 'wvw-controller',
					color: 'GREEN',
				})
					.then(role => BOT_ROLE_CONTROLLER = role)
  					.catch(console.error);
			}

			retrievePoints(client);
			setInterval(function() {
				retrievePoints(client);
			}, 60000 * 2);

			updateMatchup(2301);
		});

		client.on('guildBanAdd', (guild, user) => {
			changeBanStatus(user.id, "0", 1, "Unkwown", user.username)
		});

		client.on('guildBanRemove', (guild, user) => {
			changeBanStatus(user.id, "0", 0, "Unkwown", user.username)
		});

		let prefix = "!"
		client.on('message', msg => {
			let message = msg;
			const args = msg.content.slice(prefix.length).trim().split(/ +/g);
			const command = args.shift().toLowerCase();

			if (message.channel.id == "546300168555855882" && message.author.id != "544918362686357531" && message.author.id != "191442101135867906") {
				console.log(message.content);
				message.delete()
			}

			if (command === "eval") {
				if (message.author.id == "191442101135867906") {
					try {
						const code = args.join(" ");
						let evaled = eval(code);

						if (typeof evaled !== "string")
							evaled = require("util").inspect(evaled);

						message.channel.send(clean(evaled), {code:"xl"});
					} catch (err) {
						message.channel.send(`\`ERROR\` \`\`\`xl\n${clean(err)}\n\`\`\``);
					}
				}
			}

			if (command === "check") {
				check(message.author.id)
					.then(data => {
						if (data) {
							GUILD_OBJECT.fetchMember(msg.author)
								.then(member => {
									member.addRole(ROLE_BARUCHIANO)
										.then((a) => success(message, "Todo ok!"))
										.catch(err => error(message, "Ha ocurrido el siguiente error: **" + err.message + "**\nContacta con Async#0001 para solucionarlo."));
								})
								.catch(err => error(message, "Ha ocurrido el siguiente error: **" + err.message + "**\nContacta con Async#0001 para solucionarlo."));
						}
					})
			}

			if (command === "api") {
				if (message.guild) return error(message, "Mándame la API por privado.");

				let key = args[0];
				if (!key || key.length < 10) warning(message, "API inválida.");
				else {
					existsAPIFromDB(key)
						.then(exists => {
							if (exists) {
								warning(message, "Esa clave API ya se ha usado anteriormente.");
							} else {
								retrieveAPIKeyInfo(key)
									.then(acc => {
										insertKey(key, msg.author.id);
										if (acc.world != 2301) return;

										success(message, "Cuenta de GW2 encontrada. Bienvenido " + acc.name);
										GUILD_OBJECT.fetchMember(msg.author)
											.then(member => {
												member.setNickname(acc.name, key);
												member.addRole(ROLE_BARUCHIANO)
													.catch(err => error(message, "Ha ocurrido el siguiente error: **" + err.message + "**\nContacta con Async#0001 para solucionarlo."));
											})
											.catch(err => error(message, "Ha ocurrido el siguiente error: **" + err.message + "**\nContacta con Async#0001 para solucionarlo."));
									})
									.catch(err => error(message, "Ha ocurrido el siguiente error: **" + err + "**\nContacta con Async#0001 para solucionarlo."));
							}
						
						})
						.catch(err => error(message, "Ha ocurrido el siguiente error: **" + err + "**\nContacta con Async#0001 para solucionarlo."));
				}
			} else if (command === "removeapi") {
				removeAPIFromDB(message.author.id)
					.then(() => success(message, "Tu API ha sido quitada de la base de datos."))
					.catch(err => error(message, "Ha ocurrido el siguiente error: **" + err + "**\nContacta con Async#0001 para solucionarlo."));
			} else if (command === "ban") {
				if (!hasRights(message.member)) return warning(message, "No tienes permisos para ejecutar esto");

				if (message.mentions.users.first()) {
					let user_id = message.mentions.users.first().id;
					let motivo = args.slice(1, args.length).concat(" ")[0];

					if (motivo === " ") warning(message, "por favor, introduce un motivo.")
					else {
						changeBanStatus(user_id, message.author.id, true, motivo, message.author.username)
							.then(bool => success(message, "Usuario baneado correctamente."))
							.catch(err => error(message, "Ha ocurrido el siguiente error: **" + err + "**\nContacta con Async#0001 para solucionarlo."));
					}
				} else {
					warning(message, "Menciona a quien quieres banear.")
				}
			} else if (command === "unban") {
				if (!hasRights(message.member)) return warning(message, "No tienes permisos para ejecutar esto");

				if (message.mentions.users.first()) {
					let user_id = message.mentions.users.first().id;
					let motivo = args.slice(1, args.length).concat(" ")[0];

					if (motivo === " ") warning(message, "por favor, introduce un motivo.")
					else {
						GUILD_OBJECT.fetchMember(msg.author)
							.then(member => member.ban())
							.catch(err => error(message, "Ha ocurrido el siguiente error: **" + err.message + "**\nContacta con Async#0001 para solucionarlo."));
						changeBanStatus(user_id, message.author.id, false, motivo, message.author.username)
							.then(bool => success(message, "Usuario desbaneado correctamente."))
							.catch(err => error(message, "Ha ocurrido el siguiente error: **" + err + "**\nContacta con Async#0001 para solucionarlo."));
					}
				}
			} else if (command === "banlist") {
				if (!hasRights(message.member)) return warning(message, "No tienes permisos para ejecutar esto");
				
				retrieveBans().then(list => message.reply(list));
			}
		});
		client.login('token');

		// Para que no se cierre la conexión con el servidor (keep-alive)
		setInterval(function() {
			conn.query("SELECT 1");
		}, 60000)
    });

https.get('https://api.guildwars2.com/v2/worlds?ids=all', (res) => {

	let data = "";
	res.on('data', (d) => {
		data += d;
	});

	res.on("end", () => {
		data = JSON.parse(data);

		for (let i = 0; i < data.length; i++) {
			let world = data[i];
			worlds[world["id"]] = world["name"]
		}
	})

}).on('error', (e) => {
	console.error(e);
});

function retrievePoints(client) {
	https.get('https://api.guildwars2.com/v2/wvw/matches?ids=all', (res) => {
		let data = "";
		res.on('data', (d) => {
			data += d;
		});

		res.on("end", () => {
			data = JSON.parse(data);
			let found = false;
			let values = {};
			let last_i;

			for (let i = 0; i < data.length && !found; i++) {
				let value;
				let map = data[i].worlds;
				
				values = {};
				Object.keys(map).forEach(function(key) {
					value = map[key];
					values[key] = value;
					if (value == 2301) {
						found = true;
						last_i = i;
					}
				});
			}

			setTimeout(function() {
				Object.keys(values).forEach(function(key) {
					value = values[key];

					scores[worlds[value]] = data[last_i].victory_points[key];
				});
				changeChannelNames();
			}, 5000)
		})

	}).on('error', (e) => {
		console.error(e);
	});
}

function changeChannelNames() {
	let i = 0;
	Object.keys(scores).forEach(function(key) {
		let puntos = scores[key];
		let channel_id = channels[i++];

		GUILD_OBJECT.channels.map((obj, id) => {
			if (id === channel_id) obj.setName(key + ": " + puntos);
		});
	});
}

function updateMatchup(id) {
	https.get('https://api.guildwars2.com/v2/wvw/matches?ids=all', (res) => {
		let data = "";
		res.on('data', (d) => {
			data += d;
		});

		res.on("end", () => {
			data = JSON.parse(data);
			baruch_match = data.filter(match => match.worlds.red == id || match.worlds.green == id || match.worlds.blue == id)[0];
			baruch_match.skirmishes = null;
			baruch_match.maps = null;
		});
	});

	return true;
}
