import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** a message with one play button per sound, posted in a guild channel */
@Entity('soundboard_panels')
export class SoundboardPanel extends BaseEntity {
	@PrimaryGeneratedColumn()
	public id!: number;

	@Column()
	public guild!: string;

	@Column()
	public channel!: string;

	/** null until the panel message has been posted */
	@Column({ type: 'varchar', nullable: true })
	public message!: string | null;

	@Column({ length: 100 })
	public title!: string;

	/** sound ids in display order */
	@Column('int', { array: true, default: () => "'{}'" })
	public sounds!: number[];

	@Column()
	public createdBy!: string;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;
}
