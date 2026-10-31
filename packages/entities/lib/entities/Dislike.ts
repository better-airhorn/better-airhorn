import {
	BaseEntity,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	ManyToOne,
	PrimaryGeneratedColumn,
	type Relation,
	Unique,
} from 'typeorm';
import { SoundCommand } from './SoundCommand';

@Entity('dislikes')
// the unique constraint's index leads with "user", so it also serves lookups by user
@Unique(['user', 'soundCommand'])
export class Dislike extends BaseEntity {
	@PrimaryGeneratedColumn()
	public readonly id!: number;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;

	@ManyToOne(() => SoundCommand, command => command.dislikes, { onDelete: 'CASCADE' })
	@Index('IDX_dislikes_soundCommandId')
	public soundCommand!: Relation<SoundCommand>;

	@Column()
	public user!: string;

	public constructor(values?: { soundCommand: SoundCommand; user: string }) {
		super();
		if (values) {
			this.soundCommand = values.soundCommand;
			this.user = values.user;
		}
	}
}
