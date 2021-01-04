import { QueryRunner } from "../query_runner/query_runner_api";
import { DatabaseRead } from "./read_api";
import { getUniverseElementName, UniverseRestriction } from "../universe";
import { nevah, objectKeys } from "../../misc/typeguards";
import { pgFormat } from "../../misc/pg_format";
import { asId, Id } from "../../definition/entity";
import { isNamedBranchId, isNamedUserId, namedBranchById, namedUserById } from "../named_constants";
import { LocalDate, LocalDateTime, nativeJs } from "js-joda";
import { asBranchId, asVersionId, BranchId, VersionId } from "../../temporal";
import { asUserId, UserId } from "../../user";
import { DataPrimitive, getPrimitiveGuard, isDataPrimitive, PrimitiveValue } from "../../definition/primitives";

export const transformDbId = (id: number): Id<any> => asId(String(id));
export const transformDbVersion = (version: number): VersionId => asVersionId(String(version));
export const transformDbUser = (userId: number): UserId => isNamedUserId(userId) ? namedUserById(userId) : asUserId(String(userId));
export const transformDbBranch = (branchId: number): BranchId => isNamedBranchId(branchId) ? namedBranchById(branchId) : asBranchId(String(branchId));

const _hydratePrimitive = (primitive: DataPrimitive, val: any) => {
    switch (primitive.primitive_type) {
        case "user": return transformDbUser(val);
        case "branch": return transformDbBranch(val);
        case "version": return transformDbVersion(val);

        case "local_date_time": return LocalDateTime.from(nativeJs(val));
        case "local_date": return LocalDate.from(nativeJs(val));
        case "money": return parseFloat(val); // TODO: ouch, this feels weird to parse money string into a number

        case "buffer": return val;
        case "string": return val;
        case "float": return val;
        case "enum": return val;
        case "bool": return val;
        case "int": return parseInt(val, 10);

        /* istanbul ignore next */
        default:
            nevah(primitive);
            throw new Error("Unhandled primitive type");
    }
};

const hydratePrimitive = <T extends DataPrimitive>(primitive: T, val: any): PrimitiveValue<T> | null => {
    if (val === null) { return val; }

    const transformed = _hydratePrimitive(primitive, val);

    const guard = getPrimitiveGuard(primitive);
    if (!guard(transformed)) { throw new Error(`Value doesn't match expected type for primitive ${ JSON.stringify(primitive) }: ${ JSON.stringify(val) }`); }

    return transformed;
};

export const createRead = <Universe extends UniverseRestriction<Universe>>(queryRunner: QueryRunner, universe: Universe): DatabaseRead<Universe> => async requests => {
    const results: any = {};

    for (const requestKey of objectKeys(requests)) {
        const req = requests[requestKey];

        const { rows } = await queryRunner.query(pgFormat(`SELECT * FROM "public".%I WHERE "id" IN (%L)`, [getUniverseElementName(universe, req.type), req.ids]));

        const typeDef = new (req.type)();
        const props = objectKeys(typeDef);

        results[requestKey] = rows.map(r => {
            delete r.branch;

            r.id = transformDbId(r.id);
            r.at = transformDbVersion(r.at);
            r.by = transformDbUser(r.by);
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
