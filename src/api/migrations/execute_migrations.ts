import { QueryRunner } from "../query_runner/query_runner_api";
import {
    AddPrimitiveFieldsMigration, AddReferenceMigration,
    AddTypeMigration,
    Migration, RemoveFieldMigration,
    RemoveTypeMigration, RenameFieldMigration
} from "../../definition/migrations";
import { nevah, objectKeys } from "../../misc/typeguards";
import { hash } from "../../misc/hash";
import { DataPrimitive, isDataPrimitive } from "../../definition/primitives";
import { InternalFKPrimitive } from "../fetch_types/internal_foreign_keys";
import { pgFormat } from "../../misc/pg_format";
import { findColumnsContainingString, tableExists } from "./database_meta_util";


export async function executeMigrations(queryRunner: QueryRunner, migrations: readonly Migration[]) {
    for (const migration of migrations) {
        switch (migration.action) {
            case "addType":
                await addType(queryRunner, migration);
                break;

            case "removeType":
                await removeType(queryRunner, migration);
                break;

            case "addPrimitiveFields":
                await addPrimitiveFields(queryRunner, migration);
                break;

            case "addReference":
                await addReference(queryRunner, migration);
                break;

            case "removeField":
                await removeField(queryRunner, migration);
                break;

            case "renameField":
                await renameField(queryRunner, migration);
                break;

            /* istanbul ignore next */
            default:
                nevah(migration);
                throw new Error("Unhandled migration type");
        }
    }
}

export async function prepare(queryRunner: QueryRunner) {
    // Create version sequence
    await queryRunner.query(`CREATE SEQUENCE "edit_version_seq" INCREMENT BY 1 NO MAXVALUE START WITH 1 NO CYCLE OWNED BY NONE;`);


    // Create user table
    await queryRunner.query(`CREATE TABLE "public"."user" (
        "id" SERIAL NOT NULL,
        "ts" TIMESTAMP without time zone NOT NULL DEFAULT now(),
        "parent" INT,

        CONSTRAINT "PK_USER_ID" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(pgFormat(`ALTER TABLE "public"."user" ADD CONSTRAINT %I FOREIGN KEY ("parent") REFERENCES "public"."user"("id")`, [`FK_USER_PARENT`]));

    // Add root and anonymous users
    await queryRunner.query(`INSERT INTO "public"."user" ("id") VALUES (DEFAULT), (DEFAULT)`);


    // Add branches table
    await queryRunner.query(`CREATE TABLE "public"."branch" (
        "id" SERIAL NOT NULL,
        "start_version" INT NOT NULL,
        "parent" INT,
        "ts" TIMESTAMP without time zone NOT NULL DEFAULT now(),
        "by" INT NOT NULL,

        CONSTRAINT "PK_BRANCH_ID" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(pgFormat(`ALTER TABLE "public"."branch" ADD CONSTRAINT %I FOREIGN KEY ("parent") REFERENCES "public"."branch"("id")`, [`FK_BRANCH_PARENT`]));
    await queryRunner.query(pgFormat(`ALTER TABLE "public"."branch" ADD CONSTRAINT %I FOREIGN KEY ("by") REFERENCES "public"."user"("id")`, [`FK_BRANCH_OWNER`]));
    await queryRunner.query(`CREATE INDEX "BRANCH_ID" ON "public"."branch" ("id")`);
    await queryRunner.query(`CREATE INDEX "BRANCH_PARENT" ON "public"."branch" ("parent")`);

    // Insert master and meta branches, both without parents and owned by root
    await queryRunner.query(`INSERT INTO "public"."branch" ("start_version", "by") VALUES (nextval('edit_version_seq'::regclass), 1), (nextval('edit_version_seq'::regclass), 1)`);
}

/*
CREATE TABLE "public"."test" ("id" SERIAL NOT NULL);
 */

async function addType(queryRunner: QueryRunner, migration: AddTypeMigration<string>): Promise<void> {
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

export const refSuffix = (target: string) => `ref_${ target }`;
export const refColumnName = (field: string, target: string) => `${ field }_${ refSuffix(target) }`;

async function removeType(queryRunner: QueryRunner, migration: RemoveTypeMigration<string>): Promise<void> {
    const references = await findColumnsContainingString(queryRunner, refSuffix(migration.type));
    const externalReferences = references.filter(({ table_name }) => table_name !== migration.type);

    if (externalReferences.length > 0) { throw new Error(`Type ${ migration.type } is referenced by: ${ JSON.stringify(externalReferences) }`); }
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

        /* istanbul ignore next */
        default:
            nevah(p);
            throw new Error("Unhandled primitive type");
    }
}
async function addPrimitiveFields(queryRunner: QueryRunner, migration: AddPrimitiveFieldsMigration<string, { [prop: string]: DataPrimitive }>): Promise<void> {
    for (const field of objectKeys(migration.fields)) {
        const primitive = migration.fields[field]!;
        if (!isDataPrimitive(primitive)) { throw new Error(`Expected a data primitive, got ${ JSON.stringify(primitive) }`); }

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

                /* istanbul ignore next */
                default:
                    nevah(primitiveType);
                    throw new Error("Unhandled internal fk type");
            }
        }
    }
}

async function addReference(queryRunner: QueryRunner, migration: AddReferenceMigration<string, string, string>): Promise<void> {
    if (!(await tableExists(queryRunner, migration.target))) { throw new Error(`Unknown target type: ${ migration.target }`); }
    await queryRunner.query(pgFormat(`ALTER TABLE "public".%I ADD COLUMN %I INT`, [migration.type, refColumnName(migration.field, migration.target)]));
}

async function removeField(queryRunner: QueryRunner, migration: RemoveFieldMigration<string, string>): Promise<void> {
    await queryRunner.query(pgFormat(`ALTER TABLE "public".%I DROP COLUMN %I`, [migration.type, migration.field]));
}

async function renameField(queryRunner: QueryRunner, migration: RenameFieldMigration<string, string, string>): Promise<void> {
    await queryRunner.query(pgFormat(`ALTER TABLE "public".%I RENAME COLUMN %I TO %I`, [migration.type, migration.from, migration.to]));
}

