import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v4 -> v5: entrance sounds, soundboard panels, nullable usage guild, and the indexes the v5 queries rely on.
 * Every statement is metadata-only or touches a small table; `usages` is never rewritten or scanned.
 */
export class V51793404800000 implements MigrationInterface {
	public async up(q: QueryRunner): Promise<void> {
		// fail fast instead of queueing behind a long-running query while holding locks
		await q.query(`SET LOCAL lock_timeout = '10s'`);

		await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
		await q.query(`CREATE INDEX "IDX_sound_commands_name_trgm" ON "sound_commands" USING gin ("name" gin_trgm_ops)`);
		await q.query(`CREATE INDEX "IDX_sound_commands_user" ON "sound_commands" ("user")`);
		await q.query(`CREATE INDEX "IDX_sound_commands_guild" ON "sound_commands" ("guild")`);
		// lookups by user are served by the ("user", "soundCommandId") unique constraints
		await q.query(`CREATE INDEX "IDX_likes_soundCommandId" ON "likes" ("soundCommandId")`);
		await q.query(`CREATE INDEX "IDX_dislikes_soundCommandId" ON "dislikes" ("soundCommandId")`);
		await q.query(`CREATE INDEX "IDX_blvotes_user_createdAt" ON "blvotes" ("user", "createdAt")`);

		// constant default: stored in the catalog, existing rows are not rewritten
		await q.query(`ALTER TABLE "guild_settings" ADD "entranceSounds" boolean NOT NULL DEFAULT true`);
		await q.query(`ALTER TABLE "guild_settings" ALTER COLUMN "prefix" SET DEFAULT ''`);
		// catalog-only change, no table scan
		await q.query(`ALTER TABLE "usages" ALTER COLUMN "guild" DROP NOT NULL`);

		await q.query(`CREATE TABLE "entrance_sounds" (
			"guild" character varying NOT NULL,
			"user" character varying NOT NULL,
			"soundId" integer NOT NULL,
			"createdAt" TIMESTAMP NOT NULL DEFAULT now(),
			CONSTRAINT "PK_7f229864b3483f1d132ff8586a8" PRIMARY KEY ("guild", "user"),
			CONSTRAINT "FK_1307488c1dfcb1687377e77fbc2" FOREIGN KEY ("soundId") REFERENCES "sound_commands"("id") ON DELETE CASCADE ON UPDATE NO ACTION
		)`);
		await q.query(`CREATE TABLE "soundboard_panels" (
			"id" SERIAL NOT NULL,
			"guild" character varying NOT NULL,
			"channel" character varying NOT NULL,
			"message" character varying,
			"title" character varying(100) NOT NULL,
			"sounds" integer array NOT NULL DEFAULT '{}',
			"createdBy" character varying NOT NULL,
			"createdAt" TIMESTAMP NOT NULL DEFAULT now(),
			CONSTRAINT "PK_5ec9ef7f72ae8996bc88219aa43" PRIMARY KEY ("id")
		)`);
	}

	public async down(q: QueryRunner): Promise<void> {
		await q.query(`DROP TABLE "soundboard_panels"`);
		await q.query(`DROP TABLE "entrance_sounds"`);

		// v4 requires a guild on every usage; scans and locks all of `usages`
		await q.query(`UPDATE "usages" SET "guild" = '' WHERE "guild" IS NULL`);
		await q.query(`ALTER TABLE "usages" ALTER COLUMN "guild" SET NOT NULL`);
		await q.query(`ALTER TABLE "guild_settings" ALTER COLUMN "prefix" DROP DEFAULT`);
		await q.query(`ALTER TABLE "guild_settings" DROP COLUMN "entranceSounds"`);

		await q.query(`DROP INDEX "IDX_blvotes_user_createdAt"`);
		await q.query(`DROP INDEX "IDX_dislikes_soundCommandId"`);
		await q.query(`DROP INDEX "IDX_likes_soundCommandId"`);
		await q.query(`DROP INDEX "IDX_sound_commands_guild"`);
		await q.query(`DROP INDEX "IDX_sound_commands_user"`);
		await q.query(`DROP INDEX "IDX_sound_commands_name_trgm"`);
		// pg_trgm stays: v4 installs it on startup as well
	}
}
