import { QueryRunner } from "../query_runner/query_runner_api";
import { DatabaseRead } from "./read_api";
import { getUniverseElementName, UniverseRestriction } from "../universe";
import { objectKeys } from "../../misc/typeguards";
import { pgFormat } from "../../misc/pg_format";
import { LocalDateTime, nativeJs } from "js-joda";
import { isDataPrimitive } from "../../definition/primitives";
import { hydratePrimitive, hydrateId, hydrateUserId, hydrateVersionId } from "../db_values/from_db_values";
import { serializeBranchId, serializeId } from "../db_values/to_db_values";

export const createRead = <Universe extends UniverseRestriction<Universe>>(queryRunner: QueryRunner, universe: Universe): DatabaseRead<Universe> => async requests => {
    const results: any = {};

    for (const requestKey of objectKeys(requests)) {
        const req = requests[requestKey];

        const tableName = getUniverseElementName(universe, req.type);
        const { rows } = await queryRunner.query(pgFormat(`
            WITH RECURSIVE branch_ranges(branch, start_version, end_version, parent) AS (
                    SELECT
                        id as branch,
                        start_version,
                        9223372036854775807 as end_version,
                        parent
                    FROM "public"."branch" current
                    WHERE current.id = %L /* TARGET_BRANCH */
                UNION
                    SELECT
                        b.id  as branch,
                        b.start_version,
                        p.start_version as end_version,
                        b.parent
                    FROM "public"."branch" b
                    RIGHT JOIN branch_ranges p ON (p.parent = b.id)
                    WHERE b.id IS NOT NULL
            )
            SELECT "entity".*
            FROM (
                SELECT id, max(at) as version
                FROM "public".%I "entity"
                INNER JOIN branch_ranges br ON (br.branch = entity.branch)
                WHERE entity.at <= br.end_version
                  AND entity.id IN (%L)
                GROUP BY "entity"."id"
            ) tip
            INNER JOIN LATERAL (
                SELECT *
                FROM "public".%I entity
                WHERE entity.id = tip.id
                  AND entity.at = tip.version
                LIMIT 1
            ) entity on true
            `,
            [
                serializeBranchId(req.branch), // Target branch
                tableName, req.ids.map(serializeId), // Entity and ids to select branch tips
                tableName, // Entity to select values
            ]
        ));

        const typeDef = new (req.type)();
        const props = objectKeys(typeDef);

        results[requestKey] = rows.map(r => {
            delete r.branch;

            r.id = hydrateId(r.id);
            r.at = hydrateVersionId(r.at);
            r.by = hydrateUserId(r.by);
            r.ts = LocalDateTime.from(nativeJs(r.ts));

            props.forEach(prop => {
                const propDef = typeDef[prop];
                if (!isDataPrimitive(propDef)) { return; }
                r[prop as string] = hydratePrimitive(propDef, r[prop as string]);
            });

            return r;
        });
    }

    return results;
};
