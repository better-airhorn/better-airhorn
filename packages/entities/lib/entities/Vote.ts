import { BaseEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('blvotes')
@Index('IDX_blvotes_user_createdAt', ['user', 'createdAt'])
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
