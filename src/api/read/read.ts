import { flatten, sortBy } from "lodash";
import { QueryRunner } from "../query_runner/query_runner_api";
import { DatabaseRead } from "./read_api";
import { UniverseRestriction } from "../universe";
import { isNot, isUndefined, nevah, objectKeys } from "../../misc/typeguards";
import { DataPrimitive, isDataPrimitive, primitiveLocalDateTime, PrimitiveValue } from "../../definition/primitives";
import { hydrateId, hydratePrimitive, hydrateUserId, hydrateVersionId } from "../db_values/hydrate";
import { generateSql } from "./generate_sql";
import {
    generateRequestStructure,
    getInternalFKShape,
    ReadIdentifiedNode,
    ReadInternalRefNode,
    ReadReferenceNode
} from "./request_structure";
import { serializeBranchId, serializeId } from "../db_values/serialize";
import { EntityDef, EntityShape, isId } from "../../definition/entity";
import { isDataReference } from "../../definition/references";
import {
    InternalFKPrimitive,
    InternalFKPrimitiveDefinitions,
    InternalFKRef,
    isInternalFKPrimitive
} from "../fetch_types/internal_foreign_keys";
import { rootUserId } from "../../user";
import { masterBranchId } from "../../temporal";
import { LocalDateTime, ZoneOffset } from "js-joda";
import { executeIfExistsName, MAX_FN_NAME_LENGTH, safeCreateFnName } from "../migrations/execute_migrations";
import { READ_VERSION } from "./read_version";
import { hash } from "../../misc/hash";


export const createRead = <Universe extends UniverseRestriction<Universe>>(queryRunner: QueryRunner, universe: Universe): DatabaseRead<Universe> => async requests => {
    const results: any = {};

    for (const requestKey of objectKeys(requests)) {
        const req = requests[requestKey];
        if (req.ids.some(isNot(isId))) { throw new Error(`Request ids must match id type in section '${ requestKey }'`); }

        const ids = req.ids.map(serializeId);
        const branch = serializeBranchId(req.branch);

        const structure = generateRequestStructure(universe, req);
        const storedFn = storedFnName(structure);

        const { rows } = await queryRunner.query(`SELECT ${ executeIfExistsName }('${ storedFn }', $1, $2) as data`, [branch, ids]).then(async data => {
            if (data.rows.length !== 1 || data.rows[0]?.data !== null) { return data; }

            // This is a case when checker function determined target doesn't exists.
            // Attempt to create a stored function.
            const fnsql = `
                CREATE FUNCTION ${ storedFn } (int, int[]) RETURNS SETOF JSON STABLE
                AS $$
                    BEGIN
                        RETURN QUERY ${ generateSql(structure) };
                    END;
                $$ LANGUAGE plpgsql
            `.replace(/\n/g, " ");
            const res = await queryRunner.query(`SELECT res FROM ${ safeCreateFnName }('${ fnsql }') res`);

            const storedFnCreated = Array.isArray(res.rows) && res.rows.length === 1 && res.rows[0]?.res === true;
            if (storedFnCreated) { return queryRunner.query(`SELECT ${ executeIfExistsName }('${ storedFn }', $1, $2) as data`, [branch, ids]); }

            // Stored function was not created due to lock from another query. Generate and execute a raw query.
            return queryRunner.query(generateSql(structure), [branch, ids]);
        });

        results[requestKey] = sortBy(
            rows.map(row => {
                const r = row.data;
                hydrateResult(req.type, req.references, r);
                return r;
            }),
            item => req.ids.indexOf(item.id)
        );
    }

    return results;
};


