import { BaseGuard, Message, resolveSingleton } from '@better-airhorn/shori';
import { LocalizationService } from '../services/LocalizationService';

export class VoiceChannelGuard extends BaseGuard {
	private readonly i18n = resolveSingleton<LocalizationService>(LocalizationService);

	public async canActivate(message: Message): Promise<boolean> {
		const canActivate = Boolean(message.member?.voice.channel);
		if (!canActivate) await message.error(this.i18n.t().commands.generalKeys.needToBeInVoiceChannel);
		return canActivate;
	}
}
