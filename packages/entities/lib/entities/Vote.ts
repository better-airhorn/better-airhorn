import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('blvotes')
export class BotListVote extends BaseEntity {
	@PrimaryGeneratedColumn()
	public id!: number;

	@Column()
	public user!: string;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;

	@Column({ type: 'smallint' })
	public list!: BotList;
}

export enum BotList {
	TOP_GG,
}
