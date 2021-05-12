import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('blvotes')
export class BotListVote extends BaseEntity {
	@PrimaryColumn()
	public user!: string;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;

	@Column({ type: 'smallint' })
	public list!: BotList;
}

export enum BotList {
	TOP_GG,
}
