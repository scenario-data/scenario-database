import { getUniverseElementName, UniverseRestriction, UniverseShape } from "../universe";
import { QueryRunner } from "../query_runner/query_runner_api";
import { DatabaseWrite } from "./write_api";
import {
    atLeastOne,
    isBoth,
    isEither,
    isNot,
    isNotNull,
    isProp,
    isUndefined,
    nevah,
    objectKeys
} from "../../misc/typeguards";
import { pgFormat } from "../../misc/pg_format";
import { serializeBranchId, serializeId, serializePrimitive, serializeUserId } from "../db_values/serialize";
import { createRead } from "../read/read";
import { getPrimitiveComparator, isDataPrimitive } from "../../definition/primitives";
import { EntityDef, EntityShape, getEntityName, Id, isId } from "../../definition/entity";
import { isDataReference } from "../../definition/references";
import { flatten, groupBy, isPlainObject, map, uniqBy } from "lodash";
import { refColumnName } from "../migrations/execute_migrations";
import { generateBranchRangesCTE } from "../read/generate_sql";
import { hydrateId } from "../db_values/hydrate";
import { isInternalReadKey } from "../read/internal_read_keys";
import { path, Path } from "../../misc/tspath";


type SavedID = number;
type TransientID = string;
type DbId = SavedID | TransientID;

const transientIdMarker = "$$";

export function transientId(id: string): Id<any>;
export function transientId<T extends Id<any>>(id: T): T;
export function transientId<T extends string>(id: T): T {
    return `${ transientIdMarker }${ id }${ transientIdMarker }` as any;
}

const markerReChunk = transientIdMarker.split("").map(char => `\\${char}`).join("");
const transientIdRe = new RegExp(`^${ markerReChunk }.+${ markerReChunk }$`);
const isExternalTransientId = (id: DbId): id is TransientID => typeof id === "string" && transientIdRe.test(id);

const internalTransientIdPrefix = "internal_transient_id_";
const isInternalTransientId = (id: DbId): id is TransientID => typeof id === "string" && id.indexOf(internalTransientIdPrefix) === 0;
const isTransientId = isEither(isExternalTransientId, isInternalTransientId);

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

interface UnsetReference {
    operation: "unset_reference";
    type: EntityDef<EntityShape>;
    targetId: SavedID;
    prop: string;
    debugPath: Path<any, any>;
}
const isUnsetReference = (val: AtomicChange): val is UnsetReference => val.operation === "unset_reference";

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
    id: TransientID;
    debugPath: Path<any, any>;
}
const isCreateEntity = (val: AtomicChange): val is CreateEntity => val.operation === "create_entity";

interface PutEntity {
    operation: "put_entity";
    type: EntityDef<EntityShape>;
    id: SavedID;
    debugPath: Path<any, any>;
}
const isPutEntity = (val: AtomicChange): val is PutEntity => val.operation === "put_entity";

type AtomicChange = SetPrimitive | SetReference | UnsetReference | CreateEntity | PutEntity;

