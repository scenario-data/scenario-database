import { QueryRunner } from "../query_runner/query_runner_api";
import { pgFormat } from "../../misc/pg_format";
import { serializeUserId } from "../db_values/serialize";
import { hydrateUserId } from "../db_values/hydrate";
import { atLeastOne } from "../../misc/typeguards";
import { UserApi } from "./user_api";

export const createUserApi = (queryRunner: QueryRunner): UserApi => async createdBy => {
    const res = await queryRunner.query(pgFormat(
        `INSERT INTO "public"."user" ("parent") VALUES (%L) RETURNING "id"`,
        [serializeUserId(createdBy)]
    ));

    return hydrateUserId(atLeastOne(res.rows)[0].id);
};
