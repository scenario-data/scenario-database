import universe = require("./datamodel");
import { executeMigrations, prepare } from "../api/migrations/execute_migrations";
import { generateMigrations } from "../api/migrations/generate_migrations";
import { getQueryRunner } from "../api/query_runner/query_runner";
import { devDbConnectionConfig } from "../config/dev_database_connection";
import { createReadStream } from "fs";
import { memoize, sortBy } from "lodash";
import { join } from "path";

import { createParser } from "./parser/create_parser";
import { readline } from "./readline";
import { builtinNamespace, watdivModel } from "./model/watdiv_model_def";
import { isWatdivEntity, isWatdivNamespace } from "./parser/watdiv_parser";
import { BranchId, masterBranchId } from "../temporal";
import { Notional } from "../misc/misc";
import { rootUserId } from "../user";
import { createDatabaseApi } from "../api/database";
import { atLeastOne, identity, nevah } from "../misc/typeguards";
import { Id } from "../definition/entity";
import { DataPrimitive, DataPrimitiveType, isDataPrimitive, PrimitiveTypeValue } from "../definition/primitives";
import { LocalDate } from "js-joda";
import { hydrateUserId } from "../api/db_values/hydrate";
import { isDataReference } from "../definition/references";
import { QueryRunner } from "../api/query_runner/query_runner_api";


type Val = { type: "val", val: string };
type Ref = { type: "ref", val: string };
const parseLine = createParser<{ entity: string, field: string, value: Val | Ref }>(`
Line = entity:Ref _ field:Ref _ value:(Ref / Val) _ FullStop   { return { entity: entity.val, field: field.val, value }; }

Ref = "<" url:([^>]+) ">"   { return { type: "ref", val: url.join("") }; }
Val = '"' val:([^"]+) '"'   { return { type: "val", val: val.join("") }; }

_ "whitespace" = [ \\t]+
EOL = _* [\\n\\r]
FullStop = "."
`);


const _knownNamespaces = sortBy(watdivModel.filter(isWatdivNamespace).map(n => n.url), url => -url.length);
const splitNamespacePrefix = (str: string) => {
    const match = _knownNamespaces.find(n => str.indexOf(n) === 0);
    if (!match) { throw new Error(`String contains no known namespaces: ${ str }'`); }
    return { namespace: match, value: str.replace(match, "") };
};
const removeBuiltinPrefix = (str: string) => {
    if (str.indexOf(builtinNamespace.url) !== 0) { throw new Error(`Expected a built-in namespace, got: '${ str }'`); }
    return str.replace(builtinNamespace.url, "");
};

const digitTailRe = /([0-9]+)$/;
const entityType = (str: string) => str.replace(digitTailRe, "");

type WatdivId = Notional<number, "watdiv_id">;
const asWatdivId = (val: number): WatdivId => val as any;
const entityWatdivId = (str: string): WatdivId => {
    const match = str.match(digitTailRe);
    if (!match) { throw new Error(`No watdiv id in string '${ str }'`); }
    return asWatdivId(parseInt(match[0]!, 10));
};


const getType = (typeName: string) => {
    const Type = universe[typeName as unknown as keyof typeof universe] as any;
    if (!Type) { throw new Error(`Type '${ typeName }' not found`); }
    return Type;
};
const getTypeDef = memoize((typeName: string) => new (getType(typeName))());


const primitiveParsers: { [P in DataPrimitiveType]?: (val: string) => PrimitiveTypeValue<P> } = {
    string: identity,
    int: val => parseInt(val, 10),
    user: val => hydrateUserId(parseInt(val, 10)),
    local_date: val => LocalDate.parse(val),
};
const parseValue = <P extends DataPrimitive>(prim: P, val: string): PrimitiveTypeValue<P["primitive_type"]> => {
    const parser = primitiveParsers[prim.primitive_type];
    if (!parser) { throw new Error(`No parser defined for primitive type '${ prim.primitive_type }'`); }
    return parser(val) as any;
};

const _entityScaling = watdivModel.filter(isWatdivEntity).reduce((_agg, etty) => {
    _agg[etty.name.name] = etty.scalable;
    return _agg;
}, {} as { [type: string]: boolean });
const isScalableType = (type: string) => Boolean(_entityScaling[type]);

