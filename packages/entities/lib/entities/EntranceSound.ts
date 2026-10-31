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

/** sound played when `user` joins a voice channel in `guild` */
@Entity('entrance_sounds')
export class EntranceSound extends BaseEntity {
	@PrimaryColumn()
	public guild!: string;

	@PrimaryColumn()
	public user!: string;

	@Column()
	public soundId!: number;

	@ManyToOne(() => SoundCommand, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'soundId' })
	public sound!: Relation<SoundCommand>;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;
}
