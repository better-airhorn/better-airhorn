import { BaseEntity, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('guild_settings')
export class GuildSetting extends BaseEntity {
	@PrimaryColumn()
	public guild!: string;

	/** unused, kept so existing rows stay valid */
	@Column({ length: 5, default: '' })
	public prefix!: string;

	@Column({ default: false })
	public leaveAfterPlay!: boolean;

	@Column({ default: true })
	public sendMessageAfterPlay!: boolean;

	/** play members' entrance sounds when they join a voice channel */
	@Column({ default: true })
	public entranceSounds!: boolean;

	public static async for(guild: string): Promise<GuildSetting> {
		return (await GuildSetting.findOneBy({ guild })) ?? GuildSetting.create({ guild });
	}
}
