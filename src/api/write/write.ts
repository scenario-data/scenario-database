import { getUniverseElementName, UniverseRestriction, UniverseShape } from "../universe";
import { QueryRunner } from "../query_runner/query_runner_api";
import { DatabaseWrite } from "./write_api";
import { atLeastOne, isBoth, isEither, isNot, isProp, isUndefined, nevah, objectKeys } from "../../misc/typeguards";
import { pgFormat } from "../../misc/pg_format";
import { serializeBranchId, serializeId, serializePrimitive, serializeUserId } from "../db_values/serialize";
import { createRead } from "../read/read";
import { getPrimitiveComparator, isDataPrimitive } from "../../definition/primitives";
import { EntityDef, EntityShape, getEntityName, Id, isId } from "../../definition/entity";
import { isDataReference } from "../../definition/references";
import { flatten, groupBy, isPlainObject, map, uniq } from "lodash";
import { refColumnName } from "../migrations/execute_migrations";
import { generateBranchRangesCTE } from "../read/generate_sql";
import { hydrateId } from "../db_values/hydrate";
import { isInternalReadKey } from "../read/internal_read_keys";
import { path, Path } from "../../misc/tspath";


type SavedID = number;
type TempID = string;
type DbId = SavedID | TempID;

const tempIdMarker = "$$";

export function tempId(id: string): Id<any>;
export function tempId<T extends Id<any>>(id: T): T;
export function tempId<T extends string>(id: T): T {
    return `${ tempIdMarker }${ id }${ tempIdMarker }` as any;
}

const markerReChunk = tempIdMarker.split("").map(char => `\\${char}`).join("");
const tempIdRe = new RegExp(`^${ markerReChunk }.+${ markerReChunk }$`);
const isExternalTempId = (id: DbId): id is TempID => typeof id === "string" && tempIdRe.test(id);

const internalTempIdPrefix = "internal_temp_id_";
const isInternalTempId = (id: DbId): id is TempID => typeof id === "string" && id.indexOf(internalTempIdPrefix) === 0;
const isTempId = isEither(isExternalTempId, isInternalTempId);

const isSavedId = (id: DbId): id is SavedID => typeof id === "number";

interface SetReference {
    operation: "set_reference";
    type: EntityDef<EntityShape>;
    id: DbId;
    targetId: DbId | null;
    prop: string;
    debugPath: Path<any, any>;
}
const isSetReference = (val: AtomicChange): val is SetReference => val.operation === "set_reference";

interface SetPrimitive {
    operation: "set_primitive";
    type: EntityDef<EntityShape>;
    id: DbId;
    prop: string;
    originalValue: any;
    serializedValue: any;
    debugPath: Path<any, any>;
}
const isSetPrimitive = (val: AtomicChange): val is SetPrimitive => val.operation === "set_primitive";

interface CreateEntity {
    operation: "create_entity";
    type: EntityDef<EntityShape>;
    id: TempID;
    debugPath: Path<any, any>;
}
const isCreateEntity = (val: AtomicChange): val is CreateEntity => val.operation === "create_entity";

type AtomicChange = SetPrimitive | SetReference | CreateEntity;

