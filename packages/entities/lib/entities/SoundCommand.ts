import { BaseEntity, Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Dislike } from './Dislike';
import { Like } from './Like';

@Entity('sound_commands')
export class SoundCommand extends BaseEntity {
	@PrimaryGeneratedColumn()
	public id!: number;

	/** also covered by a GIN trigram index (pg_trgm), managed by migrations only */
	@Index('IDX_sound_commands_name_trgm', { synchronize: false })
	@Column({ unique: true })
	public name!: string;

	/** guild the sound was uploaded in */
	@Index('IDX_sound_commands_guild')
	@Column()
	public guild!: string;

	/** uploader */
	@Index('IDX_sound_commands_user')
	@Column()
	public user!: string;

	@Column({ type: 'smallint' })
	public accessType!: AccessType;

	/** duration of the file in ms */
	@Column('bigint', { default: 0, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
	public duration!: number;

	/** stored size in bytes */
	@Column('bigint', { transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
	public size!: number;

	/** how often the sound has been played */
	@Column('integer', { default: 0 })
	public uses!: number;

	@Column({ type: 'timestamp', default: () => 'now()' })
	public lastUsedAt!: Date;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;

	@OneToMany(() => Like, like => like.soundCommand, { lazy: true })
	public likes!: Promise<Like[]>;

	@OneToMany(() => Dislike, dislike => dislike.soundCommand, { lazy: true })
	public dislikes!: Promise<Dislike[]>;
}

export enum AccessType {
	ONLY_ME = 1,
	ONLY_GUILD = 2,
	EVERYONE = 3,
}

/** whether `user`, invoking from `guild` (undefined outside a guild), may play or see the sound */
export function isPlayable(
	sound: Pick<SoundCommand, 'accessType' | 'guild' | 'user'>,
	meta: { user: string; guild?: string },
): boolean {
	switch (sound.accessType) {
		case AccessType.EVERYONE:
			return true;
		case AccessType.ONLY_GUILD:
			return sound.guild === meta.guild || sound.user === meta.user;
		case AccessType.ONLY_ME:
			return sound.user === meta.user;
		default:
			return false;
	}
}

/**
 * SQL condition equivalent to {@link isPlayable}, for an alias of `sound_commands`.
 * Binds the parameters `:accessUser` and `:accessGuild`.
 */
export function playableCondition(alias: string): string {
	return `(${alias}."accessType" = ${AccessType.EVERYONE}
		OR (${alias}."accessType" = ${AccessType.ONLY_GUILD} AND ${alias}.guild = :accessGuild)
		OR ${alias}."user" = :accessUser)`;
}
