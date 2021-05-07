import { Protocol, Request, RequestHandler, Response } from 'restana';
import { Config } from '../Config';
import { getSubLogger } from './Logger';
const log = getSubLogger('Auth');

export const Guards: { [key: string]: RequestHandler<Protocol.HTTP> } = {
	topgg: (req: Request<Protocol.HTTP>, res: Response<Protocol.HTTP>, next: (error?: unknown) => void) => {
		if (req.headers.authorization === Config.credentials.secrets.topgg) return next();
		log.warn('request to top.gg endpoint with wrong authorization header: %s', req.headers.authorization);
		res.send(401);
	},
};
