import { ReadIdentifiedNode, ReadInternalRefNode, ReadReferenceNode } from "./request_structure";
import { EntityDef, EntityRestriction } from "../../definition/entity";
import { pgFormat } from "../../misc/pg_format";
import { isNotNull, nevah, objectKeys } from "../../misc/typeguards";
import { isDataPrimitive } from "../../definition/primitives";
import { serializeBranchId } from "../db_values/serialize";
import { refColumnName } from "../migrations/execute_migrations";
import { BranchId } from "../../temporal";
import { internalReadKeys } from "./internal_read_keys";

export function generateBranchRangesCTE(branch: BranchId) {
    return pgFormat(`
        RECURSIVE branch_ranges(branch, start_version, end_version, branched_from) AS (
                SELECT
                    id as branch,
                    start_version,
                    9223372036854775807 as end_version,
                    branched_from
                FROM "public"."branch" current
                WHERE current.id = %L /* Target branch */
            UNION
                SELECT
                    b.id as branch,
                    b.start_version,
                    p.start_version as end_version,
                    b.branched_from
                FROM "public"."branch" b
                RIGHT JOIN branch_ranges p ON (p.branched_from = b.id)
                WHERE b.id IS NOT NULL
        )
    `, [serializeBranchId(branch) /* Target branch */]);
}


export function generateSql<Entity extends EntityRestriction<Entity>>(structure: ReadIdentifiedNode<Entity>): string {
    const outerSelections = generateSelections(structure.type, structure.alias, structure.nested.map(n => ({ key: n.resultKey, target: n.tableName, alias: n.alias })), "outer");
    const innerSelections = generateSelections(structure.type, "entity", structure.nested.filter(n => n.parentTargetColumn !== "id" && n.nodeType !== "internalReference").map(n => ({ key: n.resultKey, target: n.tableName, alias: n.alias })), "inner");
    const composedJson = pgFormat(`
        SELECT %s /* outer selections */
        FROM (
            SELECT %s /* inner selections */
            FROM "public".%I entity
            WHERE entity.id = ANY($1::int[]) /* Target IDs */
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
        ) %I /* alias */
        %s /* Nested joins */
    `, [
        outerSelections, innerSelections,
        structure.tableName, structure.tableName,
        structure.alias,
        structure.nested.map(generateJoin).join("\n"),
    ]);

    return pgFormat(`
        WITH %s
        SELECT row_to_json(data) AS data FROM (
            %s
        ) data
    `, [generateBranchRangesCTE(structure.branch), composedJson]);
}

function generateJoin(structure: ReadReferenceNode<any> | ReadInternalRefNode): string {
    if ("type" in structure) { return generateReferenceJoin(structure); }
    return generateInternalJoin(structure);
}


function generateReferenceJoin<Entity extends EntityRestriction<Entity>>(structure: ReadReferenceNode<Entity>): string {
    const outerSelections = generateSelections(structure.type, structure.alias, structure.nested.map(n => ({ key: n.resultKey, target: n.tableName, alias: n.alias })), "outer");
    const innerSelections = generateSelections(structure.type, "entity", structure.nested.filter(n => n.parentTargetColumn !== "id" && n.nodeType !== "internalReference").map(n => ({ key: n.resultKey, target: n.tableName, alias: n.alias })), "inner");
    const composedJson = pgFormat(`
        SELECT %s /* outer selections */
        FROM (
            SELECT %s /* inner selections */
            FROM "public".%I entity
            WHERE entity.%I /* own target column */ = %I.%I /* parent target column on parent alias */
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
        ) %I /* alias */
        %s /* Nested joins */
    `, [
        outerSelections, innerSelections,
        structure.tableName,
        structure.ownTargetColumn, structure.parentAlias, structure.parentTargetColumn,
        structure.tableName,
        structure.alias,
        structure.nested.map(generateJoin).join("\n"),
    ]);

    switch (structure.count) {
        case "one": return pgFormat(`
            LEFT JOIN LATERAL (
                SELECT row_to_json(entity) AS %I FROM (
                    %s
                ) entity
                LIMIT 1
            ) %I on true
        `, [structure.resultKey, composedJson, structure.alias]);

        case "many": return pgFormat(`
            LEFT JOIN LATERAL (
                SELECT json_agg(entities.entity) as %I /* Reference property name */ FROM (
                    SELECT row_to_json(entity) AS entity FROM (
                        %s
                    ) entity
                ) entities
            ) %I on true
        `, [
            structure.resultKey,
            composedJson,
            structure.alias,
        ]);

        // istanbul ignore next
        default:
            nevah(structure.count);
            throw new Error("Unhandled count");
    }
}

function generateInternalJoin(structure: ReadInternalRefNode): string {
    const innerSelections = structure.selections.map(col => pgFormat("%I.%I", ["entity", col]));
    const outerSelectionOwnColumns = structure.selections.map(col => pgFormat("%I.%I", [structure.alias, col]));
    const outerSelectionNestedColumns = structure.nested.map(n => pgFormat("%I.%I", [n.alias, n.resultKey]));

    const composedJson = pgFormat(`
        SELECT %s /* outer selections */
        FROM (
            SELECT %s /* inner selections */
            FROM "public".%I entity
            WHERE entity.id = %I.%I /* parent target column on parent alias */
        ) %I /* alias */
        %s /* Nested joins */
    `, [
        [...outerSelectionOwnColumns, ...outerSelectionNestedColumns].join(", "), innerSelections.join(", "),
        structure.tableName,
        structure.parentAlias, structure.parentTargetColumn,
        structure.alias,
        structure.nested.map(generateInternalJoin).join("\n"),
    ]);

    return pgFormat(`
        LEFT JOIN LATERAL (
            SELECT row_to_json(entity) AS %I FROM (
                %s
            ) entity
            LIMIT 1
        ) %I on true
    `, [structure.resultKey, composedJson, structure.alias]);
}

function generateSelections<Entity extends EntityRestriction<Entity>>(
    Type: EntityDef<Entity>,
    ownAlias: string,
    relations: { key: string, target: string, alias: string }[],
    type: "inner" | "outer"
): string {
    const typeDef = new Type();

    const ownProperties = [
        ...internalReadKeys,
        ...objectKeys(typeDef)
            .map(prop => isDataPrimitive(typeDef[prop]) ? prop : null)
            .filter(isNotNull),
    ].map(prop => ({ prop, alias: ownAlias }));

    const relationProps = relations.map(rel => ({
        prop: type === "inner" ? refColumnName(rel.key, rel.target) : rel.key,
        alias: type === "inner" ? ownAlias : rel.alias,
    }));

    return [...ownProperties, ...relationProps].map(({ alias, prop }) => pgFormat(`%I.%I`, [alias, prop as string])).join(", ");
}
