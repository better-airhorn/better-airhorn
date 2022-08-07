import { Client, Intents, MessageEmbed } from 'discord.js';
import { GuildSetting } from '@better-airhorn/entities';
import { createConnection } from 'typeorm';
import { createLogger } from 'bunyan';

const logger = createLogger({ name: 'ba', level: 'debug' });
const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const commands = [
	'config',
	'prefix',
	'help',
	'ping',
	'stats',
	'status',
	'invite',
	'delete',
	'import',
	'importyt',
	'leave',
	'like',
	'list',
	'listen',
	'play',
	'random',
	'soundinfo',
	'stop',
	'exec',
	'locks',
	'time',
];

const deprecationMessage = `**⚠️ Regular commands have been replaced in favor of slash commands.**
<t:1656691200:R> regular commands stopped working as required by discord and the bot will only respond to slash commands.
Type / to see a list of all commands.

If you can't see a list of commands for Better-Airhorn, try re-adding the bot using the link below:`;

(async (): Promise<void> => {
	await createConnection({
		name: 'default',
		type: 'postgres',
		url: `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@postgres:5432/postgres`,
		synchronize: false,
		entities: [GuildSetting],
	});
	const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

	client.on('debug', (log: string) => logger.debug(log));

	client.on('ready', () => {
		logger.info(`client is logged in as ${client.user?.tag}`);
	});

	client.on('messageCreate', async message => {
		const { content, author, guild, channel } = message;
		// @ts-ignore
		console.log(channel.type, channel.permissionsFor(guild.me!).has('SEND_MESSAGES'));
		if (author.bot || !guild || channel.type !== 'GUILD_TEXT' || channel.permissionsFor(guild.me!).has('SEND_MESSAGES'))
			return;

		const prefix =
			(await GuildSetting.findOne(guild.id)
				.then(settings => settings?.prefix)
				.catch(() => undefined)) ?? '$';
		console.log(prefix);
		const prefixRegex = new RegExp(`^(<@!?${client.user!.id}>|${escapeRegex(prefix)})\\s*`);
		if (!prefixRegex.test(content)) return;

		const match = prefixRegex.exec(content);
		if (!match) return;
		const [, matchedPrefix] = match;

		const args = content
			.slice(matchedPrefix.length)
			.trim()
			.split(/ +/);
		const command = args.shift()!.toLowerCase();

		if (commands.includes(command)) {
			const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${client.application?.id}&permissions=274881431616&scope=bot%20applications.commands&guild_id=${guild.id}`;
			if (channel.permissionsFor(guild.me!).has('EMBED_LINKS')) {
				await channel
					.send({
						embeds: [
							new MessageEmbed()
								.setColor('DARK_RED')
								.setDescription(`${deprecationMessage}\n[Invite me](${inviteLink})`),
						],
					})
					.catch(() => logger.error('failed to send deprecation message'));
			} else {
				await channel
					.send(`${deprecationMessage}\n${inviteLink}`)
					.catch(() => logger.error('failed to send deprecation message'));
			}
		}
	});

	await client.login(process.env.DISCORD_TOKEN);
})().catch(e => {
	throw e;
});
