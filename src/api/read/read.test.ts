import expect = require("expect.js");

import { Any } from "ts-toolbelt";
import { QueryRunner } from "../query_runner/query_runner_api";
import { executeMigrations, prepare } from "../migrations/execute_migrations";
import { EntityDef, EntityRestriction, isId } from "../../definition/entity";
import { createRead } from "./read";
import { isVersionId, masterBranchId } from "../../temporal";
import { LocalDate, LocalDateTime } from "js-joda";
import { isUserId, rootUserId } from "../../user";
import { pgFormat } from "../../misc/pg_format";
import { getQueryRunner } from "../query_runner/query_runner";
import { namedBranchId, namedUserId } from "../named_constants";
import { devDbConnectionConfig } from "../../config/dev_database_connection";
import { FetchNode } from "../fetch_types/fetch_node";
import { NoExtraProperties } from "../../misc/no_extra_properties";
import { FetchResponse } from "../fetch_types/fetch_response";
import { path, Path } from "../../misc/tspath";
import { atLeastOne, isLocalDateTime, nevah, nullableGuard, objectKeys } from "../../misc/typeguards";
import {
    getPrimitiveGuard,
    isDataPrimitive,
    primitiveBool,
    primitiveBranch,
    primitiveBuffer,
    primitiveEnum,
    primitiveFloat,
    primitiveInt,
    primitiveLocalDate,
    primitiveLocalDateTime,
    primitiveMoney,
    primitiveString,
    primitiveUser,
    primitiveVersion
} from "../../definition/primitives";
import { isDataReference } from "../../definition/references";
import { isPlainObject } from "lodash";
import { generateMigrations } from "../migrations/generate_migrations";
import { hydrateBranchId, hydrateId, hydrateUserId, hydrateVersionId } from "../db_values/from_db_values";
import { getUniverseElementName } from "../universe";
import { createBranching } from "../branch/branch";
import { serializeId } from "../db_values/to_db_values";

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
        if (!guard((value as any)[prop])) {
            throw new Error(`Primitive property '${ prop }' does not match expected type`);
        }
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

    const unknownKeys = objectKeys(value).filter(k => !builtinKeys.includes(k as any) && !definitionKeys.includes(k as any));
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
        const universe = { Target: class Target {} };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const res = await queryRunner.query(pgFormat(`INSERT INTO "public".%I ("branch", "by") VALUES (%L, %L) RETURNING "id"`, [getUniverseElementName(universe, universe.Target), namedBranchId(masterBranchId), namedUserId(rootUserId)]));
        const itemId = atLeastOne(res.rows)[0].id;

        const read = createRead(queryRunner, universe);
        const { basic } = await read({ basic: {
            type: universe.Target,
            ids: [itemId],
            branch: masterBranchId,
            references: {},
        } });

        expect(basic).to.have.length(1);
        const item = basic[0]!;

        checkFetchResponse(universe.Target, {}, item);

        expect(item.id).to.eql(hydrateId(itemId));
        expect(item.ts.isAfter(LocalDateTime.now().minusMinutes(1))).to.be(true);
        expect(item.by).to.eql(rootUserId);
    });

    it("Should return null primitives", async () => {
        const universe = { Target: class Target {
            public vrsn = primitiveVersion();
            public brnch = primitiveBranch();
            public usr = primitiveUser();
            public buffer = primitiveBuffer();
            public float = primitiveFloat();
            public money = primitiveMoney();
            public int = primitiveInt();
            public string = primitiveString();
            public bool = primitiveBool();
            public localDate = primitiveLocalDate();
            public localDateTime = primitiveLocalDateTime();
            public enum = primitiveEnum("my_enum", ["one", "two", "three"]);
        } };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const res = await queryRunner.query(pgFormat(`INSERT INTO "public".%I ("branch", "by") VALUES (%L, %L) RETURNING "id"`, [getUniverseElementName(universe, universe.Target), namedBranchId(masterBranchId), namedUserId(rootUserId)]));
        const itemId = atLeastOne(res.rows)[0].id;

        const read = createRead(queryRunner, universe);
        const { nullPrimitives } = await read({ nullPrimitives: {
            type: universe.Target,
            ids: [itemId],
            branch: masterBranchId,
            references: {},
        } });

        expect(nullPrimitives).to.have.length(1);
        const item = nullPrimitives[0]!;

        checkFetchResponse(universe.Target, {}, item);
    });

    it("Should return values for primitives", async () => {
        const universe = { Target: class Target {
                public vrsn = primitiveVersion();
                public brnch = primitiveBranch();
                public usr = primitiveUser();
                public buffer = primitiveBuffer();
                public float = primitiveFloat();
                public money = primitiveMoney();
                public int = primitiveInt();
                public str = primitiveString();
                public bool = primitiveBool();
                public localDate = primitiveLocalDate();
                public localDateTime = primitiveLocalDateTime();
                public enm = primitiveEnum("my_enum", ["one", "two", "three"]);
            } };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const vrsn = 1;
        const brnch = namedBranchId(masterBranchId);
        const usr = namedUserId(rootUserId);
        const buffer = Buffer.from("whatever");
        const float = 1.5;
        const money = 2000;
        const int = 3;
        const str = "str";
        const bool = true;
        const localDate = LocalDate.now();
        const localDateTime = LocalDateTime.now();
        const enm = "two";


        const res = await queryRunner.query(pgFormat(`
            INSERT INTO "public".%I (
                "branch", "by",
                "vrsn", "brnch", "usr", "buffer", "float", "money", "int", "str", "bool", "localDate", "localDateTime", "enm"
            ) VALUES (
                 %L,       %L,
                 %L,     %L,      %L,    %L,       %L,      %L,      %L,    %L,    %L,     %L,          %L,              %L
            ) RETURNING "id"
        `, [
            getUniverseElementName(universe, universe.Target), namedBranchId(masterBranchId), namedUserId(rootUserId),
            vrsn, brnch, usr, buffer.toString("utf8"), float, money, int, str, bool, localDate.toString(), localDateTime.toString(), enm,
        ]));
        const itemId = atLeastOne(res.rows)[0].id;


        const read = createRead(queryRunner, universe);
        const { primitiveValues } = await read({ primitiveValues: {
            type: universe.Target,
            ids: [itemId],
            branch: masterBranchId,
            references: {},
        } });

        expect(primitiveValues).to.have.length(1);
        const item = primitiveValues[0]!;

        checkFetchResponse(universe.Target, {}, item);

        expect(item.vrsn).to.eql(hydrateVersionId(vrsn));
        expect(item.brnch).to.eql(hydrateBranchId(brnch));
        expect(item.usr).to.eql(hydrateUserId(usr));
        expect(item.buffer ? buffer.equals(item.buffer) : false).to.eql(true);
        expect(item.float).to.eql(float);
        expect(item.money).to.eql(money);
        expect(item.int).to.eql(int);
        expect(item.str).to.eql(str);
        expect(item.bool).to.eql(bool);
        expect(item.localDate ? localDate.isEqual(item.localDate) : false).to.eql(true);
        expect(item.localDateTime ? localDateTime.isEqual(item.localDateTime) : false).to.eql(true);
        expect(item.enm).to.eql(enm);
    });

    it("Should read an original value of an entity from a new branch, if entity is unchanged", async () => {
        const universe = { Target: class Target { public prop = primitiveString(); } };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const val = "some value";
        const res = await queryRunner.query(pgFormat(
            `INSERT INTO "public".%I ("branch", "by", "prop") VALUES (%L, %L, %L) RETURNING "id"`,
            [getUniverseElementName(universe, universe.Target), namedBranchId(masterBranchId), namedUserId(rootUserId), val]
        ));
        const itemId = atLeastOne(res.rows)[0].id;

        const otherBranch = await createBranching(queryRunner)(masterBranchId, rootUserId);

        const read = createRead(queryRunner, universe);
        const { fromNewBranch } = await read({ fromNewBranch: {
            type: universe.Target,
            ids: [itemId],
            branch: otherBranch,
            references: {},
        } });

        expect(atLeastOne(fromNewBranch)[0].prop).to.eql(val);
    });

    it("Should read different values for same id from different branches", async () => {
        const universe = { Target: class Target { public prop = primitiveString(); } };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const version1Value = "version 1 value";
        const version2Value = "version 2 value";

        const res = await queryRunner.query(pgFormat(
            `INSERT INTO "public".%I ("branch", "by", "prop") VALUES (%L, %L, %L) RETURNING "id"`,
            [getUniverseElementName(universe, universe.Target), namedBranchId(masterBranchId), namedUserId(rootUserId), version1Value]
        ));
        const itemId = atLeastOne(res.rows)[0].id;

        const otherBranch = await createBranching(queryRunner)(masterBranchId, rootUserId);
        await queryRunner.query(pgFormat( // Same id, another branch
            `INSERT INTO "public".%I ("id", "branch", "by", "prop") VALUES (%L, %L, %L, %L) RETURNING "id"`,
            [getUniverseElementName(universe, universe.Target), serializeId(itemId), otherBranch, namedUserId(rootUserId), version2Value]
        ));


        const read = createRead(queryRunner, universe);
        const { v1, v2 } = await read({
            v1: {
                type: universe.Target,
                ids: [itemId],
                branch: masterBranchId,
                references: {},
            },
            v2: {
                type: universe.Target,
                ids: [itemId],
                branch: otherBranch,
                references: {},
            },
        });

        expect(atLeastOne(v1)[0].prop).to.eql(version1Value);
        expect(atLeastOne(v2)[0].prop).to.eql(version2Value);
    });
});
