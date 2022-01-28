import {
	AfterInsert,
	AfterRemove,
	BaseEntity,
	Column,
	CreateDateColumn,
	Entity,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Like } from './Like';
let meili: any = null;
export function setMeiliSearch(meiliInstance: any) {
	meili = meiliInstance;
}

@Entity('sound_commands')
export class SoundCommand extends BaseEntity {
	@PrimaryGeneratedColumn()
	public id!: number;

	@Column({ unique: true })
	public name!: string;

	@Column()
	public guild!: string;

	@Column()
	public user!: string;

	@Column({ type: 'smallint' })
	public accessType!: AccessType;

	/**
	 * duration of the mp3 file in ms
	 */
	@Column('integer')
	public duration!: number;

	/**
	 * sound size in bytes
	 */
	@Column('bigint')
	public size!: number;

	/**
	 * how often the sound has been played
	 */
	@Column('integer', { default: 0 })
	public uses!: number;

	@UpdateDateColumn({ type: 'timestamp' })
	public lastUsedAt!: Date;

	@CreateDateColumn({ type: 'timestamp' })
	public readonly createdAt!: Date;

	@OneToMany(
		() => Like,
		like => like.soundCommand,
		{ lazy: true, onDelete: 'CASCADE' },
	)
	public likes!: Promise<Like[]>;

	@AfterInsert()
	public async insertInIndex() {
		if (!meili) {
			console.error('meili is not set!!!');
			return;
		}
		const index = meili.index('sounds');
		await index.addDocuments([
			{
				id: this.id,
				name: this.name,
				guild: this.guild,
				accesstype: this.accessType,
			},
		]);
	}

	@AfterRemove()
	public async removeFromIndex() {
		if (!meili) {
			console.error('meili is not set!!!');
			return;
		}
		const index = meili.index('sounds');
		await index.deleteDocument(this.id);
	}

	public constructor(values?: {
		accessType: AccessType;
		user: string;
		guild: string;
		name: string;
		duration: number;
		size: number;
	}) {
		super();
		if (values) {
			this.accessType = values.accessType;
			this.user = values.user;
			this.guild = values.guild;
			this.name = values.name;
			this.duration = values.duration;
			this.size = values.size;
		}
	}
}

export enum AccessType {
	ONLY_ME = 1,
	ONLY_GUILD = 2,
	EVERYONE = 3,
}

export const AccessTypeUserMapping = {
	me: AccessType.ONLY_ME,
	guild: AccessType.ONLY_GUILD,
	everyone: AccessType.EVERYONE,
};

export function isPlayable(sound: SoundCommand, meta: { user: string; guild: string }): boolean {
	switch (sound.accessType) {
		case AccessType.EVERYONE:
			return true;
		case AccessType.ONLY_GUILD:
			return sound.guild === meta.guild;
		case AccessType.ONLY_ME:
			return sound.user === meta.user;
		default:
			return false;
	}
}