const selectChanges = (getTransientId: (t: EntityDef<EntityShape>) => string, Type: EntityDef<EntityShape>, value: any, debugPath: Path<any, any>): { id: DbId, changes: AtomicChange[] } => {
    if (!value || !isPlainObject(value)) { throw new Error(`Expected a plain object value, got: ${ JSON.stringify(value) }`); }
    if (!isId(value.id) && value.id !== undefined && !isExternalTransientId(value.id)) { throw new Error(`Entity id may only be an entity id, undefined or a transient id. Given: ${ JSON.stringify(value.id) }`); }

    const typeDef = new Type();
    const id = value.id ? (isExternalTransientId(value.id) ? value.id : serializeId(value.id)) : getTransientId(Type);

    const create: (CreateEntity | PutEntity)[] = value.id && !isExternalTransientId(value.id)
        ? [{
            operation: "put_entity",
            type: Type,
            id: id as SavedID,
            debugPath,
        }]
        : [{
            operation: "create_entity",
            type: Type,
            id: id as TransientID,
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
                const oneNestedItem = val !== null ? selectChanges(getTransientId, TargetType, val, propPath) : null;
                const hasOne: SetReference = {
                    operation: "set_reference",
                    type: Type,
                    id, prop,
                    targetId: oneNestedItem?.id || null,
                    debugPath: propPath,
                };
                return [hasOne, ...(oneNestedItem?.changes || [])];

            case "has_one_inverse":
                if (val === null) {
                    if (isTransientId(id)) { return []; } // Reference on a new item will be null by default

                    const unsetRef: UnsetReference = {
                        operation: "unset_reference",
                        type: TargetType,
                        targetId: id,
                        prop: propDef.backlink,
                        debugPath: propPath,
                    };
                    return [unsetRef];
                }

                const inverseNestedItem = selectChanges(getTransientId, TargetType, val, propPath);
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
                if (!Array.isArray(val)) { throw new Error("Data for to-many relation must be an array"); }
                return flatten(val.map((item, idx) => {
                    const itemPath = propPath[idx]!;
                    const nestedItem = selectChanges(getTransientId, TargetType, item, itemPath);
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


export const createWrite = <
    Universe extends UniverseRestriction<Universe>
>(queryRunner: QueryRunner, universe: Universe): DatabaseWrite<Universe> => {
    const read = createRead(queryRunner, universe);
    const universeName = (Type: EntityDef<EntityShape>) => getUniverseElementName<UniverseShape>(universe, Type);

    return async (branch, user, save) => { // TODO: logging with logId
        let transientIdx = 0;
        const getTransientId = (Type: EntityDef<EntityShape>) => `${ internalTransientIdPrefix }_${ getEntityName(Type) }_${ transientIdx++ }`;

        // Create a mapping from the save request to the response using transient ids if necessary.
        // As a side-effect, this also builds a set of changes to be applied.
        const changes: AtomicChange[] = [];
        const sectionKeys = Object.keys(save);
        const resultIds = sectionKeys.reduce((_agg, k) => {
            const section = save[k]!;
            _agg[k] = section.values.map(item => {
                const itemData = selectChanges(getTransientId, section.type, item, path()[k]!);

                // istanbul ignore if
                if (itemData.changes.length === 0) { throw new Error("Implementation error: no changes"); }

                changes.push(...itemData.changes);
                return itemData.id;
            });
            return _agg;
        }, {} as { [prop: string]: DbId[] });


        // Detect conflicts within request
        const virtualDB: { [prop: string]: any } = {};
        const getItemKey = (Type: EntityDef<EntityShape>, id: DbId) => `${ universeName(Type) }_${ id }`;
        changes.forEach(change => {
            switch (change.operation) {
                case "put_entity": return; // No-op
                case "create_entity": return; // No-op
                case "unset_reference": return; // No conflicts on unset: it is ok to unset reference and set it to another value

                case "set_primitive":
                    const itemKeyForPrimitives = getItemKey(change.type, change.id);
                    const currentForPrimitives = virtualDB[itemKeyForPrimitives] || {};
                    if (!isUndefined(currentForPrimitives[change.prop])) {
                        const propDef = new (change.type)()[change.prop];

                        // istanbul ignore if
                        if (!isDataPrimitive(propDef)) { throw new Error("Implementation error: not a primitive"); }

                        const compare = getPrimitiveComparator(propDef.primitive_type);
                        if (compare(change.originalValue, currentForPrimitives[change.prop]) !== 0) {
                            throw new Error(`Conflicting primitive value at ${ change.debugPath.toString() }`);
                        }
                    }

                    currentForPrimitives[change.prop] = change.originalValue;
                    return virtualDB[itemKeyForPrimitives] = currentForPrimitives;

                case "set_reference":
                    const itemKeyForReferences = getItemKey(change.type, change.id);
                    const currentForReferences = virtualDB[itemKeyForReferences] || {};
                    if (!isUndefined(currentForReferences[change.prop]) && currentForReferences[change.prop] !== change.targetId) {
                        throw new Error(`Conflicting reference value at ${ change.debugPath.toString() }`);
                    }

                    currentForReferences[change.prop] = change.targetId;
                    virtualDB[itemKeyForReferences] = currentForReferences;

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

                        const targetItemKey = `${ universeName(Target) }_${ change.targetId }`;
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


        // This will hold mapping from transient ids to real database ids, once all inserts are done
        const transientIds: { [prop: string]: number } = {};
        const resolveId = (id: DbId): number => (id in transientIds ? transientIds[id] : id) as any;


        // Primitives on new entities
        const changesToInsert = changes.filter(isEither(isCreateEntity, isBoth(isSetPrimitive, isProp("id", isTransientId))));
        for (const inserts of map(groupBy(changesToInsert, item => `${ getEntityName(item.type) }_${ item.id }`))) {
            const firstChange = atLeastOne(inserts)[0];
            const tableName = universeName(firstChange.type);

            const metaColumns = ["branch", "by", "at"];
            const metaValues = [serializeBranchId(branch), serializeUserId(user), at];

            const insertPrimitives = uniqBy(
                inserts.filter(isNot(isCreateEntity)),
                set => set.prop // Conflicts already checked above, this is purely deduplication
            );
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

            transientIds[firstChange.id] = atLeastOne(insertRes.rows)[0].id;
        }


        // After entities are created, refs destined to reside on new entities must be set using `UPDATE`
        const refsOnNewEntities = changes.filter(isBoth(isSetReference, isProp("id", isTransientId)));
        for (const refsOnNewEntity of map(groupBy(refsOnNewEntities, item => `${ getEntityName(item.type) }_${ item.id }`))) {
            const firstUpdate = atLeastOne(refsOnNewEntity)[0];
            const tableName = universeName(firstUpdate.type);

            const typeDef = new (firstUpdate.type)();
            const assignments = refsOnNewEntity.map(ref => {
                const propDef = typeDef[ref.prop];

                // istanbul ignore if
                if (!isDataReference(propDef) || propDef.reference_type !== "has_one") { throw new Error("Implementation error: not a to-one reference"); }

                const column = refColumnName(ref.prop, universeName(propDef.target()));
                return pgFormat(`%I = %L`, [column, ref.targetId !== null ? resolveId(ref.targetId) : null]);
            }).join(", ");

            await queryRunner.query(pgFormat(`
                UPDATE "public".%I SET %s WHERE "id" = %L AND "branch" = %L AND "at" = %L
            `, [tableName, assignments, resolveId(firstUpdate.id), serializeBranchId(branch), at]));
        }


        const unsetEntities: { type: EntityDef<EntityShape>, id: SavedID, prop: string }[] = [];
        for (const unset of changes.filter(isUnsetReference)) {
            const tableName = universeName(unset.type);

            const typeDef = new (unset.type)();
            const refPropDef = typeDef[unset.prop];

            // istanbul ignore if
            if (isUndefined(refPropDef)) { throw new Error("Implementation error: undefined ref prop definition in unset"); }
            // istanbul ignore if
            if (!isDataReference(refPropDef)) { throw new Error("Implementation error: specified ref prop is not a data reference"); }

            const columnNames = objectKeys(typeDef).map(prop => {
                const propDef = typeDef[prop];

                // istanbul ignore if
                if (isUndefined(propDef)) { throw new Error("Implementation error: undefined prop definition in unset"); }
                if (isDataPrimitive(propDef)) { return { prop, column: prop }; }

                // istanbul ignore if
                if (!isDataReference(propDef)) { nevah(propDef); }
                return { prop, column: refColumnName(prop, universeName(propDef.target())) };
            });

            const columnNamePlaceholders = ["id", "branch", "at", "by", ...columnNames.map(() => "%I")];
            const columnNamesAndOverridesPlaceholders = ["placeholder.id", "%L", "%L", "%L", ...columnNames.map(({ prop }) => prop === unset.prop ? "%L" : "entity.%I")];
            const columnNamesAndOverridesValues = [serializeBranchId(branch), at, serializeUserId(user), ...columnNames.map(({ prop, column }) => prop === unset.prop ? null : column)];

            const updatedRes = await queryRunner.query(pgFormat(`
                WITH %s
                INSERT INTO "public".%I (${ columnNamePlaceholders.join(", ") /* Column names */ })
                SELECT ${ columnNamesAndOverridesPlaceholders.join(", ") /* columns and overrides */ }
                FROM (select %L::int as id) placeholder /* Entity might not exist in a branch, so placeholder with left join ensures null values are provided */
                LEFT JOIN (
                    SELECT *
                    FROM "public".%I entity
                    WHERE entity.%I /* Target ref prop */ = %L /* Target reference id */
                    AND entity.at = (
                        SELECT "innerEntity"."at"
                        FROM branch_ranges br /* For each branch find latest matching version */
                        INNER JOIN "public".%I "innerEntity" ON true
                        WHERE "innerEntity"."id" = "entity"."id"
                          AND "innerEntity".branch = br.branch
                          AND "innerEntity".at > br.start_version
                          AND "innerEntity".at <= br.end_version
                        /* Only interested in the most recent version of the most recent matching branch */
                        ORDER BY br.branch DESC, "innerEntity"."at" DESC
                        LIMIT 1
                    )
                ) entity
                ON (placeholder.id = entity.id)
                RETURNING "id"
            `, [
                generateBranchRangesCTE(branch),
                tableName, ...columnNames.map(c => c.column),
                ...columnNamesAndOverridesValues,
                unset.targetId,
                tableName,
                refColumnName(unset.prop, universeName(refPropDef.target())), unset.targetId,
                tableName,
            ]));

            unsetEntities.push({ type: unset.type, id: atLeastOne(updatedRes.rows)[0].id, prop: unset.prop });
        }


        // Primitives and references on existing entities
        const changesToUpdate = changes.filter(
            isEither(
                isEither(isBoth(isSetReference, isProp("id", isSavedId)), isBoth(isSetPrimitive, isProp("id", isSavedId))),
                isPutEntity
            )
        );
        for (const entityUpdates of map(groupBy(changesToUpdate, item => `${ getEntityName(item.type) }_${ item.id }`))) {
            const firstUpdate = atLeastOne(entityUpdates)[0];
            const tableName = universeName(firstUpdate.type);
            const id = firstUpdate.id;

            const matchingUnsets = unsetEntities.filter(e => universeName(e.type) === universeName(firstUpdate.type) && e.id === id);
            const updates = entityUpdates.reduce((agg, update) => {
                switch (update.operation) {
                    case "put_entity": return agg;

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
                if (matchingUnsets.some(x => x.prop === prop) && !(prop in updates)) { return null; } // Don't copy previously unset prop, unless it is explicitly overridden

                const propDef = typeDef[prop];

                // istanbul ignore if
                if (isUndefined(propDef)) { throw new Error("Implementation error: undefined prop definition in update"); }
                if (isDataPrimitive(propDef)) { return { prop, column: prop }; }

                // istanbul ignore if
                if (!isDataReference(propDef)) { nevah(propDef); }
                if (propDef.reference_type !== "has_one") { return null; } // Only to-one columns exist in the db
                return { prop, column: refColumnName(prop, universeName(propDef.target())) };
            }).filter(isNotNull);

            if (matchingUnsets.length === 0) {
                // Insert new row

                const columnNamesWithPlaceholders = ["id", "branch", "at", "by", ...columnNames.map(() => "%I")];
                const columnNamesAndOverridesPlaceholders = ["placeholder.id", "%L", "%L", "%L", ...columnNames.map(({ prop }) => prop in updates ? "%L" : "entity.%I")];
                const columnNamesAndOverridesValues = [serializeBranchId(branch), at, serializeUserId(user), ...columnNames.map(({ prop, column }) => prop in updates ? updates[prop] : column)];
                await queryRunner.query(pgFormat(`
                    WITH %s
                    INSERT INTO "public".%I (${ columnNamesWithPlaceholders.join(", ") /* Column names */ })
                    SELECT ${ columnNamesAndOverridesPlaceholders.join(", ") /* columns and overrides */ }
                    FROM (select %L::int as id) placeholder /* Entity might not exist in a branch, so placeholder with left join ensures null values are provided */
                    LEFT JOIN (
                        SELECT *
                        FROM "public".%I entity
                        WHERE entity.id = %L /* Target reference id */
                        AND entity.at = (
                            SELECT "innerEntity"."at"
                            FROM branch_ranges br /* For each branch find latest matching version */
                            INNER JOIN "public".%I "innerEntity" ON true
                            WHERE "innerEntity"."id" = %L /* Target reference id */
                              AND "innerEntity".branch = br.branch
                              AND "innerEntity".at > br.start_version
                              AND "innerEntity".at <= br.end_version
                            /* Only interested in the most recent version of the most recent matching branch */
                            ORDER BY br.branch DESC, "innerEntity"."at" DESC
                            LIMIT 1
                        )
                    ) entity
                    ON (placeholder.id = entity.id)
                `, [
                    generateBranchRangesCTE(branch),
                    tableName, ...columnNames.map(c => c.column),
                    ...columnNamesAndOverridesValues,
                    id,
                    tableName,
                    id,
                    tableName,
                    id,
                ]));
            } else {
                // Update row with unset reference
                const overwrittenColumns = columnNames.filter(({ prop }) => prop in updates);
                const assignments = overwrittenColumns.map(col => pgFormat(`%I = %L`, [col.column, updates[col.prop]])).join(", ");
                await queryRunner.query(pgFormat(`
                    UPDATE "public".%I SET %s WHERE "id" = %L AND "branch" = %L AND "at" = %L
                `, [
                    tableName,
                    assignments,
                    id, serializeBranchId(branch), at,
                ]));
            }
        }


        // Substitute transient ids into resulting ids and return the data
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
