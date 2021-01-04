import expect = require("expect.js");

import { Any } from "ts-toolbelt";
import { QueryRunner } from "../query_runner/query_runner_api";
import { executeMigrations, prepare } from "../migrations/execute_migrations";
import { migrate } from "../migrations/migrations_builder";
import { EntityDefInstanceFromMeta } from "../migrations/metadata";
import { ApplyMigrations } from "../migrations/apply_migrations_api";
import { EntityDef, EntityRestriction, isId } from "../../definition/entity";
import { createRead, transformDbId } from "./read";
import { isVersionId, masterBranchId } from "../../temporal";
import { LocalDateTime } from "js-joda";
import { isUserId, rootUserId } from "../../user";
import { pgFormat } from "../../misc/pg_format";
import { getQueryRunner } from "../query_runner/query_runner";
import { namedBranchId, namedUserId } from "../named_constants";
import { devDbConnectionConfig } from "../../config/dev_database_connection";
import { FetchNode } from "../fetch_types/fetch_node";
import { NoExtraProperties } from "../../misc/no_extra_properties";
import { FetchResponse } from "../fetch_types/fetch_response";
import { path, Path } from "../../misc/tspath";
import { isLocalDateTime, nevah, nullableGuard, objectKeys } from "../../misc/typeguards";
import { getPrimitiveGuard, isDataPrimitive } from "../../definition/primitives";
import { isDataReference } from "../../definition/references";
import { isPlainObject } from "lodash";

const builtIns: { [P in keyof FetchResponse<{}, {}>]: ((val: unknown) => val is FetchResponse<{}, {}>[P]) } = {
    id: isId,
    at: isVersionId,
    by: isUserId,
    ts: isLocalDateTime,
};

function _checkFetchResponse<
    Entity extends EntityRestriction<Entity>,
    References extends FetchNode<Entity>
>(
    Etty: EntityDef<Entity>,
    references: Any.Cast<References, NoExtraProperties<FetchNode<Entity>, References>>,
    value: FetchResponse<Entity, References>,
    pathSoFar: Path<any, any>
): void {
    const typeDef = new Etty();
    const builtinKeys = objectKeys(builtIns);
    const definitionKeys = objectKeys(typeDef);

    // Check built-in properties
    builtinKeys.forEach(prop => {
        if (!(prop in value)) { throw new Error(`Built-in property '${ prop }' is missing on '${ pathSoFar.toString() }'`); }
        if (!builtIns[prop](value[prop])) { throw new Error(`'${ prop }' doesn't match expected type on '${ pathSoFar.toString() }'`); }
    });

    // Check primitives
    definitionKeys.forEach((prop: keyof Entity) => {
        const propDef = typeDef[prop];
        if (!isDataPrimitive(propDef)) { return; }
        if (!(prop in value)) { throw new Error(`Primitive property '${ prop }' is missing on '${ pathSoFar.toString() }'`); }

        const guard = nullableGuard(getPrimitiveGuard(propDef));
        if (!guard((value as any)[prop])) { throw new Error(`Primitive property '${ prop }' does not match expected type`); }
    });

    // Check relations
    definitionKeys.forEach((prop: keyof Entity) => {
        const propDef = typeDef[prop];
        if (!isDataReference(propDef)) { return; }
        if (!(prop in value)) {
            if (prop in references) { throw new Error(`Requested reference property '${ prop }' is missing on '${ pathSoFar.toString() }'`); }
            return;
        }

        if (!(prop in references)) { throw new Error(`Ref property '${ prop }' wasn't requested, but exists on '${ pathSoFar.toString() }'`); }

        const ref = (value as any)[prop];
        const refPath = pathSoFar[prop]!;

        switch (propDef.reference_type) {
            case "has_one":
            case "has_one_inverse":
                if (ref === null) { return; } // Null value ok on a to-one reference
                if (!isPlainObject(ref)) { throw new Error(`Expected referenced data to be a plain object on: ${ refPath.toString() }`); }
                return _checkFetchResponse(propDef.target(), (references as any)[prop], ref, refPath);

            case "has_many":
                if (!Array.isArray(ref)) { throw new Error(`Expected referenced data to be an array on: ${ refPath.toString() }`); }
                return ref.forEach((item, idx) => _checkFetchResponse(propDef.target(), (references as any)[prop], item, refPath[idx]!));

            /* istanbul ignore next */
            default:
                nevah(propDef);
                throw new Error("Unhandled reference type");
        }
    });

    const unknownKeys = objectKeys(value).filter(k => !builtinKeys.includes(k as any) || definitionKeys.includes(k as any));
    if (unknownKeys.length > 0) { throw new Error(`Value contains unknown keys on ${ pathSoFar.toString() }: ${ unknownKeys.join(", ") }`); }
}

function checkFetchResponse<
    Entity extends EntityRestriction<Entity>,
    References extends FetchNode<Entity>
>(
    Etty: EntityDef<Entity>,
    references: Any.Cast<References, NoExtraProperties<FetchNode<Entity>, References>>,
    value: FetchResponse<Entity, References>
) {
    return _checkFetchResponse<Entity, References>(Etty, references, value, path());
}


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

        checkFetchResponse(Target, {}, item);

        expect(item.id).to.eql(transformDbId(itemId));
        expect(item.ts.isAfter(LocalDateTime.now().minusMinutes(1))).to.be(true);
        expect(item.by).to.eql(rootUserId);
    });
});
