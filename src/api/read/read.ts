import { QueryRunner } from "../query_runner/query_runner_api";
import { DatabaseRead } from "./read_api";
import { UniverseRestriction } from "../universe";
import { isUndefined, nevah, objectKeys } from "../../misc/typeguards";
import { isDataPrimitive, primitiveLocalDateTime } from "../../definition/primitives";
import { hydratePrimitive, hydrateId, hydrateUserId, hydrateVersionId } from "../db_values/hydrate";
import { generateSql } from "./generate_sql";
import { generateRequestStructure } from "./request_structure";
import { serializeId } from "../db_values/serialize";
import { EntityDef, EntityShape } from "../../definition/entity";
import { isDataReference } from "../../definition/references";


export const createRead = <Universe extends UniverseRestriction<Universe>>(queryRunner: QueryRunner, universe: Universe): DatabaseRead<Universe> => async requests => {
    const results: any = {};

    for (const requestKey of objectKeys(requests)) {
        const req = requests[requestKey];

        const { rows } = await queryRunner.query(generateSql(generateRequestStructure(universe, req)), [req.ids.map(serializeId)]);
        results[requestKey] = rows.map(row => {
            const r = row.data;
            hydrateResult(req.type, r);
            return r;
        });
    }

    return results;
};

function hydrateResult(Type: EntityDef<EntityShape>, res: any) {
    const typeDef = new Type();
    const props = objectKeys(typeDef);

    res.id = hydrateId(res.id);
    res.at = hydrateVersionId(res.at);
    res.by = hydrateUserId(res.by);
    res.ts = hydratePrimitive(primitiveLocalDateTime(), res.ts);

    props.forEach(prop => {
        const propDef = typeDef[prop];
        // istanbul ignore next
        if (isUndefined(propDef)) { throw new Error("Implementation error"); }

        if (isDataPrimitive(propDef)) {
            res[prop as string] = hydratePrimitive(propDef, res[prop as string]);
            return;
        }

        // istanbul ignore else
        if (isDataReference(propDef)) {
            if (!(prop in res)) { return; }

            switch (propDef.reference_type) {
                case "has_one":
                case "has_one_inverse":
                    if (res[prop] === null) { return; }
                    hydrateResult(propDef.target(), res[prop]);
                    return;

                case "has_many":
                    if (res[prop] === null) {
                        res[prop] = [];
                        return;
                    }

                    // istanbul ignore next
                    if (!Array.isArray(res[prop])) { throw new Error("Expected an array"); }
                    res[prop].forEach((item: any) => hydrateResult(propDef.target(), item));
                    return;

                // istanbul ignore next
                default:
                    nevah(propDef);
                    throw new Error("Unhandled reference type");
            }
        } else {
            nevah(propDef);
            throw new Error("Unhandled entity prop type");
        }
    });
}
