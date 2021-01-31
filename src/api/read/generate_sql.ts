import { ReadIdentifiedNode, ReadInternalRefNode, ReadReferenceNode } from "./request_structure";
import { EntityRestriction } from "../../definition/entity";
import { pgFormat } from "../../misc/pg_format";
import { isNotNull, nevah, objectKeys } from "../../misc/typeguards";
import { isDataPrimitive } from "../../definition/primitives";
import { serializeBranchId } from "../db_values/serialize";
import { refColumnName } from "../migrations/execute_migrations";
import { BranchId } from "../../temporal";
import { internalReadKeys } from "./internal_read_keys";

export function generateBranchRangesCTE(branch?: BranchId) {
    const cte = `
        RECURSIVE branch_ranges(branch, start_version, end_version, branched_from) AS (
                SELECT
                    id as branch,
                    start_version,
                    9223372036854775807 as end_version,
                    branched_from
                FROM "public"."branch" current
                WHERE current.id = ${ branch === undefined ? "$1" : "%L" } /* Target branch */
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
    `;

    if (branch === undefined) { return cte; }
    return pgFormat(cte, [serializeBranchId(branch) /* Target branch */]);
}


const targetAlias = (a: string) => `${ a }_target`;
const branchAlias = (a: string) => `${ a }_branch`;
const innerAlias = (a: string) => `${ a }_inner`;
export function generateSql<Entity extends EntityRestriction<Entity>>(structure: ReadIdentifiedNode<Entity>): string {
    const { innerSelections, outerSelections } = generateSelections(structure);
    const composedJson = pgFormat(`
        SELECT %s /* outer selections */
        FROM (SELECT unnest($2::int[]) as id) %I /* target ids alias */
        INNER JOIN LATERAL (
            SELECT %s /* inner selections */
            FROM branch_ranges %I /* branch alias */
            INNER JOIN "public".%I /* table */ %I /* inner alias */ ON true
            WHERE /* inner alias */ %I.id = %I.id /* target ids alias */
              AND /* inner alias */ %I.branch = /* branch alias */ %I.branch
              AND /* inner alias */ %I.at > /* branch alias */ %I.start_version
              AND /* inner alias */ %I.at <= /* branch alias */ %I.end_version
            ORDER BY /* branch alias */ %I.branch DESC, /* inner alias */ %I.at DESC
            LIMIT 1
        ) %I /* alias */ ON true
        %s /* Nested joins */
    `, [
        outerSelections,
        targetAlias(structure.alias),
        innerSelections,
        branchAlias(structure.alias),
        structure.tableName, innerAlias(structure.alias),

        innerAlias(structure.alias), targetAlias(structure.alias),
        innerAlias(structure.alias), branchAlias(structure.alias),
        innerAlias(structure.alias), branchAlias(structure.alias),
        innerAlias(structure.alias), branchAlias(structure.alias),
        branchAlias(structure.alias), innerAlias(structure.alias),
        structure.alias,

        structure.nested.map(generateJoin).join("\n"),
    ]);

    return pgFormat(`
        WITH %s
        SELECT row_to_json(data) AS data FROM (
            %s
        ) data
    `, [generateBranchRangesCTE(), composedJson]);
}

function generateJoin(structure: ReadReferenceNode<any> | ReadInternalRefNode): string {
    if ("type" in structure) { return generateReferenceJoin(structure); }
    return generateInternalJoin(structure);
}


function generateReferenceJoin<Entity extends EntityRestriction<Entity>>(structure: ReadReferenceNode<Entity>): string {
    const { innerSelections, outerSelections } = generateSelections(structure);
    const composedJson = pgFormat(`
        SELECT %s /* outer selections */
        FROM (
            SELECT DISTINCT id
            FROM "public".%I /* table */ entity
            WHERE entity.%I /* own target column */ = %I.%I /* parent target column on parent alias */
            ORDER BY id ASC
        ) %I /* target ids alias */
        INNER JOIN LATERAL (
            SELECT %s /* inner selections */
            FROM branch_ranges %I /* branch alias */
            INNER JOIN "public".%I /* table */ %I /* inner alias */ ON true
            WHERE /* inner alias */ %I.id = %I.id /* target ids alias */
              AND /* inner alias */ %I.branch = /* branch alias */ %I.branch
              AND /* inner alias */ %I.at > /* branch alias */ %I.start_version
              AND /* inner alias */ %I.at <= /* branch alias */ %I.end_version
            ORDER BY /* branch alias */ %I.branch DESC, /* inner alias */ %I.at DESC
            LIMIT 1
        ) %I /* alias */ ON true

        %s /* Nested joins */

        WHERE /* alias */ %I.%I /* own target column */ = %I.%I /* parent target column on parent alias */
    `, [
        outerSelections,
        structure.tableName,
        structure.ownTargetColumn, structure.parentAlias, structure.parentTargetColumn,
        targetAlias(structure.alias),
        innerSelections,
        branchAlias(structure.alias),
        structure.tableName, innerAlias(structure.alias),

        innerAlias(structure.alias), targetAlias(structure.alias),
        innerAlias(structure.alias), branchAlias(structure.alias),
        innerAlias(structure.alias), branchAlias(structure.alias),
        innerAlias(structure.alias), branchAlias(structure.alias),
        branchAlias(structure.alias), innerAlias(structure.alias),
        structure.alias,

        structure.nested.map(generateJoin).join("\n"),

        structure.alias, structure.ownTargetColumn, structure.parentAlias, structure.parentTargetColumn,
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

const formatSelections = (selections: ReadonlyArray<{ alias: string, prop: string }>) => selections.map(({ alias, prop }) => pgFormat(`%I.%I`, [alias, prop as string])).join(", ");
function generateSelections<Entity extends EntityRestriction<Entity>>(
    structure: ReadIdentifiedNode<Entity> | ReadReferenceNode<Entity>
) {
    const typeDef = new (structure.type)();
    const ownProperties = [
        ...internalReadKeys,
        ...objectKeys(typeDef)
            .map(prop => isDataPrimitive(typeDef[prop]) ? prop : null)
            .filter(isNotNull),
    ];

    const requestedInternalRefs = structure.nested.filter(n => n.nodeType === "internalReference").map(n => n.resultKey);
    const innerReferenceColumns = structure.nested.filter(n => n.parentTargetColumn !== "id" && n.nodeType !== "internalReference").map(n => ({ alias: innerAlias(structure.alias), prop: refColumnName(n.resultKey, n.tableName) }));
    return {
        outerSelections: formatSelections([
            ...ownProperties.filter(prop => !requestedInternalRefs.includes(prop as string)).map(prop => ({ alias: structure.alias, prop: prop as string })),
            ...structure.nested.map(n => ({ alias: n.alias, prop: n.resultKey })),
        ]),
        innerSelections: formatSelections([
            ...[structure.nodeType === "reference" && structure.ownTargetColumn !== "id" && innerReferenceColumns.every(c => c.prop !== structure.ownTargetColumn) ? { alias: innerAlias(structure.alias), prop: structure.ownTargetColumn } : null].filter(isNotNull),
            ...ownProperties.map(prop => ({ alias: innerAlias(structure.alias), prop: prop as string })),
            ...innerReferenceColumns,
        ]),
    };
}
