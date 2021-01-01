import { BaseEntity, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('guilds')
export class Guild extends BaseEntity {
	@PrimaryColumn()
	public readonly id!: string;

	@Column()
	public name!: string;

	@Column()
	public iconURL!: string;

	@Column()
	public memberCount!: number;

	@Column()
	public owner!: string;
}
