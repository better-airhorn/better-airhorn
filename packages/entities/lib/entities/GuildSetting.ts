import { BaseEntity, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('guild_settings')
export class GuildSetting extends BaseEntity {
	@PrimaryColumn()
	public guild: string;

	@Column({ length: 5 })
	public prefix: string;

	@Column({ default: false })
	public leaveAfterPlay: boolean;

	@Column({ default: true })
	public sendMessageAfterPlay: boolean;

	public constructor(values?: { guild: string; prefix: string }) {
		super();
		if (values) {
			this.prefix = values.prefix;
			this.guild = values.guild;
		}
	}
}
