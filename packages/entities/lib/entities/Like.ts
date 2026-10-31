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

@Entity('likes')
// the unique constraint's index leads with "user", so it also serves lookups by user
@Unique(['user', 'soundCommand'])
export class Like extends BaseEntity {
	@PrimaryGeneratedColumn()
	public readonly id!: number;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;

	@ManyToOne(() => SoundCommand, command => command.likes, { onDelete: 'CASCADE' })
	@Index('IDX_likes_soundCommandId')
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
