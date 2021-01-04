import expect = require("expect.js");

import { QueryRunner } from "../query_runner/query_runner_api";
import { getQueryRunner } from "../query_runner/query_runner";
import { devDbConnectionConfig } from "../../config/dev_database_connection";
import { prepare } from "../migrations/execute_migrations";
import { BranchingApi } from "./branch_api";
import { createBranching } from "./branch";
import { isBranchId, masterBranchId } from "../../temporal";
import { rootUserId } from "../../user";
import { hydrateVersionId } from "../db_values/from_db_values";
import { serializeBranchId } from "../db_values/to_db_values";
import { atLeastOne } from "../../misc/typeguards";


describe("Branching", () => {
    let queryRunner: QueryRunner;
    let branchingApi: BranchingApi;
    beforeEach(async () => {
        queryRunner = await getQueryRunner("tst-branching-api", devDbConnectionConfig, true);
        await queryRunner.startTransaction();
        await prepare(queryRunner);

        branchingApi = createBranching(queryRunner);
    });

    afterEach(async () => {
        await queryRunner.rollbackTransaction();
    });

    it("Should return a branch id when called with desired start_version", async () => {
        expect(isBranchId(await branchingApi(masterBranchId, rootUserId, hydrateVersionId(1)))).to.be(true);
    });

    it("Should return a branch id when called without start_version", async () => {
        expect(isBranchId(await branchingApi(masterBranchId, rootUserId))).to.be(true);
    });

    it("Should select a default start_version when called without start_version", async () => {
        const branchId = await branchingApi(masterBranchId, rootUserId);
        const res = await queryRunner.query(`SELECT * FROM "public"."branch" WHERE "id" = $1`, [serializeBranchId(branchId)]);

        const branchData = atLeastOne(res.rows)[0];
        expect(branchData).to.have.property("start_version");
        expect(branchData.start_version).to.be.a("number");
    });
});
