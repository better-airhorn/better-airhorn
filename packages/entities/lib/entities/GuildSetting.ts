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

	/** play members' join, leave and Go Live sounds */
	@Column({ default: true })
	public entranceSounds!: boolean;

	// ---- house rules; see house-rules.ts --------------------------------------

	/** sounds longer than this many seconds don't play; null means no cap */
	@Column({ type: 'smallint', nullable: true })
	public maxSoundSeconds!: number | null;

	/** start and end of quiet hours in minutes after local midnight; both null means no quiet hours */
	@Column({ type: 'smallint', nullable: true })
	public quietStart!: number | null;

	@Column({ type: 'smallint', nullable: true })
	public quietEnd!: number | null;

	/** IANA time zone the quiet hours are given in */
	@Column({ type: 'varchar', length: 64, default: 'UTC' })
	public timezone!: string;

	/** only sounds uploaded on this server may play */
	@Column({ default: false })
	public serverSoundsOnly!: boolean;

	/** role a member needs to play sounds; null means everyone */
	@Column({ type: 'varchar', nullable: true })
	public playRole!: string | null;

	/** the last "what's new" release shown in this server */
	@Column({ type: 'varchar', length: 16, nullable: true })
	public announcedVersion!: string | null;

	public static async for(guild: string): Promise<GuildSetting> {
		return (await GuildSetting.findOneBy({ guild })) ?? GuildSetting.create({ guild });
	}
}
