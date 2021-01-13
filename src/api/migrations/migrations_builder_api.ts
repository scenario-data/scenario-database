import { Any, Iteration, List } from "ts-toolbelt";
import {
    AddIndexFieldsMigration,
    AddIndexMigration,
    AddPrimitiveFieldsMigration, AddReferenceMigration,
    AddTypeMigration,
    Migration, RemoveFieldMigration, RemoveIndexFieldMigration, RemoveIndexMigration,
    RemoveTypeMigration, RenameFieldMigration
} from "../../definition/migrations";
import { ApplyMigrations, ApplyMigrationUnchecked } from "./apply_migrations_api";
import { DataPrimitive } from "../../definition/primitives";
import { DatabaseMetadata, IndexFieldMeta, IndexMetadata, ReferenceMeta } from "./metadata";


export type IndexTablePrefix = `index_`;
export type IndexName<Index extends string> = `${ IndexTablePrefix }${ Index }`;
type IndexKeys<DB> = (keyof DB) extends (infer K) ? K extends IndexName<infer Index> ? Index : never : never;

type ApplySafe<Iter extends Iteration.Iteration, Migrations extends Migration[], CurrentDB, Next extends Migration> = {
    safe: MigrationBuilderStepSafe<Iteration.Next<Iter>, List.Append<Migrations, Next>, ApplyMigrationUnchecked<CurrentDB, Next>>,
    unsafe: MigrationBuilderStepUnsafe<List.Append<Migrations, Next>>,
}[Iter extends Iteration.IterationOf<"30"> ? "unsafe" : "safe"];

interface MigrationBuilderStepUnsafe<Migrations extends Migration[]> {
    addType<Type extends string>(type: Type): MigrationBuilderStepUnsafe<List.Append<Migrations, AddTypeMigration<Type>>>;

    removeType<Type extends string>(type: Type): MigrationBuilderStepUnsafe<List.Append<Migrations, RemoveTypeMigration<Type>>>;

    addPrimitives<
        Type extends string,
        Fields extends { [prop: string]: DataPrimitive }
    >(
        type: Type,
        fields: Fields
    ): MigrationBuilderStepUnsafe<List.Append<Migrations, AddPrimitiveFieldsMigration<Type, Fields>>>;

    addReference<
        Type extends string,
        Field extends string,
        Target extends string
    >(
        type: Type,
        field: Field,
        target: Target
    ): MigrationBuilderStepUnsafe<List.Append<Migrations, AddReferenceMigration<Type, Field, Target>>>;

    renameField<
        Type extends string,
        From extends string,
        To extends string
    >(
        type: Type,
        from: From,
        to: To
    ): MigrationBuilderStepUnsafe<List.Append<Migrations, RenameFieldMigration<Type, From, To>>>;

    removeField<
        Type extends string,
        Field extends string
    >(
        type: Type,
        field: Field
    ): MigrationBuilderStepUnsafe<List.Append<Migrations, RemoveFieldMigration<Type, Field>>>;


    addIndex<
        Type extends string,
        Index extends IndexName<string>
    >(
        type: Type,
        index: Index
    ): MigrationBuilderStepUnsafe<List.Append<Migrations, AddIndexMigration<Index, Type>>>;

    removeIndex<
        Index extends IndexName<string>
    >(
        index: Index
    ): MigrationBuilderStepUnsafe<List.Append<Migrations, RemoveIndexMigration<Index>>>;

    addIndexFields<
        Index extends IndexName<string>,
        Fields extends { [prop: string]: IndexFieldMeta }
    >(
        index: Index,
        field: Fields
    ): MigrationBuilderStepUnsafe<List.Append<Migrations, AddIndexFieldsMigration<Index, Fields>>>;

    removeIndexField<
        Index extends IndexName<string>,
        Field extends string
    >(
        index: Index,
        field: Field
    ): MigrationBuilderStepUnsafe<List.Append<Migrations, RemoveIndexFieldMigration<Index, Field>>>;


    done(): Migrations;
}



type EntityReferences<Etty> = { [P in keyof Etty]: Etty[P] extends ReferenceMeta<infer Tgt> ? Tgt : never }[keyof Etty];
type UniverseReferences<DB, Ignore extends string> = { [P in Exclude<keyof DB, Ignore>]: EntityReferences<DB[P]> }[Exclude<keyof DB, Ignore>];

type UniverseIndexRefs<DB> = { [P in keyof DB]: DB[P] extends IndexMetadata<infer Tgt> ? Tgt : never }[keyof DB];

type InternalType = "branch" | "user";
type InternalIndex = "meta";
export type InternalEntityProp = "id" | "at" | "branch" | "by" | "ts";
export type InternalIndexProp = "id" | "branch";

type FIELD_ALREADY_EXISTS = "*** Field already exists ***";
type FIELD_OVERRIDES_INTERNAL = "*** Field overrides internal property ***";

type TYPE_ALREADY_EXISTS = "*** Type already exists ***";
type TYPE_OVERRIDES_INTERNAL = "*** Overrides internal type ***";
type TYPE_IS_INDEX = "*** Indices should be created with `addIndex` ***";
type TYPE_REFERENCED = "*** Referenced by another type ***";
type TYPE_INDEXED = "*** Referenced by an index ***";

