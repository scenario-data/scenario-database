import expect = require("expect.js");

import { QueryRunner } from "../query_runner/query_runner_api";
import { executeMigrations, prepare } from "../migrations/execute_migrations";
import { migrate } from "../migrations/migrations_builder";
import { EntityDefInstanceFromMeta } from "../migrations/metadata";
import { ApplyMigrations } from "../migrations/apply_migrations_api";
import { EntityDef } from "../../definition/entity";
import { createRead } from "./read";
import { isVersionId, masterBranchId } from "../../temporal";
import { LocalDateTime } from "js-joda";
import { rootUserId } from "../../user";
import { pgFormat } from "../../misc/pg_format";
import { getQueryRunner } from "../query_runner/query_runner";
import { namedBranchId, namedUserId } from "../named_constants";
import { devDbConnectionConfig } from "../../config/dev_database_connection";


describe("Database read", () => {
    let queryRunner: QueryRunner;
    beforeEach(async () => {
        queryRunner = await getQueryRunner("tst-read-api", devDbConnectionConfig, true);
        await queryRunner.startTransaction();
        await prepare(queryRunner);
    });

    afterEach(async () => {
        await queryRunner.rollbackTransaction();
    });

    it("Should return basic info about the object", async () => {
        const migrations = migrate({})
            .addType("Target")
            .done();

        await executeMigrations(queryRunner, migrations);
        const res = await queryRunner.query(pgFormat(`INSERT INTO "public".%I ("branch", "by") VALUES (%L, %L) RETURNING "id"`, ["Target", namedBranchId(masterBranchId), namedUserId(rootUserId)]));
        const itemId = res.rows[0]!.id;

        const Target: EntityDef<EntityDefInstanceFromMeta<ApplyMigrations<{}, typeof migrations>, "Target">> = class {};
        const read = createRead(queryRunner, { Target });

        const { basic } = await read({ basic: {
            type: Target,
            ids: [itemId],
            branch: masterBranchId,
            references: {},
        } });

        expect(basic).to.have.length(1);
        const item = basic[0]!;

        expect(item).to.have.property("id");
        expect(item.id).to.eql(itemId);

        expect(item).to.have.property("at");
        expect(isVersionId(item.at)).to.be(true);

        expect(item).to.have.property("ts");
        expect(item.ts).to.be.a(LocalDateTime);
        expect(item.ts.isAfter(LocalDateTime.now().minusMinutes(1))).to.be(true);

        expect(item).to.have.property("by");
        expect(item.by).to.eql(rootUserId);
    });
});
