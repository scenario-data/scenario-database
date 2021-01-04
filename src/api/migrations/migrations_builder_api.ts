import { Any, Iteration, List } from "ts-toolbelt";
import {
    AddPrimitiveFieldsMigration, AddReferenceMigration,
    AddTypeMigration,
    Migration, RemoveFieldMigration,
    RemoveTypeMigration, RenameFieldMigration
} from "../../definition/migrations";
import { ApplyMigrations, ApplyMigrationUnchecked } from "./apply_migrations_api";
import { DataPrimitive } from "../../definition/primitives";
import { DatabaseMetadata, ReferenceMeta } from "./metadata";

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

    done(): Migrations;
}



type EntityReferences<Etty> = { [P in keyof Etty]: Etty[P] extends ReferenceMeta<infer Tgt> ? Tgt : never }[keyof Etty];
type UniverseReferences<DB, Ignore extends string> = { [P in Exclude<keyof DB, Ignore>]: EntityReferences<DB[P]> }[Exclude<keyof DB, Ignore>];

type InternalType = "branch" | "user";
type InternalProperty = "id" | "at" | "branch" | "by" | "ts";

type FIELD_ALREADY_EXISTS = "*** Field already exists ***";
type FIELD_OVERRIDES_INTERNAL = "*** Field overrides internal property ***";

type TYPE_ALREADY_EXISTS = "*** Type already exists ***";
type TYPE_OVERRIDES_INTERNAL = "*** Overrides internal type ***";
type TYPE_REFERENCED = "*** Referenced by another type ***";

interface MigrationBuilderStepSafe<Iter extends Iteration.Iteration, Migrations extends Migration[], CurrentDB> {
    addType<Type extends string>(
        type: Any.Cast<
            Type,
              Type extends keyof CurrentDB ? TYPE_ALREADY_EXISTS
            : Type extends InternalType ? TYPE_OVERRIDES_INTERNAL
            : Type
        >
    ): ApplySafe<Iter, Migrations, CurrentDB, AddTypeMigration<Type>>;

    removeType<Type extends Extract<keyof CurrentDB, string>>(
        type: Any.Cast<Type, Type extends UniverseReferences<CurrentDB, Type> ? TYPE_REFERENCED : Type>
    ): ApplySafe<Iter, Migrations, CurrentDB, RemoveTypeMigration<Type>>;

    addPrimitives<
        Type extends Extract<keyof CurrentDB, string>,
        Fields extends { [prop: string]: DataPrimitive }
    >(
        type: Type,
        fields: Any.Cast<Fields, {
            [P in keyof Fields]:
                  P extends keyof CurrentDB[Type] ? FIELD_ALREADY_EXISTS
                : P extends InternalProperty ? FIELD_OVERRIDES_INTERNAL
                : Fields[P]
        }>
    ): ApplySafe<Iter, Migrations, CurrentDB, AddPrimitiveFieldsMigration<Type, Fields>>;

    addReference<
        Type extends Extract<keyof CurrentDB, string>,
        Field extends string,
        Target extends Extract<keyof CurrentDB, string>
    >(
        type: Type,
        field: Any.Cast<
            Field,
                Field extends keyof CurrentDB[Type] ? FIELD_ALREADY_EXISTS
              : Field extends InternalProperty ? FIELD_OVERRIDES_INTERNAL
              : Field
        >,
        target: Target
    ): ApplySafe<Iter, Migrations, CurrentDB, AddReferenceMigration<Type, Field, Target>>;

    renameField<
        Type extends Extract<keyof CurrentDB, string>,
        From extends Extract<keyof CurrentDB[Type], string>,
        To extends string
    >(
        type: Type,
        from: From,
        to: Any.Cast<To, To extends keyof CurrentDB[Type] ? FIELD_ALREADY_EXISTS : To>
    ): ApplySafe<Iter, Migrations, CurrentDB, RenameFieldMigration<Type, From, To>>;

    removeField<
        Type extends Extract<keyof CurrentDB, string>,
        Field extends Extract<keyof CurrentDB[Type], string>
    >(
        type: Type,
        field: Field
    ): ApplySafe<Iter, Migrations, CurrentDB, RemoveFieldMigration<Type, Field>>;

    done(): Migrations;
}

export type MigrationsApi<DB extends DatabaseMetadata, Migrations extends Migration[]> = MigrationBuilderStepSafe<Iteration.IterationOf<"0">, Migrations, ApplyMigrations<DB, Migrations>>;
