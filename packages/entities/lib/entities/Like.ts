import { BaseEntity, Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SoundCommand } from './SoundCommand';

@Entity('likes')
export class Like extends BaseEntity {
	@PrimaryGeneratedColumn()
	public readonly id: number;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt: Date;

	@ManyToOne(
		() => SoundCommand,
		command => command.likes,
	)
	public soundCommand: SoundCommand;

	@Column()
	public user: string;

	public constructor(values?: { soundCommand: SoundCommand; user: string }) {
		super();
		if (values) {
			this.soundCommand = values.soundCommand;
			this.user = values.user;
		}
	}
}
