import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('statistics')
export class Statistic extends BaseEntity {
	@PrimaryGeneratedColumn()
	public id!: number;

	@Column()
	public event!: string;

	@Column()
	public value!: number;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;

	public constructor(values?: { event: string; value: number }) {
		super();
		if (values) {
			this.event = values.event;
			this.value = values.value;
		}
	}
}

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

	@Column()
	public guild!: string;

	@Column({ nullable: true })
	public args?: string;
}