const traverse = (getInternalTempId: (t: EntityDef<EntityShape>) => string, Type: EntityDef<EntityShape>, value: any, debugPath: Path<any, any>): { id: DbId, changes: AtomicChange[] } => {
    if (!value || !isPlainObject(value)) { throw new Error(`Expected a plain object value, got: ${ JSON.stringify(value) }`); }
    if (!isId(value.id) && value.id !== undefined && !isExternalTempId(value.id)) {
        throw new Error(`Entity id may only be an entity id, undefined or a temp id. Given: ${ JSON.stringify(value.id) }`);
    }

    const typeDef = new Type();
    const id = value.id ? (isExternalTempId(value.id) ? value.id : serializeId(value.id)) : getInternalTempId(Type);

    const create: CreateEntity[] = value.id && !isExternalTempId(value.id) ? [] : [{
        operation: "create_entity",
        type: Type,
        id: id as TempID,
        debugPath,
    }];

    return { id, changes: [...create, ...flatten(objectKeys(value).filter(isNot(isInternalReadKey)).map((prop): AtomicChange[] => {
        const val = value[prop];
        const propDef = typeDef[prop];
        if (!propDef) { throw new Error(`Unknown property \`${ prop }\``); }

        if (isDataPrimitive(propDef)) {
            const setPrimitive: SetPrimitive = {
                operation: "set_primitive",
                id,
                prop,
                type: Type,
                originalValue: val,
                serializedValue: serializePrimitive(propDef, val),
                debugPath,
            };

            return [setPrimitive];
        }

        // istanbul ignore if
        if (!isDataReference(propDef)) {
            nevah(propDef);
            throw new Error("Unhandled property type");
        }

        const propPath = debugPath[prop]!;
        const TargetType = propDef.target();
        switch (propDef.reference_type) {
            case "has_one":
                const oneNestedItem = val !== null ? traverse(getInternalTempId, TargetType, val, propPath) : null;
                const hasOne: SetReference = {
                    operation: "set_reference",
                    type: Type,
                    id, prop,
                    targetId: oneNestedItem?.id || null,
                    debugPath: propPath,
                };
                return [hasOne, ...(oneNestedItem?.changes || [])];

            case "has_one_inverse":
                const inverseNestedItem = traverse(getInternalTempId, TargetType, val, propPath);
                const hasOneInverse: SetReference = {
                    operation: "set_reference",
                    type: TargetType,
                    id: inverseNestedItem.id,
                    targetId: id,
                    prop: propDef.backlink,
                    debugPath: propPath,
                };

                return [hasOneInverse, ...inverseNestedItem.changes];

            case "has_many":
                if (!Array.isArray(val)) {
                    throw new Error("Data for to-many relation must be an array");
                }
                return flatten(val.map((item, idx) => {
                    const itemPath = propPath[idx]!;
                    const nestedItem = traverse(getInternalTempId, TargetType, item, itemPath);
                    const setRef: SetReference = {
                        operation: "set_reference",
                        type: TargetType,
                        id: nestedItem.id,
                        targetId: id,
                        prop: propDef.backlink,
                        debugPath: itemPath,
                    };
                    return [setRef, ...nestedItem.changes];
                }));

            // istanbul ignore next
            default:
                nevah(propDef);
                throw new Error("Unhandled reference type");
        }
    }))] };
};


