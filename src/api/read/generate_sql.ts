import { ReadIdentifiedNode, ReadReferenceNode } from "./request_structure";
import { EntityDef, EntityRestriction } from "../../definition/entity";
import { pgFormat } from "../../misc/pg_format";
import { isNotNull, nevah, objectKeys } from "../../misc/typeguards";
import { isDataPrimitive } from "../../definition/primitives";
import { InternalProperty } from "../migrations/migrations_builder_api";
import { serializeBranchId } from "../db_values/serialize";
import { refColumnName } from "../migrations/execute_migrations";

const NEWLINE_RE = /\n/g;
const WHITESPACE_RE = /\s+/g;
export function generateSql<Entity extends EntityRestriction<Entity>>(structure: ReadIdentifiedNode<Entity>): string {
    const versions = pgFormat(`
        SELECT id, max(at) as at
        FROM "public".%I "entity"
        INNER JOIN branch_ranges br ON (br.branch = entity.branch)
        WHERE entity.at <= br.end_version
          AND entity.id = ANY($1::int[]) /* Target IDs */
        GROUP BY "entity"."id"
    `, [structure.tableName]);

    const outerSelections = generateSelections(structure.type, structure.alias, structure.nested.map(n => ({ key: n.resultKey, target: n.tableName, alias: n.alias })), "outer");
    const innerSelections = generateSelections(structure.type, "entity", structure.nested.filter(n => n.parentTargetColumn !== "id").map(n => ({ key: n.resultKey, target: n.tableName, alias: n.alias })), "inner");
    const composedJson = pgFormat(`
        SELECT %s /* selections */
        FROM (
            SELECT %s /* selections */
            FROM (%s /* versions */) tip
            INNER JOIN LATERAL (
                SELECT %s /* selections */
                FROM "public".%I entity
                WHERE entity.id = tip.id
                  AND entity.at = tip.at
                LIMIT 1
            ) entity ON true
        ) %I /* alias */
        %s /* Nested joins */
    `, [
        outerSelections, innerSelections,
        versions, innerSelections,
        structure.tableName,
        structure.alias,
        structure.nested.map(generateJoin).join("\n"),
    ]);

    const branchRangesCTE = pgFormat(`
        RECURSIVE branch_ranges(branch, start_version, end_version, parent) AS (
                SELECT
                    id as branch,
                    start_version,
                    9223372036854775807 as end_version,
                    parent
                FROM "public"."branch" current
                WHERE current.id = %L /* Target branch */
            UNION
                SELECT
                    b.id  as branch,
                    b.start_version,
                    p.start_version as end_version,
                    b.parent
                FROM "public"."branch" b
                RIGHT JOIN branch_ranges p ON (p.parent = b.id)
                WHERE b.id IS NOT NULL
        )
    `, [serializeBranchId(structure.branch) /* Target branch */]);

    const query = pgFormat(`
        WITH %s
        SELECT row_to_json(data) AS data FROM (
            %s
        ) data
    `, [branchRangesCTE, composedJson]);

    return query.replace(NEWLINE_RE, " ").replace(WHITESPACE_RE, " ").trim();
}


const _internalProperties: { [P in Exclude<InternalProperty, "branch" /* No need to select branch */>]: null } = {
    id: null,
    by: null,
    at: null,
    ts: null,
};
const internalProperties = objectKeys(_internalProperties);

function generateJoin<Entity extends EntityRestriction<Entity>>(structure: ReadReferenceNode<Entity>): string {
    const versions = pgFormat(`
        SELECT id, max(at) as at
        FROM "public".%I "entity"
        INNER JOIN branch_ranges br ON (br.branch = entity.branch)
        WHERE entity.at <= br.end_version
          AND entity.%I /* own target column */ = %I.%I /* parent target column on parent alias */
        GROUP BY "entity"."id"
    `, [structure.tableName, structure.ownTargetColumn, structure.parentAlias, structure.parentTargetColumn]);

    const outerSelections = generateSelections(structure.type, structure.alias, structure.nested.map(n => ({ key: n.resultKey, target: n.tableName, alias: n.alias })), "outer");
    const innerSelections = generateSelections(structure.type, "entity", structure.nested.filter(n => n.parentTargetColumn !== "id").map(n => ({ key: n.resultKey, target: n.tableName, alias: n.alias })), "inner");
    const composedJson = pgFormat(`
        SELECT %s /* outer selections */
        FROM (
            SELECT %s /* inner selections */
            FROM (%s /* versions */) tip
            INNER JOIN LATERAL (
                SELECT %s /* inner selections */
                FROM "public".%I entity
                WHERE entity.id = tip.id
                  AND entity.at = tip.at
                LIMIT 1
            ) entity ON true
        ) %I /* alias */
        %s /* Nested joins */
    `, [
        outerSelections, innerSelections,
        versions, innerSelections,
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

function generateSelections<Entity extends EntityRestriction<Entity>>(
    Type: EntityDef<Entity>,
    ownAlias: string,
    relations: { key: string, target: string, alias: string }[],
    type: "inner" | "outer"
): string {
    const typeDef = new Type();

    const ownProperties = [
        ...internalProperties,
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
