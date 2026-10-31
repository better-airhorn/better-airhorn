import {
	BaseEntity,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	type Relation,
} from 'typeorm';
import { SoundCommand } from './SoundCommand';

/** how a playback was started */
export type PlaySource = 'command' | 'panel' | 'button' | 'quiz' | 'entrance' | 'exit' | 'stream';

/** one row per playback that actually started; written by voicenode */
@Entity('plays')
@Index('IDX_plays_createdAt', ['createdAt'])
@Index('IDX_plays_guild_createdAt', ['guild', 'createdAt'])
@Index('IDX_plays_user_createdAt', ['user', 'createdAt'])
export class Play extends BaseEntity {
	@PrimaryGeneratedColumn()
	public id!: number;

	@Index('IDX_plays_soundId')
	@Column()
	public soundId!: number;

	// deleting a sound removes its play history too, as the privacy policy promises
	@ManyToOne(() => SoundCommand, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'soundId' })
	public sound!: Relation<SoundCommand>;

	@Column()
	public guild!: string;

	@Column()
	public user!: string;

	@Column({ type: 'varchar', length: 16 })
	public source!: PlaySource;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;
}
