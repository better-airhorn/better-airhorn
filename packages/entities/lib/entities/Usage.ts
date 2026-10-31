import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('usages')
export class Usage extends BaseEntity {
	@PrimaryGeneratedColumn()
	public id!: number;

	@CreateDateColumn({ type: 'timestamp' })
	public createdAt!: Date;

	@Column()
	public command!: string;

	@Column()
	public user!: string;

	/** null for interactions outside a guild */
	@Column({ type: 'varchar', nullable: true })
	public guild!: string | null;

	@Column({ nullable: true })
	public args?: string;
}