type INDEX_ALREADY_EXISTS = "*** Index already exists ***";
type INDEX_OVERRIDES_INTERNAL = "*** Overrides internal table ***";

interface MigrationBuilderStepSafe<Iter extends Iteration.Iteration, Migrations extends Migration[], CurrentDB> {
    addType<Type extends string>(
        type: Any.Cast<
            Type,
              Type extends IndexName<string> ? TYPE_IS_INDEX
            : Type extends keyof CurrentDB ? TYPE_ALREADY_EXISTS
            : Type extends InternalType ? TYPE_OVERRIDES_INTERNAL
            : Type
        >
    ): ApplySafe<Iter, Migrations, CurrentDB, AddTypeMigration<Type>>;

    removeType<Type extends Exclude<Extract<keyof CurrentDB, string>, IndexName<string>>>(
        type: Any.Cast<
            Type,
              Type extends UniverseReferences<CurrentDB, Type> ? TYPE_REFERENCED
            : Type extends UniverseIndexRefs<CurrentDB> ? TYPE_INDEXED
            : Type
        >
    ): ApplySafe<Iter, Migrations, CurrentDB, RemoveTypeMigration<Type>>;

    addPrimitives<
        Type extends Exclude<Extract<keyof CurrentDB, string>, IndexName<string>>,
        Fields extends { [prop: string]: DataPrimitive }
    >(
        type: Type,
        fields: Any.Cast<Fields, {
            [P in keyof Fields]:
                  P extends keyof CurrentDB[Type] ? FIELD_ALREADY_EXISTS
                : P extends InternalEntityProp ? FIELD_OVERRIDES_INTERNAL
                : Fields[P]
        }>
    ): ApplySafe<Iter, Migrations, CurrentDB, AddPrimitiveFieldsMigration<Type, Fields>>;

    addReference<
        Type extends Exclude<Extract<keyof CurrentDB, string>, IndexName<string>>,
        Field extends string,
        Target extends Exclude<Extract<keyof CurrentDB, string>, IndexName<string>>
    >(
        type: Type,
        field: Any.Cast<
            Field,
                Field extends keyof CurrentDB[Type] ? FIELD_ALREADY_EXISTS
              : Field extends InternalEntityProp ? FIELD_OVERRIDES_INTERNAL
              : Field
        >,
        target: Target
    ): ApplySafe<Iter, Migrations, CurrentDB, AddReferenceMigration<Type, Field, Target>>;

    renameField<
        Type extends Exclude<Extract<keyof CurrentDB, string>, IndexName<string>>,
        From extends Extract<keyof CurrentDB[Type], string>,
        To extends string
    >(
        type: Type,
        from: From,
        to: Any.Cast<To, To extends keyof CurrentDB[Type] ? FIELD_ALREADY_EXISTS : To>
    ): ApplySafe<Iter, Migrations, CurrentDB, RenameFieldMigration<Type, From, To>>;

    removeField<
        Type extends Exclude<Extract<keyof CurrentDB, string>, IndexName<string>>,
        Field extends Extract<keyof CurrentDB[Type], string>
    >(
        type: Type,
        field: Field
    ): ApplySafe<Iter, Migrations, CurrentDB, RemoveFieldMigration<Type, Field>>;


    addIndex<
        Type extends Exclude<Extract<keyof CurrentDB, string>, IndexName<string>>,
        Index extends string
    >(
        type: Type,
        index: Any.Cast<
            Index,
              Index extends IndexKeys<CurrentDB> ? INDEX_ALREADY_EXISTS
            : Index extends InternalIndex ? INDEX_OVERRIDES_INTERNAL
            : Index
        >
    ): ApplySafe<Iter, Migrations, CurrentDB, AddIndexMigration<Index, Type>>;

    removeIndex<
        Index extends IndexKeys<CurrentDB>
    >(
        index: Index
    ): ApplySafe<Iter, Migrations, CurrentDB, RemoveIndexMigration<Index>>;

    addIndexFields<
        Index extends IndexKeys<CurrentDB>,
        Fields extends { [prop: string]: IndexFieldMeta } // TODO: better type safety around paths and operators
    >(
        index: Index,
        fields: Any.Cast<Fields, CurrentDB[IndexName<Index>] extends IndexMetadata<string> ? {
            [P in keyof Fields]:
                  P extends keyof CurrentDB[IndexName<Index>]["fields"] ? FIELD_ALREADY_EXISTS
                : P extends InternalIndexProp ? FIELD_OVERRIDES_INTERNAL
                : Fields[P]
        } : never>
    ): ApplySafe<Iter, Migrations, CurrentDB, AddIndexFieldsMigration<Index, Fields>>;

    removeIndexField<
        Index extends IndexKeys<CurrentDB>,
        Field extends (CurrentDB[IndexName<Index>] extends IndexMetadata<string> ? Extract<keyof CurrentDB[IndexName<Index>]["fields"], string> : never)
    >(
        index: Index,
        field: Field
    ): ApplySafe<Iter, Migrations, CurrentDB, RemoveIndexFieldMigration<Index, Field>>;


    done(): Migrations;
}

export type MigrationsApi<DB extends DatabaseMetadata, Migrations extends Migration[]> = MigrationBuilderStepSafe<Iteration.IterationOf<"0">, Migrations, ApplyMigrations<DB, Migrations>>;
