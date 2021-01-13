import { QueryRunner } from "../query_runner/query_runner_api";
import { BranchingApi } from "./branch_api";
import { pgFormat } from "../../misc/pg_format";
import { serializeBranchId, serializeUserId, serializeVersionId } from "../db_values/serialize";
import { atLeastOne } from "../../misc/typeguards";
import { hydrateBranchId } from "../db_values/hydrate";

export const createBranching = (queryRunner: QueryRunner): BranchingApi => async (branchFrom, createdBy, startVersion) => {
    const res = startVersion !== undefined
        ? await queryRunner.query(pgFormat(
            `INSERT INTO "public"."branch" ("branched_from", "created_by", "start_version") VALUES (%L, %L, %L) RETURNING "id"`,
            [serializeBranchId(branchFrom), serializeUserId(createdBy), serializeVersionId(startVersion)]
        ))
        : await queryRunner.query(pgFormat(
            `INSERT INTO "public"."branch" ("branched_from", "created_by") VALUES (%L, %L) RETURNING "id"`,
            [serializeBranchId(branchFrom), serializeUserId(createdBy)]
        ));

    return hydrateBranchId(atLeastOne(res.rows)[0].id);
};
