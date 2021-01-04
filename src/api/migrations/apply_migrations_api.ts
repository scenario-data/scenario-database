import { Object, List } from "ts-toolbelt";
import { DatabaseMetadata, ReferenceMeta } from "./metadata";
import {
    AddPrimitiveFieldsMigration, AddReferenceMigration,
    AddTypeMigration,
    Migration, RemoveFieldMigration,
    RemoveTypeMigration, RenameFieldMigration
} from "../../definition/migrations";


type DropFirst<T extends readonly unknown[]> = T extends readonly [any, ...infer Tail] ? Tail : [];
export type ApplyMigrationsUnchecked<Meta, Migrations extends readonly Migration[]> = {
    stop: Meta,
    proceed: ApplyMigrationsUnchecked<
        ApplyMigrationUnchecked<Meta, Migrations[0]>,
        DropFirst<Migrations>
    >,
}[List.Length<Migrations> extends 0 ? "stop" : "proceed"];

export type ApplyMigrations<Meta extends DatabaseMetadata, Migrations extends readonly Migration[]> = ApplyMigrationsUnchecked<Meta, Migrations>;


export type ApplyMigrationUnchecked<Meta, M extends Migration> = Meta extends DatabaseMetadata ? (
      M extends AddTypeMigration<any> ? ApplyAddType<Meta, M>
    : M extends RemoveTypeMigration<any> ? ApplyRemoveType<Meta, M>
    : M extends AddPrimitiveFieldsMigration<any, any> ? ApplyAddPrimitiveFields<Meta, M>
    : M extends AddReferenceMigration<any, any, any> ? ApplyAddReference<Meta, M>
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

type ApplyAddReference<Meta extends DatabaseMetadata, M> = M extends AddReferenceMigration<infer Type, infer Field, infer Target> ? (
    Object.P.Merge<Meta, [Type], { [F in Field]: ReferenceMeta<Target> }>
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
