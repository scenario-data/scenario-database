import { QueryRunner } from "../query_runner/query_runner_api";
import { BranchingApi } from "./branch_api";
import { pgFormat } from "../../misc/pg_format";
import { serializeBranchId, serializeUserId, serializeVersionId } from "../db_values/to_db_values";
import { atLeastOne } from "../../misc/typeguards";
import { hydrateBranchId } from "../db_values/from_db_values";

export const createBranching = (queryRunner: QueryRunner): BranchingApi => async (branchFrom, createdBy, startVersion) => {
    const res = startVersion !== undefined
        ? await queryRunner.query(pgFormat(
            `INSERT INTO "public"."branch" ("parent", "by", "start_version") VALUES (%L, %L, %L) RETURNING "id"`,
            [serializeBranchId(branchFrom), serializeUserId(createdBy), serializeVersionId(startVersion)]
        ))
        : await queryRunner.query(pgFormat(
            `INSERT INTO "public"."branch" ("parent", "by") VALUES (%L, %L) RETURNING "id"`,
            [serializeBranchId(branchFrom), serializeUserId(createdBy)]
        ));

    return hydrateBranchId(atLeastOne(res.rows)[0].id);
};