export const createWrite = <Universe extends UniverseRestriction<Universe>>(queryRunner: QueryRunner, universe: Universe): DatabaseWrite<Universe> => {
    const read = createRead(queryRunner, universe);

    return async (branch, user, save) => { // TODO: logging with logId
        let internalTempIdx = 0;
        const getInternalTempId = (Type: EntityDef<EntityShape>) => `${ internalTempIdPrefix }_${ getEntityName(Type) }_${ internalTempIdx++ }`;

        // Create a mapping from the save request to the response using temp ids if necessary.
        // As a side-effect, this also builds a set of changes to be applied.
        const changes: AtomicChange[] = [];
        const sectionKeys = Object.keys(save);
        const resultIds = sectionKeys.reduce((_agg, k) => {
            const section = save[k]!;
            _agg[k] = section.values.map(item => {
                const itemData = traverse(getInternalTempId, section.type, item, path()[k]!);

                // istanbul ignore if
                if (itemData.changes.length === 0) { throw new Error("Implementation error: no changes"); }

                changes.push(...itemData.changes);
                return itemData.id;
            });
            return _agg;
        }, {} as { [prop: string]: DbId[] });


        // Detect conflicts within request
        const virtualDB: { [prop: string]: any } = {};
        changes.forEach(change => {
            const itemKey = `${ getUniverseElementName<UniverseShape>(universe, change.type) }_${ change.id }`;
            const current = virtualDB[itemKey] || {};
            switch (change.operation) {
                case "create_entity": return; // No-op

                case "set_primitive":
                    if (!isUndefined(current[change.prop])) {
                        const propDef = new (change.type)()[change.prop];

                        // istanbul ignore if
                        if (!isDataPrimitive(propDef)) { throw new Error("Implementation error: not a primitive"); }

                        const compare = getPrimitiveComparator(propDef.primitive_type);
                        if (compare(change.originalValue, current[change.prop]) !== 0) {
                            throw new Error(`Conflicting primitive value at ${ change.debugPath.toString() }`);
                        }
                    }

                    current[change.prop] = change.originalValue;
                    return virtualDB[itemKey] = current;

                case "set_reference":
                    if (!isUndefined(current[change.prop]) && current[change.prop] !== change.targetId) {
                        throw new Error(`Conflicting reference value at ${ change.debugPath.toString() }`);
                    }

                    current[change.prop] = change.targetId;
                    virtualDB[itemKey] = current;

                    const refDef = new (change.type)()[change.prop];

                    // istanbul ignore if
                    if (!isDataReference(refDef)) { throw new Error("Implementation error: not a reference"); }

                    const Target = refDef.target();
                    const targetDef = new Target();
                    return objectKeys(targetDef).forEach(prop => {
                        const targetPropDef = targetDef[prop];
                        if (!isDataReference(targetPropDef)) { return; }
                        if (targetPropDef.reference_type !== "has_one_inverse") { return; }
                        if (targetPropDef.backlink !== change.prop) { return; }

                        const targetItemKey = `${ getUniverseElementName<UniverseShape>(universe, Target) }_${ change.targetId }`;
                        const virtualTarget = virtualDB[targetItemKey] || {};

                        if (!isUndefined(virtualTarget[prop]) && virtualTarget[prop] !== change.id) {
                            throw new Error(`Conflicting inverse reference value at ${ change.debugPath.toString() }`);
                        }

                        virtualTarget[prop] = change.id;
                        virtualDB[targetItemKey] = virtualTarget;
                    });

                // istanbul ignore next
                default:
                    nevah(change);
                    throw new Error("Unhandled operation");
            }
        });


        const atRes = await queryRunner.query(`SELECT nextval('edit_version_seq'::regclass) AS at`);
        const at = atLeastOne(atRes.rows)[0].at;


        // This will hold mapping from temp ids to real database ids, once all inserts are done
        const tempIds: { [prop: string]: number } = {};
        const resolveId = (id: DbId): number => (id in tempIds ? tempIds[id] : id) as any;


        // Primitives on new entities
        const changesToInsert = changes.filter(isEither(isCreateEntity, isBoth(isSetPrimitive, isProp("id", isTempId))));
        for (const inserts of map(groupBy(changesToInsert, item => `${ getEntityName(item.type) }_${ item.id }`))) {
            const firstChange = atLeastOne(inserts)[0];
            const tableName = getUniverseElementName<UniverseShape>(universe, firstChange.type);

            const metaColumns = ["branch", "by", "at"];
            const metaValues = [serializeBranchId(branch), serializeUserId(user), at];

            const insertPrimitives = inserts.filter(isNot(isCreateEntity));
            const columnPlaceholders = [...metaColumns, ...insertPrimitives].map(() => "%I");
            const valuePlaceholders = [...metaColumns, ...insertPrimitives].map(() => "%L");

            const insertRes = await queryRunner.query(pgFormat(
                `INSERT INTO "public".%I (${ columnPlaceholders.join(", ") }) VALUES (${ valuePlaceholders.join(", ") }) RETURNING "id"`,
                [
                    tableName,
                    ...metaColumns, ...insertPrimitives.map(c => c.prop),
                    ...metaValues, ...insertPrimitives.map(c => c.serializedValue),
                ]
            ));

            tempIds[firstChange.id] = atLeastOne(insertRes.rows)[0].id;
        }


        // After entities are created, refs destined to reside on new entities must be set using `UPDATE`
        const refsOnNewEntities = changes.filter(isBoth(isSetReference, isProp("id", isTempId)));
        for (const refsOnNewEntity of map(groupBy(refsOnNewEntities, item => `${ getEntityName(item.type) }_${ item.id }`))) {
            const firstUpdate = atLeastOne(refsOnNewEntity)[0];
            const tableName = getUniverseElementName<UniverseShape>(universe, firstUpdate.type);

            const typeDef = new (firstUpdate.type)();
            const assignments = uniq(refsOnNewEntities.map(ref => {
                const propDef = typeDef[ref.prop];

                // istanbul ignore if
                if (!isDataReference(propDef) || propDef.reference_type !== "has_one") { throw new Error("Implementation error: not a to-one reference"); }

                const column = refColumnName(ref.prop, getUniverseElementName(universe, propDef.target()));
                return pgFormat(`%I = %L`, [column, ref.targetId !== null ? resolveId(ref.targetId) : null]);
            })).join(", ");

            await queryRunner.query(pgFormat(`
                UPDATE "public".%I SET %s WHERE "id" = %L AND "branch" = %L AND "at" = %L
            `, [tableName, assignments, resolveId(firstUpdate.id), serializeBranchId(branch), at]));
        }


        // Primitives and references on existing entities
        const changesToUpdate = changes.filter(isEither(isBoth(isSetReference, isProp("id", isSavedId)), isBoth(isSetPrimitive, isProp("id", isSavedId))));
        for (const updatePrimitives of map(groupBy(changesToUpdate, item => `${ getEntityName(item.type) }_${ item.id }`))) {
            const firstUpdate = atLeastOne(updatePrimitives)[0];
            const tableName = getUniverseElementName<UniverseShape>(universe, firstUpdate.type);
            const id = resolveId(firstUpdate.id);

            const updates = updatePrimitives.reduce((agg, update) => {
                switch (update.operation) {
                    case "set_primitive":
                        agg[update.prop] = update.serializedValue;
                        return agg;

                    case "set_reference":
                        agg[update.prop] = update.targetId !== null ? resolveId(update.targetId) : null;
                        return agg;

                    // istanbul ignore next
                    default:
                        nevah(update);
                        throw new Error("Unhandled operation");
                }
            }, {} as { [prop: string]: any });


            const typeDef = new (firstUpdate.type)();
            const columnNames = objectKeys(typeDef).map(prop => {
                const propDef = typeDef[prop];

                // istanbul ignore if
                if (isUndefined(propDef)) { throw new Error("Implementation error: undefined prop definition in update"); }
                if (isDataPrimitive(propDef)) { return { prop, column: prop }; }

                // istanbul ignore if
                if (!isDataReference(propDef)) { nevah(propDef); }
                return { prop, column: refColumnName(prop, getUniverseElementName(universe, propDef.target())) };
            });

            const columnNamePlaceholders = columnNames.map(() => "%I");
            const columnNamesAndOverridesPlaceholders = columnNames.map(({ prop }) => prop in updates ? "%L" : "%I");
            const columnNamesAndOverridesValues = columnNames.map(({ prop, column }) => prop in updates ? updates[prop] : column);

            await queryRunner.query(pgFormat(`
                WITH %s
                INSERT INTO "public".%I ("id", "branch", "at", "by", ${ columnNamePlaceholders.join(", ") /* Column names */ })
                SELECT "id", %L, %L, %L, ${ columnNamesAndOverridesPlaceholders.join(", ") /* columns and overrides */ }
                FROM "public".%I entity
                WHERE entity.id = %L /* Target reference id */
                AND entity.at = (
                    SELECT "innerEntity"."at"
                    FROM branch_ranges br /* For each branch find latest matching version */
                    INNER JOIN LATERAL (
                        SELECT max("innerEntity"."at") as at
                        FROM "public".%I "innerEntity"
                        WHERE "innerEntity"."id" = "entity"."id"
                            AND "innerEntity".branch = br.branch
                            AND "innerEntity".at > br.start_version
                            AND "innerEntity".at <= br.end_version
                    ) "innerEntity" on true
                    WHERE "innerEntity"."at" IS NOT NULL
                    ORDER BY br.branch DESC /* Only interested in the most recent matching branch */
                    LIMIT 1
                )
            `, [
                generateBranchRangesCTE(branch),
                tableName, ...columnNames.map(c => c.column),
                serializeBranchId(branch), at, serializeUserId(user), ...columnNamesAndOverridesValues,
                tableName,
                id,
                tableName,
            ]));
        }


        // Substitute temp ids into resulting ids
        const results: any = {};
        for (const sectionKey of sectionKeys) {
            const sectionDef = save[sectionKey]!;
            const { savedItems } = await read({ savedItems: {
                type: sectionDef.type,
                ids: resultIds[sectionKey]!.map(resolveId).map(hydrateId),
                branch: branch,
                references: sectionDef.returning,
            } });

            results[sectionKey] = savedItems;
        }

        return results;
    };
};
