import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The v4 schema as TypeORM 0.3.17 `synchronize` created it in production.
 * Written idempotently: a no-op on the v4 production database, builds the schema on an empty one.
 * The v4 tables `guilds` and `statistics` are left out; v5 does not use them and they stay untouched in production.
 */
export class Baseline1700000000000 implements MigrationInterface {
	public async up(q: QueryRunner): Promise<void> {
		await q.query(`CREATE TABLE IF NOT EXISTS "sound_commands" (
			"id" SERIAL NOT NULL,
			"name" character varying NOT NULL,
			"guild" character varying NOT NULL,
			"user" character varying NOT NULL,
			"accessType" smallint NOT NULL,
			"duration" bigint NOT NULL DEFAULT '0',
			"size" bigint NOT NULL,
			"uses" integer NOT NULL DEFAULT 0,
			"lastUsedAt" TIMESTAMP NOT NULL DEFAULT now(),
			"createdAt" TIMESTAMP NOT NULL DEFAULT now(),
			CONSTRAINT "PK_2a86ba44529d056f7fb160f3464" PRIMARY KEY ("id")
		)`);
		await q.query(`CREATE TABLE IF NOT EXISTS "likes" (
			"id" SERIAL NOT NULL,
			"createdAt" TIMESTAMP NOT NULL DEFAULT now(),
			"user" character varying NOT NULL,
			"soundCommandId" integer,
			CONSTRAINT "PK_a9323de3f8bced7539a794b4a37" PRIMARY KEY ("id")
		)`);
		await q.query(`CREATE TABLE IF NOT EXISTS "dislikes" (
			"id" SERIAL NOT NULL,
			"createdAt" TIMESTAMP NOT NULL DEFAULT now(),
			"user" character varying NOT NULL,
			"soundCommandId" integer,
			CONSTRAINT "PK_ea012060fc971c41668dc3f6e8e" PRIMARY KEY ("id")
		)`);
		await q.query(`CREATE TABLE IF NOT EXISTS "guild_settings" (
			"guild" character varying NOT NULL,
			"prefix" character varying(5) NOT NULL,
			"leaveAfterPlay" boolean NOT NULL DEFAULT false,
			"sendMessageAfterPlay" boolean NOT NULL DEFAULT true,
			CONSTRAINT "PK_c14c718ba08d8dc0f9a915eb19a" PRIMARY KEY ("guild")
		)`);
		await q.query(`CREATE TABLE IF NOT EXISTS "usages" (
			"id" SERIAL NOT NULL,
			"createdAt" TIMESTAMP NOT NULL DEFAULT now(),
			"command" character varying NOT NULL,
			"user" character varying NOT NULL,
			"guild" character varying NOT NULL,
			"args" character varying,
			CONSTRAINT "PK_75c9a59a186b326ad102170e0a7" PRIMARY KEY ("id")
		)`);
		await q.query(`CREATE TABLE IF NOT EXISTS "blvotes" (
			"id" SERIAL NOT NULL,
			"user" character varying NOT NULL,
			"createdAt" TIMESTAMP NOT NULL DEFAULT now(),
			"list" smallint NOT NULL,
			CONSTRAINT "PK_96e4901e9a972d53088f709f16c" PRIMARY KEY ("id")
		)`);

		await addConstraint(q, 'sound_commands', 'UQ_a51d8a2e8db42996ef361f4bd9d', 'UNIQUE ("name")');
		await addConstraint(q, 'likes', 'UQ_4870dd88ad5315dc5772f6c39a1', 'UNIQUE ("user", "soundCommandId")');
		await addConstraint(q, 'dislikes', 'UQ_d606cd6bdcfe0b0fb39827a754e', 'UNIQUE ("user", "soundCommandId")');
		await addConstraint(
			q,
			'likes',
			'FK_676c73604329569002fee6ffe73',
			'FOREIGN KEY ("soundCommandId") REFERENCES "sound_commands"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
		);
		await addConstraint(
			q,
			'dislikes',
			'FK_14c811791d6aa8bf896266e98ea',
			'FOREIGN KEY ("soundCommandId") REFERENCES "sound_commands"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
		);
	}

	public async down(): Promise<void> {
		throw new Error('the baseline is the v4 production schema and cannot be rolled back');
	}
}

async function addConstraint(q: QueryRunner, table: string, name: string, definition: string): Promise<void> {
	await q.query(`DO $$ BEGIN
		IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}' AND conrelid = '"${table}"'::regclass) THEN
			ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${definition};
		END IF;
	END $$`);
}