withQueryRunner(async queryRunner => {
    await prepare(queryRunner);
    await executeMigrations(queryRunner, generateMigrations(universe));

    const db = await createDatabaseApi(queryRunner, universe, []);


    // Branches
    const masterBranchWatdivId = asWatdivId(-1);
    const branchDefs: { [ref: string]: {
        branched_from?: WatdivId,
        db_id?: BranchId,
        watdiv_id: WatdivId,
    } } = { [masterBranchWatdivId]: {
        branched_from: masterBranchWatdivId,
        db_id: masterBranchId,
        watdiv_id: masterBranchWatdivId,
    } };
    const branchMapping: { [ref: string]: WatdivId } = {};
    await readline(createReadStream(join(__dirname, "dataset_branches"), "utf8"), raw => {
        const line = parseLine(raw);
        const entity = splitNamespacePrefix(line.entity);
        const field = removeBuiltinPrefix(line.field);

        if (line.value.type === "val") { throw new Error("Expected only refs, got value"); }

        const entityId = entityWatdivId(entity.value);
        if (entity.namespace === builtinNamespace.url) {
            if (entityType(entity.value) !== "branch") { throw new Error("Unexpected type"); }

            const branchDef = branchDefs[entityId] || { watdiv_id: entityId };
            branchDefs[entityId] = branchDef;

            if (field !== "branched_from") { throw new Error("Unexpected field"); }
            const fieldValue = entityWatdivId(removeBuiltinPrefix(line.value.val));
            branchDef[field] = fieldValue < entityId ? fieldValue : masterBranchWatdivId;
        } else {
            if (field !== "branch") { throw new Error(`Expected branch ref, got '${ field }'`); }
            branchMapping[line.entity] = entityWatdivId(removeBuiltinPrefix(line.value.val));
        }
    });

    const getBranchForWatdivBranchId = async (id: WatdivId): Promise<BranchId> => {
        const branch = branchDefs[id];
        if (!branch) { throw new Error(`Unknown branch: '${ id }'`); }

        if (branch.db_id !== undefined) { return branch.db_id; }

        if (branch.branched_from === undefined) { throw new Error(`Parent unknown for id: '${ id }'`); }
        const parentId = await getBranchForWatdivBranchId(branch.branched_from);

        // This postpones creating branches until branch is used for the first time
        // emulating realistic start version
        const dbId = await db.createBranch(parentId, rootUserId);
        branch.db_id = dbId;
        return dbId;
    };
    const getBranch = async (ref: string): Promise<BranchId> => {
        const mappedBranch = branchMapping[ref];
        if (mappedBranch === undefined) { return masterBranchId; }
        return getBranchForWatdivBranchId(mappedBranch);
    };


    // Entity id mapping
    const entityRefToGrouping: { [ref: string]: string } = {};
    await readline(createReadStream(join(__dirname, "dataset_ids"), "utf8"), raw => {
        const line = parseLine(raw);

        if (removeBuiltinPrefix(line.field) !== "id") { throw new Error(`Expected 'id' field, got: ${ line.field }`); }
        if (line.value.type !== "val") { throw new Error(`Expected a value, got: ${ JSON.stringify(line.value) }`); }

        entityRefToGrouping[line.entity] = line.value.val;
    });
    const getGrouping = (ref: string): string => {
        const grouping = entityRefToGrouping[ref];
        if (grouping !== undefined) { return grouping; }

        const { value } = splitNamespacePrefix(ref);
        const type = entityType(value);

        if (!isScalableType(type)) { return String(entityWatdivId(value)); }
        throw new Error(`Unknown grouping for entity '${ ref }'`);
    };


    // Populate the db
    const entityIdsByGrouping: { [type: string]: { [group: string]: Id<any> } } = {};
    const getId = (typeName: string, grouping: string) => {
        const ofType = entityIdsByGrouping[typeName] || {};
        entityIdsByGrouping[typeName] = ofType;

        return ofType[grouping];
    };
    const setId = (typeName: string, grouping: string, id: Id<any>) => {
        const ofType = entityIdsByGrouping[typeName] || {};
        entityIdsByGrouping[typeName] = ofType;
        ofType[grouping] = id;
    };
    await readline(createReadStream(join(__dirname, "dataset"), "utf8"), async raw => {
        const line = parseLine(raw);

        const prop = splitNamespacePrefix(line.field).value;
        if (prop === "id" || prop === "branch") { return; } // Ignore the grouping property and branch mapping

        const entity = splitNamespacePrefix(line.entity);
        const typeName = entityType(entity.value);
        if (typeName === "user" || typeName === "branch") { return; } // Ignore types representing built-ins

        const grouping = getGrouping(line.entity);
        const typeDef = getTypeDef(typeName);
        const propDef = typeDef[prop as unknown as keyof typeof typeDef];
        if (!propDef) { throw new Error(`Prop '${ prop }' not found on type '${ typeName }'`); }

        const valueDef = line.value;
        switch (valueDef.type) {
            case "val":
                if (!isDataPrimitive(propDef)) { throw new Error(`Data primitive expected at prop '${ prop }' on type '${ typeName }', got: ${ JSON.stringify(propDef) }`); }
                const value = parseValue(propDef, valueDef.val);
                const { insertPrim } = await db.write<{ insertPrim: any }>(
                    await getBranch(line.entity),
                    rootUserId,
                    {
                        insertPrim: {
                            type: getType(typeName),
                            returning: {},
                            values: [{
                                id: getId(typeName, grouping),
                                [prop]: value,
                            }],
                        },
                    }
                );
                return setId(typeName, grouping, atLeastOne(insertPrim)[0].id);

            case "ref":
                if (!isDataReference(propDef)) { throw new Error(`Data reference expected at prop '${ prop }' on type '${ typeName }', got: ${ JSON.stringify(propDef) }`); }

                const remote = splitNamespacePrefix(valueDef.val);
                const remoteId = getId(entityType(remote.value), getGrouping(valueDef.val));
                const isToMany = propDef.reference_type === "has_many";
                const { insertRef } = await db.write<{ insertRef: any }>(
                    await getBranch(line.entity),
                    rootUserId,
                    {
                        insertRef: {
                            type: getType(typeName),
                            returning: {},
                            values: [{
                                id: getId(typeName, grouping),
                                [prop]: isToMany ? [{ id: remoteId }] : { id: remoteId },
                            }],
                        },
                    }
                );
                return setId(typeName, grouping, atLeastOne(insertRef)[0].id);

            default:
                nevah(valueDef);
                throw new Error("Unhandled value type");
        }
    });

    console.log("Done"); // tslint:disable-line:no-console
}).catch(async err => {
    console.error(err);
    process.exit(1);
});


async function withQueryRunner(cb: (qr: QueryRunner) => Promise<void>) {
    let queryRunner: QueryRunner;
    try {
        queryRunner = await getQueryRunner("load-generator", devDbConnectionConfig, true);
    } catch (e) {
        console.error("Error connecting to the database");
        console.error(e);
        process.exit(1);
    }

    try {
        await cb(queryRunner);
        await queryRunner.release();
    } catch (e) {
        await queryRunner.release(e);
        console.error(e);
        process.exit(1);
    }
}
