import { BaseEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('usages')
@Index('IDX_usages_createdAt', ['createdAt'])
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
