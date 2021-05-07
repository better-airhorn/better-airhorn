import { BotListVote } from '@better-airhorn/entities';
import { BotList } from '@better-airhorn/entities/lib';
import { json } from 'body-parser';
import { createServer } from 'http';
import Redis from 'ioredis';
import restana from 'restana';
import { Config } from './Config';
import { Guards } from './util/Guards';
import { getSubLogger } from './util/Logger';

const log = getSubLogger('http');
const redis = new Redis(Config.credentials.redis);

const service = restana({
	server: createServer(),
	errorHandler: (err, req, res) => {
		log.error(err, req.body);
		res.send(500);
	},
});
service.use(json());

service.post('/votes/topgg', Guards.topgg, async (req, res) => {
	const body = req.body as { [key: string]: any };
	if (!body || typeof body !== 'object') return res.send(400);
	log.debug('received new vote');
	await (await BotListVote.findOne(body.user))?.remove();
	const vote = BotListVote.create({ user: body.user, list: BotList.TOP_GG, createdAt: new Date() });
	await vote.save();
	await dispatchMessage({ user: body.user, list: BotList.TOP_GG });
	res.send(200);
});

async function dispatchMessage(message: { user: string; list: BotList }) {
	await redis.publish(Config.redis.voteChannel, JSON.stringify(message));
}
export const server = service;
