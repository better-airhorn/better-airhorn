import { Guild } from './Guild';

export class DiscordProfile {
	public readonly id: string;
	public name: string;
	public guilds: Guild[];
	public accessToken: string;
	public refreshToken: string;

	public constructor(
		serializable:
			| string
			| { id: string; name: string; guilds: Guild[]; accessToken: string; refreshToken: string; [key: string]: any },
	) {
		if (typeof serializable === 'string') {
			const d = JSON.parse(serializable);
			this.id = d.id;
			this.name = d.name;
			this.guilds = d.guilds ?? [];
			this.accessToken = d.accessToken;
			this.refreshToken = d.refreshToken;
		} else {
			this.id = serializable.id;
			this.name = serializable.username;
			this.guilds = serializable.guilds;
			this.accessToken = serializable.accessToken;
			this.refreshToken = serializable.refreshToken;
		}
	}

	public static serialize(serializable: string): DiscordProfile {
		return new DiscordProfile(serializable);
	}

	public deserialize(): string {
		return JSON.stringify({
			id: this.id,
			name: this.name,
			guilds: this.guilds,
			accessToken: this.accessToken,
			refreshToken: this.refreshToken,
		});
	}
}
