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

/** a sound a server's admins don't allow to play there */
@Entity('blocked_sounds')
export class BlockedSound extends BaseEntity {
	@PrimaryColumn()
	public guild!: string;

	@PrimaryColumn()
	public soundId!: number;

	@ManyToOne(() => SoundCommand, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'soundId' })
	public sound!: Relation<SoundCommand>;

	@Column()
	public blockedBy!: string;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;
}
