import { Object } from "ts-toolbelt";
import { DatabaseMetadata, RelationMeta } from "./metadata";
import {
    AddPrimitiveFieldsMigration, AddRelationMigration,
    AddTypeMigration,
    Migration, RemoveFieldMigration,
    RemoveTypeMigration, RenameFieldMigration
} from "../../definition/migrations";


type DropFirst<T extends readonly unknown[]> = T extends [any, ...infer U] ? U : [];
export type ApplyMigrationsUnchecked<Meta, Migrations extends readonly Migration[]> = {
    stop: Meta,
    proceed: ApplyMigrationsUnchecked<
        ApplyMigrationUnchecked<Meta, Migrations[0]>,
        DropFirst<Migrations>
    >,
}[Migrations extends [] ? "stop" : "proceed"];

export type ApplyMigrations<Meta extends DatabaseMetadata, Migrations extends readonly Migration[]> = ApplyMigrationsUnchecked<Meta, Migrations>;


export type ApplyMigrationUnchecked<Meta, M extends Migration> = Meta extends DatabaseMetadata ? (
      M extends AddTypeMigration<any> ? ApplyAddType<Meta, M>
    : M extends RemoveTypeMigration<any> ? ApplyRemoveType<Meta, M>
    : M extends AddPrimitiveFieldsMigration<any, any> ? ApplyAddPrimitiveFields<Meta, M>
    : M extends AddRelationMigration<any, any, any, any> ? ApplyAddRelation<Meta, M>
    : M extends RenameFieldMigration<any, any, any> ? ApplyRenameField<Meta, M>
    : M extends RemoveFieldMigration<any, any> ? ApplyRemoveField<Meta, M>
    : never
) : never;

export type ApplyMigration<Meta extends DatabaseMetadata, M extends Migration> = ApplyMigrationUnchecked<Meta, M>;



type ApplyAddType<Meta extends DatabaseMetadata, M> = M extends AddTypeMigration<infer T> ? (
    Meta & { [P in T]: {} }
) : never;

type ApplyRemoveType<Meta extends DatabaseMetadata, M> = M extends RemoveTypeMigration<infer T> ? (
    Omit<Meta, T>
) : never;

type ApplyAddPrimitiveFields<Meta extends DatabaseMetadata, M> = M extends AddPrimitiveFieldsMigration<infer Type, infer Fields> ? (
    Object.P.Merge<Meta, [Type], Fields>
) : never;

type ApplyAddRelation<Meta extends DatabaseMetadata, M> = M extends AddRelationMigration<infer Type, infer Field, infer Target, infer RelType> ? (
    Object.P.Merge<Meta, [Type], { [F in Field]: RelationMeta<Target, RelType> }>
) : never;

type ApplyRenameField<Meta extends DatabaseMetadata, M> = M extends RenameFieldMigration<infer Type, infer From, infer To> ? (
    Object.P.Merge<
        Object.P.Omit<Meta, [Type, From]>,
        [Type], { [F in To]: Meta[Type][From] }
    >
) : never;

type ApplyRemoveField<Meta extends DatabaseMetadata, M> = M extends RemoveFieldMigration<infer Type, infer Field> ? (
    Object.P.Omit<Meta, [Type, Field]>
) : never;
