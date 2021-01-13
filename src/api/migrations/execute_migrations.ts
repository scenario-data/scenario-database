import { QueryRunner } from "../query_runner/query_runner_api";
import {
    AddIndexFieldsMigration,
    AddIndexMigration,
    AddPrimitiveFieldsMigration,
    AddReferenceMigration,
    AddTypeMigration,
    Migration,
    RemoveFieldMigration,
    RemoveIndexFieldMigration,
    RemoveIndexMigration,
    RemoveTypeMigration,
    RenameFieldMigration
} from "../../definition/migrations";
import { atLeastOne, identity, nevah, objectKeys } from "../../misc/typeguards";
import { hash } from "../../misc/hash";
import { DataPrimitive, isDataPrimitive } from "../../definition/primitives";
import { InternalFKPrimitive } from "../fetch_types/internal_foreign_keys";
import { pgFormat } from "../../misc/pg_format";
import {
    columnDataType,
    columnExists,
    findColumnsContainingString,
    findReferenceColumn,
    tableExists
} from "./database_meta_util";
import { IndexFieldMeta } from "./metadata";
import { IndexTablePrefix } from "./migrations_builder_api";
import { KnownSearchConditionTypes } from "../../definition/index/search_conditions";
import { groupBy, map, sortBy, uniq } from "lodash";


export async function executeMigrations(queryRunner: QueryRunner, migrations: readonly Migration[]): Promise<void> {
    for (const migration of migrations) {
        await executeMigration(queryRunner, migration);
    }
}

export async function executeMigration(queryRunner: QueryRunner, migration: Migration): Promise<void> {
    switch (migration.action) {
        case "addType": return addType(queryRunner, migration);
        case "removeType": return removeType(queryRunner, migration);

        case "addPrimitiveFields": return addPrimitiveFields(queryRunner, migration);
        case "addReference": return addReference(queryRunner, migration);
        case "removeField": return removeField(queryRunner, migration);
        case "renameField": return renameField(queryRunner, migration);


        case "addIndex": return addIndex(queryRunner, migration);
        case "removeIndex": return removeIndex(queryRunner, migration);
        case "addIndexFields": return addIndexFields(queryRunner, migration);
        case "removeIndexField": return removeIndexField(queryRunner, migration);


        // istanbul ignore next
        default:
            nevah(migration);
            throw new Error("Unhandled migration type");
    }
}


