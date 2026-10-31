import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v5.1: the plays log, leave and Go Live sounds next to entrance sounds, house rules on guild settings, and
 * per-server blocked sounds, plus date indexes for statistics queries. New tables are empty and every added column has a constant default or is
 * nullable, so no existing table is rewritten.
 */
export class PlaysAndHouseRules1793491200000 implements MigrationInterface {
	public async up(q: QueryRunner): Promise<void> {
		await q.query(`SET LOCAL lock_timeout = '10s'`);

		await q.query(`CREATE TABLE "plays" (
			"id" SERIAL NOT NULL,
			"soundId" integer NOT NULL,
			"guild" character varying NOT NULL,
			"user" character varying NOT NULL,
			"source" character varying(16) NOT NULL,
			"createdAt" TIMESTAMP NOT NULL DEFAULT now(),
			CONSTRAINT "PK_d2e16be5395a94fdc41ab0f999d" PRIMARY KEY ("id"),
			CONSTRAINT "FK_ce67b68c12a108092ec78007a25" FOREIGN KEY ("soundId") REFERENCES "sound_commands"("id") ON DELETE CASCADE ON UPDATE NO ACTION
		)`);
		await q.query(`CREATE INDEX "IDX_plays_soundId" ON "plays" ("soundId")`);
		await q.query(`CREATE INDEX "IDX_plays_user_createdAt" ON "plays" ("user", "createdAt")`);
		await q.query(`CREATE INDEX "IDX_plays_guild_createdAt" ON "plays" ("guild", "createdAt")`);
		await q.query(`CREATE INDEX "IDX_plays_createdAt" ON "plays" ("createdAt")`);
		// ~130K rows: a plain index build takes well under a second and keeps date-range stats queries off full scans
		await q.query(`CREATE INDEX "IDX_usages_createdAt" ON "usages" ("createdAt")`);

		await q.query(`CREATE TABLE "blocked_sounds" (
			"guild" character varying NOT NULL,
			"soundId" integer NOT NULL,
			"blockedBy" character varying NOT NULL,
			"createdAt" TIMESTAMP NOT NULL DEFAULT now(),
			CONSTRAINT "PK_b3f8ac29d71c532770da2d08d60" PRIMARY KEY ("guild", "soundId"),
			CONSTRAINT "FK_ef066ae849617f788924d6e30c5" FOREIGN KEY ("soundId") REFERENCES "sound_commands"("id") ON DELETE CASCADE ON UPDATE NO ACTION
		)`);

		// existing entrance sounds become the 'join' kind
		await q.query(`ALTER TABLE "entrance_sounds" ADD "kind" character varying(8) NOT NULL DEFAULT 'join'`);
		await q.query(`ALTER TABLE "entrance_sounds" DROP CONSTRAINT "PK_7f229864b3483f1d132ff8586a8"`);
		await q.query(
			`ALTER TABLE "entrance_sounds" ADD CONSTRAINT "PK_331b7011223d249c377ad9d03b6" PRIMARY KEY ("guild", "user", "kind")`,
		);

		await q.query(`ALTER TABLE "guild_settings" ADD "maxSoundSeconds" smallint`);
		await q.query(`ALTER TABLE "guild_settings" ADD "quietStart" smallint`);
		await q.query(`ALTER TABLE "guild_settings" ADD "quietEnd" smallint`);
		await q.query(`ALTER TABLE "guild_settings" ADD "timezone" character varying(64) NOT NULL DEFAULT 'UTC'`);
		await q.query(`ALTER TABLE "guild_settings" ADD "serverSoundsOnly" boolean NOT NULL DEFAULT false`);
		await q.query(`ALTER TABLE "guild_settings" ADD "playRole" character varying`);
		await q.query(`ALTER TABLE "guild_settings" ADD "announcedVersion" character varying(16)`);
	}

	public async down(q: QueryRunner): Promise<void> {
		await q.query(`ALTER TABLE "guild_settings" DROP COLUMN "announcedVersion"`);
		await q.query(`ALTER TABLE "guild_settings" DROP COLUMN "playRole"`);
		await q.query(`ALTER TABLE "guild_settings" DROP COLUMN "serverSoundsOnly"`);
		await q.query(`ALTER TABLE "guild_settings" DROP COLUMN "timezone"`);
		await q.query(`ALTER TABLE "guild_settings" DROP COLUMN "quietEnd"`);
		await q.query(`ALTER TABLE "guild_settings" DROP COLUMN "quietStart"`);
		await q.query(`ALTER TABLE "guild_settings" DROP COLUMN "maxSoundSeconds"`);

		// only join sounds fit the old (guild, user) key
		await q.query(`DELETE FROM "entrance_sounds" WHERE "kind" <> 'join'`);
		await q.query(`ALTER TABLE "entrance_sounds" DROP CONSTRAINT "PK_331b7011223d249c377ad9d03b6"`);
		await q.query(
			`ALTER TABLE "entrance_sounds" ADD CONSTRAINT "PK_7f229864b3483f1d132ff8586a8" PRIMARY KEY ("guild", "user")`,
		);
		await q.query(`ALTER TABLE "entrance_sounds" DROP COLUMN "kind"`);

		await q.query(`DROP INDEX "IDX_usages_createdAt"`);
		await q.query(`DROP TABLE "blocked_sounds"`);
		await q.query(`DROP TABLE "plays"`);
	}
}
