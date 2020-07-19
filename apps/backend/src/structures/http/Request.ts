import { Request as ERequest } from 'express';
import { DiscordProfile } from '../discord/DiscordProfile';

export interface IRequest extends ERequest {
	user?: DiscordProfile;
}