export async function prepare(queryRunner: QueryRunner) {
    await queryRunner.query(`CREATE EXTENSION pg_trgm;`); // Enable trigram indices


    // Create version sequence
    await queryRunner.query(`CREATE SEQUENCE "edit_version_seq" INCREMENT BY 1 NO MAXVALUE START WITH 1 NO CYCLE OWNED BY NONE;`);


    // Create user table
    await queryRunner.query(`CREATE TABLE "public"."user" (
        "id" SERIAL NOT NULL,
        "ts" TIMESTAMP without time zone NOT NULL DEFAULT now(),
        "created_by" INT,

        CONSTRAINT "PK_USER_ID" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(pgFormat(`ALTER TABLE "public"."user" ADD CONSTRAINT %I FOREIGN KEY ("created_by") REFERENCES "public"."user"("id")`, [`FK_USER_PARENT`]));

    // Add root and anonymous users
    await queryRunner.query(`INSERT INTO "public"."user" ("id") VALUES (DEFAULT), (DEFAULT)`);


    // Add branches table
    await queryRunner.query(`CREATE TABLE "public"."branch" (
        "id" SERIAL NOT NULL,
        "start_version" INT NOT NULL DEFAULT currval('edit_version_seq'::regclass),
        "branched_from" INT,
        "ts" TIMESTAMP without time zone NOT NULL DEFAULT now(),
        "created_by" INT NOT NULL,

        CONSTRAINT "PK_BRANCH_ID" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(pgFormat(`ALTER TABLE "public"."branch" ADD CONSTRAINT %I FOREIGN KEY ("branched_from") REFERENCES "public"."branch"("id")`, [`FK_BRANCH_PARENT`]));
    await queryRunner.query(pgFormat(`ALTER TABLE "public"."branch" ADD CONSTRAINT %I FOREIGN KEY ("created_by") REFERENCES "public"."user"("id")`, [`FK_BRANCH_OWNER`]));
    await queryRunner.query(`CREATE INDEX "BRANCH_ID" ON "public"."branch" ("id")`);
    await queryRunner.query(`CREATE INDEX "BRANCH_PARENT" ON "public"."branch" ("branched_from")`);

    // Insert master and meta branches, both without parents and owned by root
    await queryRunner.query(`INSERT INTO "public"."branch" ("start_version", "created_by") VALUES (nextval('edit_version_seq'::regclass), 1), (nextval('edit_version_seq'::regclass), 1)`);

    await queryRunner.query(`CREATE TABLE "public"."index_meta" (
        "id" SERIAL NOT NULL,
        "name" text,
        "target_type" text,

        CONSTRAINT "PK_INDEX_META" PRIMARY KEY ("id")
    )`);
}


const indexTablePrefix: IndexTablePrefix = "index_";
export const indexTable = <T extends string>(name: T): `${ IndexTablePrefix }${ T }` => `${ indexTablePrefix }${ name }` as any;
async function addType(queryRunner: QueryRunner, migration: AddTypeMigration<string>): Promise<void> {
    if (migration.type.indexOf(indexTablePrefix) > -1) { throw new Error(`Type can not be an index`); }

    await queryRunner.query(pgFormat(`CREATE TABLE "public".%I (
        "id" SERIAL NOT NULL,
        "at" INT NOT NULL DEFAULT nextval('edit_version_seq'::regclass),
        "branch" INT NOT NULL,
        "by" INT NOT NULL,
        "ts" TIMESTAMP without time zone NOT NULL DEFAULT now()
    )`, [migration.type]));

    const nameHash = hash(migration.type, 16);

    const formatted = pgFormat(`ALTER TABLE "public".%I ADD CONSTRAINT %I FOREIGN KEY ("branch") REFERENCES "public"."branch"("id")`, [migration.type, `FK_BRANCH_${ nameHash }`]);

    await queryRunner.query(formatted);
    await queryRunner.query(pgFormat(`ALTER TABLE "public".%I ADD CONSTRAINT %I FOREIGN KEY ("by") REFERENCES "public"."user"("id")`, [migration.type, `FK_USER_${ nameHash }`]));
    await queryRunner.query(pgFormat(`CREATE INDEX %I ON "public".%I ("branch", "id", "at")`, [`SELECT_BY_ID_IDX_${ nameHash }`, migration.type]));
}

export const refSuffix = (target: string) => `_ref_${ target }`;
export const refColumnName = (field: string, target: string) => `${ field }${ refSuffix(target) }`;

async function removeType(queryRunner: QueryRunner, migration: RemoveTypeMigration<string>): Promise<void> {
    const references = await findColumnsContainingString(queryRunner, refSuffix(migration.type));
    const externalReferences = references.filter(({ table_name }) => table_name !== migration.type);
    if (externalReferences.length > 0) { throw new Error(`Type ${ migration.type } is referenced by: ${ JSON.stringify(externalReferences) }`); }

    const indices = await queryRunner.query(`SELECT "name" FROM "public"."index_meta" WHERE "target_type" = $1`, [migration.type]);
    if (indices.rows.length > 0) { throw new Error(`Type ${ migration.type } is indexed by ${ indices.rows.map(r => `'${ r.name }'`).join(", ") }`); }

    await queryRunner.query(pgFormat(`DROP TABLE "public".%I`, [migration.type]));
}

const _internalFKPrimitiveTypes: { [P in InternalFKPrimitive["primitive_type"]]: null } = {
    branch: null,
    user: null,
};
const internalFKPrimitiveTypes = objectKeys(_internalFKPrimitiveTypes);
const isInternalFkPrimitiveType = (t: DataPrimitive["primitive_type"]): t is InternalFKPrimitive["primitive_type"] => internalFKPrimitiveTypes.indexOf(t as any) !== -1;

function pgPrimitiveType(p: DataPrimitive): string {
    /* istanbul ignore if */
    if (p.primitive_type === "enum") { throw new Error("Can't handle enums"); }

    switch (p.primitive_type) {
        case "user": return "int";
        case "branch": return "int";
        case "bool": return "boolean";
        case "buffer": return "bytea";
        case "float": return "float";
        case "int": return "bigint";
        case "local_date": return "date";
        case "local_date_time": return "timestamp";
        case "money": return "numeric(15, 4)";
        case "string": return "text";
        case "version": return "bigint";

         // istanbul ignore next
        default:
            nevah(p);
            throw new Error("Unhandled primitive type");
    }
}
async function addPrimitiveFields(queryRunner: QueryRunner, migration: AddPrimitiveFieldsMigration<string, { [prop: string]: DataPrimitive }>): Promise<void> {
    for (const field of objectKeys(migration.fields)) {
        const primitive = migration.fields[field]!;
        if (!isDataPrimitive(primitive)) { throw new Error(`Expected a data primitive, got ${ JSON.stringify(primitive) }`); }

        if (await columnExists(queryRunner, migration.type, field)) { throw new Error(`Primitive field '${ field }' already exists on '${ migration.type }'`); }
        if (null !== await findReferenceColumn(queryRunner, migration.type, field)) { throw new Error(`Reference prop '${ field }' already exists on '${ migration.type }'`); }

        if (primitive.primitive_type === "enum") {
            const enumName = `E${ hash(primitive.name, 16) }`;
            await queryRunner.query(pgFormat(`CREATE TYPE %I AS ENUM (%L)`, [enumName, primitive.values]));
            await queryRunner.query(pgFormat(`ALTER TABLE "public".%I ADD COLUMN %I %I`, [migration.type, field, enumName]));

            continue;
        }

        await queryRunner.query(pgFormat(`ALTER TABLE "public".%I ADD COLUMN %I ${ pgPrimitiveType(primitive) }`, [migration.type, field]));

        const primitiveType = primitive.primitive_type;
        if (isInternalFkPrimitiveType(primitiveType)) {
            const nameHash = hash(migration.type, 16);
            switch (primitiveType) {
                case "branch":
                    await queryRunner.query(pgFormat(`ALTER TABLE "public".%I ADD CONSTRAINT %I FOREIGN KEY ("branch") REFERENCES "public"."branch"("id")`, [migration.type, `FK_BRANCH_PRIMITIVE_${ nameHash }`]));
                    break;

                case "user":
                    await queryRunner.query(pgFormat(`ALTER TABLE "public".%I ADD CONSTRAINT %I FOREIGN KEY ("by") REFERENCES "public"."user"("id")`, [migration.type, `FK_USER_PRIMITIVE_${ nameHash }`]));
                    break;

                 // istanbul ignore next
                default:
                    nevah(primitiveType);
                    throw new Error("Unhandled internal fk type");
            }
        }
    }
}

async function addReference(queryRunner: QueryRunner, migration: AddReferenceMigration<string, string, string>): Promise<void> {
    if (!(await tableExists(queryRunner, migration.target))) { throw new Error(`Unknown target type: ${ migration.target }`); }
    if (await columnExists(queryRunner, migration.type, migration.field)) { throw new Error(`Primitive field '${ migration.field }' already exists on '${ migration.type }'`); }
    if (null !== await findReferenceColumn(queryRunner, migration.type, migration.field)) { throw new Error(`Reference prop '${ migration.field }' already exists on '${ migration.type }'`); }

    const columnName = refColumnName(migration.field, migration.target);
    const indexHash = hash(`${ migration.type }:${ columnName }`, 16);
    await queryRunner.query(pgFormat(`ALTER TABLE "public".%I ADD COLUMN %I INT`, [migration.type, columnName]));
    await queryRunner.query(pgFormat(`CREATE INDEX %I ON "public".%I (%I)`, [`REF_IDX_${ indexHash }`, migration.type, columnName]));
}

async function removeField(queryRunner: QueryRunner, migration: RemoveFieldMigration<string, string>): Promise<void> {
    // TODO: check if field is used in any index
    await queryRunner.query(pgFormat(`ALTER TABLE "public".%I DROP COLUMN %I`, [migration.type, migration.field]));
}

async function renameField(queryRunner: QueryRunner, migration: RenameFieldMigration<string, string, string>): Promise<void> {
    await queryRunner.query(pgFormat(`ALTER TABLE "public".%I RENAME COLUMN %I TO %I`, [migration.type, migration.from, migration.to]));
}


async function addIndex(queryRunner: QueryRunner, migration: AddIndexMigration<string, string>): Promise<void> {
    if (migration.type.indexOf(indexTablePrefix) > -1) { throw new Error(`Index target type can not be an index`); }
    if (!(await tableExists(queryRunner, migration.type))) { throw new Error(`Unknown target type: ${ migration.type }`); }

    await queryRunner.query(pgFormat(`CREATE TABLE "public".%I (
        "branch" INT NOT NULL,
        "id" INT NOT NULL,

        CONSTRAINT %I FOREIGN KEY ("branch") REFERENCES "public"."branch" ("id")
    )`, [indexTable(migration.name), `FK_INDEX_BRANCH_${ hash(migration.name, 16) }`]));

    await queryRunner.query(`
        INSERT INTO "public"."index_meta" ("name", "target_type")
        VALUES ($1, $2)
    `, [migration.name, migration.type]);
}

async function removeIndex(queryRunner: QueryRunner, migration: RemoveIndexMigration<string>): Promise<void> {
    await queryRunner.query(pgFormat(`DROP TABLE "public".%I`, [indexTable(migration.index)]));
    await queryRunner.query(`DELETE FROM "public"."index_meta" WHERE "name" = $1`, [migration.index]);
}

function selectIndexType(op: KnownSearchConditionTypes): { index: string, opclass?: string } {
    switch (op) {
        case "eq":
        case "neq":
        case "gt":
        case "lt":
            return { index: "btree" };

        case "contains":
            return { index: "gist", opclass: "gist_trgm_ops" };

        // istanbul ignore next
        default:
            nevah(op);
            throw new Error("Unhandled migration type");
    }
}
async function addIndexFields(queryRunner: QueryRunner, migration: AddIndexFieldsMigration<string, { [prop: string]: IndexFieldMeta }>): Promise<void> {
    // TODO: populate index with existing values when created

    async function resolvePath(initialField: string, type: string, path: string[]): Promise<{ type: string, prop: string }> {
        if (path.length === 0) { throw new Error(`Empty index path for field '${ initialField }' on index '${ migration.index }'`); }

        const [next, ...remaining] = path;
        if (remaining.length === 0) { return { type, prop: next! }; }

        const refCol = await findReferenceColumn(queryRunner, type, next!);
        if (refCol === null) { throw new Error(`Ref property '${ next }' not found on '${ type }'`); }

        const nextTarget = refCol.replace(refColumnName(next!, ""), "");
        return resolvePath(initialField, nextTarget, remaining);
    }

    const indexMetaRes = await queryRunner.query(`SELECT "target_type" FROM "public"."index_meta" WHERE "name" = $1`, [migration.index]);
    const indexTargetType = atLeastOne(indexMetaRes.rows)[0].target_type;
    const indexTableName = indexTable(migration.index);

    for (const field of objectKeys(migration.fields)) {
        const def = migration.fields[field]!;
        if (def.operators.length === 0) { throw new Error(`Empty operators list for field '${ field }' on index '${ migration.index }'`); }

        const { type: targetType, prop: targetProp } = await resolvePath(field, indexTargetType, def.path);

        const dt = await columnDataType(queryRunner, targetType, targetProp);
        await queryRunner.query(pgFormat(`ALTER TABLE "public".%I ADD COLUMN %I ${ dt }`, [indexTableName, field]));


        const indices = map(groupBy(
            uniq(def.operators).map(op => ({ ...selectIndexType(op), op })),
            ({ index, opclass }) => `${ index }:${ opclass || "default" }`
        )).reduce((_indices, set) => {
            const one = atLeastOne(set)[0];
            return [..._indices, { index: one.index, opclass: one.opclass, operators: set.map(({ op }) => op) }];
        }, [] as { operators: KnownSearchConditionTypes[], index: string, opclass?: string }[]);

        for (const index of indices) {
            const indexHash = hash([indexTableName, ...sortBy(index.operators, identity)].join(":"), 20);
            if (index.opclass) {
                await queryRunner.query(pgFormat(`CREATE INDEX %I ON "public".%I USING ${ index.index } (%I ${ index.opclass })`, [`SEARCH_IDX_${ indexHash }`, indexTableName, field]));
            } else {
                await queryRunner.query(pgFormat(`CREATE INDEX %I ON "public".%I USING ${ index.index } (%I)`, [`SEARCH_IDX_${ indexHash }`, indexTableName, field]));
            }
        }
    }
}

async function removeIndexField(queryRunner: QueryRunner, migration: RemoveIndexFieldMigration<string, string>): Promise<void> {
    await queryRunner.query(pgFormat(`ALTER TABLE "public".%I DROP COLUMN %I`, [indexTable(migration.index), migration.field]));
}