function treeDescription(node: ReadIdentifiedNode<EntityShape> | ReadReferenceNode<EntityShape> | ReadInternalRefNode): string[] {
    const nested = flatten([...node.nested].map(treeDescription));
    const ownDescription = node.nodeType !== "identified" ? `${ node.tableName }-${ node.parentTargetColumn }-${ node.resultKey }` : node.tableName;
    return [ownDescription, ...nested];
}
const hashTree = (rootNode: ReadIdentifiedNode<EntityShape>): string => hash(treeDescription(rootNode).join(":"), 32);
function storedFnName(rootNode: ReadIdentifiedNode<EntityShape>) {
    const name = `ck_reader_${ READ_VERSION }_${ rootNode.tableName.slice(0, 15) }_${ hashTree(rootNode) }`;
    if (process.env.NODE_ENV !== "production" && name.length > MAX_FN_NAME_LENGTH) {
        throw new Error(`Generated function name is longer than psql limit: ${ name }`);
    }
    return name;
}

function hydrateResult(Type: EntityDef<EntityShape>, ref: any, res: any) {
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
            if (!(prop in ref)) { return res[prop as string] = hydratePrimitive(propDef, res[prop as string]); }

            // istanbul ignore if — this condition isn't achievable in tests, because it is checked earlier
            if (!isInternalFKPrimitive(propDef)) { throw new Error("Not an internal fk primitive"); }

            return hydrateInternal(propDef, ref[prop], res[prop]);
        }

        // istanbul ignore else
        if (isDataReference(propDef)) {
            if (!(prop in res)) { return; }

            switch (propDef.reference_type) {
                case "has_one":
                case "has_one_inverse":
                    if (res[prop] === null) { return; }
                    hydrateResult(propDef.target(), ref[prop], res[prop]);
                    return;

                case "has_many":
                    if (res[prop] === null) {
                        res[prop] = [];
                        return;
                    }

                    // istanbul ignore next
                    if (!Array.isArray(res[prop])) { throw new Error("Expected an array"); }
                    res[prop].forEach((item: any) => hydrateResult(propDef.target(), ref[prop], item));
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


function hydrateInternal(primitive: InternalFKPrimitive, ref: any, res: any) {
    const shape = getInternalFKShape(primitive.primitive_type);
    objectKeys(shape).forEach(prop => {
        const propDef = shape[prop];
        if ("ref" in propDef && prop in ref) {
            const nestedValue = res[prop];
            if (nestedValue === null) { return res[prop] = generateDefaultInternals(propDef.ref, ref[prop]); }
            return hydrateInternal(propDef.ref, ref[prop], nestedValue);
        }
        res[prop] = hydratePrimitive("ref" in propDef ? propDef.ref : propDef, res[prop]);
    });
}

type ShapeDefaults<T> = {
    [P in keyof T]:
          T[P] extends InternalFKRef<infer Prim> ? PrimitiveValue<Prim>
        : T[P] extends DataPrimitive ? PrimitiveValue<T[P]>
        : never
};
const fkDefaults: { [P in keyof InternalFKPrimitiveDefinitions]: ShapeDefaults<InternalFKPrimitiveDefinitions[P]["shape"]> } = {
    user: {
        id: rootUserId,
        ts: LocalDateTime.ofEpochSecond(0, ZoneOffset.UTC),
        created_by: rootUserId,
    },
    branch: {
        id: masterBranchId,
        ts: LocalDateTime.ofEpochSecond(0, ZoneOffset.UTC),
        start_version: hydrateVersionId(1),
        branched_from: masterBranchId,
        created_by: rootUserId,
    },
};
function generateDefaultInternals(primitive: InternalFKPrimitive, ref: any): any {
    const shape = getInternalFKShape(primitive.primitive_type);
    const def = fkDefaults[primitive.primitive_type];

    return objectKeys(shape).reduce((_agg, prop) => {
        if (!(prop in ref)) {
            _agg[prop] = def[prop];
            return _agg;
        }

        const shapeProp = shape[prop];

        // istanbul ignore if — this condition isn't achievable in tests, because it is checked earlier
        if (!("ref" in shapeProp)) { throw new Error(`'${ prop }' is not an internal reference`); }

        _agg[prop] = generateDefaultInternals(shapeProp.ref, ref[prop]);
        return _agg;
    }, {} as any);
}
