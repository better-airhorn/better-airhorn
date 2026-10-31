import {
	BaseEntity,
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
	type Relation,
} from 'typeorm';
import { SoundCommand } from './SoundCommand';

/** when a personal voice sound plays: joining a channel, leaving it, or starting Go Live */
export type EntranceKind = 'join' | 'leave' | 'stream';
export const entranceKinds: readonly EntranceKind[] = ['join', 'leave', 'stream'];

/** sound played for `user` in `guild` on the voice event `kind` */
@Entity('entrance_sounds')
export class EntranceSound extends BaseEntity {
	@PrimaryColumn()
	public guild!: string;

	@PrimaryColumn()
	public user!: string;

	@PrimaryColumn({ type: 'varchar', length: 8, default: 'join' })
	public kind!: EntranceKind;

	@Column()
	public soundId!: number;

	@ManyToOne(() => SoundCommand, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'soundId' })
	public sound!: Relation<SoundCommand>;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;
}
