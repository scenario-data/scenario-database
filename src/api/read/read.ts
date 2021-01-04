import { QueryRunner } from "../query_runner/query_runner_api";
import { DatabaseRead } from "./read_api";
import { UniverseElement, UniverseRestriction } from "../universe";
import { objectKeys } from "../../misc/typeguards";
import { pgFormat } from "../../misc/pg_format";
import { EntityDef } from "../../definition/entity";
import { isNamedUserId, namedUserById } from "../named_constants";
import { LocalDateTime, nativeJs } from "js-joda";

const getEntityTableName = <Universe extends UniverseRestriction<Universe>>( // TODO: needs more robust implementation, relying on constructor name is icky
    universe: Universe,
    etty: EntityDef<UniverseElement<Universe>>
): string => {
    if (!(etty.name in universe)) { throw new Error("Implementation error"); }
    return etty.name;
};

export const createRead = <Universe extends UniverseRestriction<Universe>>(queryRunner: QueryRunner, universe: Universe): DatabaseRead<Universe> => async requests => {
    const results: any = {};

    for (const requestKey of objectKeys(requests)) {
        const req = requests[requestKey];

        const { rows } = await queryRunner.query(pgFormat(`SELECT * FROM "public".%I WHERE "id" IN (%L)`, [getEntityTableName(universe, req.type), req.ids]));
        results[requestKey] = rows.map(r => {
            r.at = String(r.at);
            r.by = isNamedUserId(r.by) ? namedUserById(r.by) : r.by;
            r.ts = LocalDateTime.from(nativeJs(r.ts));

            return r;
        });
    }

    return results;
};