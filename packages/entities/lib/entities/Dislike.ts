import { BaseEntity, Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { SoundCommand } from './SoundCommand';

@Entity('dislikes')
@Unique(['user', 'soundCommand'])
export class Dislike extends BaseEntity {
	@PrimaryGeneratedColumn()
	public readonly id!: number;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;

	@ManyToOne(
		() => SoundCommand,
		command => command.dislikes,
		{ onDelete: 'CASCADE' },
	)
	public soundCommand!: SoundCommand;

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
