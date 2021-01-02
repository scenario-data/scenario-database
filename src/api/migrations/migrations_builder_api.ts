import { Any, Iteration, List } from "ts-toolbelt";
import {
    AddPrimitiveFieldsMigration, AddRelationMigration,
    AddTypeMigration,
    Migration, RelationType, RemoveFieldMigration,
    RemoveTypeMigration, RenameFieldMigration
} from "../../definition/migrations";
import { ApplyMigrations, ApplyMigrationUnchecked } from "./apply_migrations";
import { DataPrimitive } from "../../definition/primitives";
import { DatabaseMetadata } from "./metadata";

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

    addRelation<
        Type extends string,
        Field extends string,
        Target extends string,
        RelType extends RelationType
    >(
        type: Type,
        field: Field,
        target: Target,
        relType: RelType
    ): MigrationBuilderStepUnsafe<List.Append<Migrations, AddRelationMigration<Type, Field, Target, RelType>>>;

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

    done(): readonly [...Migrations];
}


interface MigrationBuilderStepSafe<Iter extends Iteration.Iteration, Migrations extends Migration[], CurrentDB> {
    addType<Type extends string>(type: Any.Cast<Type, Type extends keyof CurrentDB ? never : Type>): ApplySafe<Iter, Migrations, CurrentDB, AddTypeMigration<Type>>;

    removeType<Type extends Extract<keyof CurrentDB, string>>(type: Type): ApplySafe<Iter, Migrations, CurrentDB, RemoveTypeMigration<Type>>;

    addPrimitives<
        Type extends Extract<keyof CurrentDB, string>,
        Fields extends { [prop: string]: DataPrimitive }
    >(
        type: Type,
        fields: Any.Cast<Fields, { [P in keyof Fields]: P extends keyof CurrentDB[Type] ? never : Fields[P] }>
    ): ApplySafe<Iter, Migrations, CurrentDB, AddPrimitiveFieldsMigration<Type, Fields>>;

    addRelation<
        Type extends Extract<keyof CurrentDB, string>,
        Field extends string,
        Target extends Extract<keyof CurrentDB, string>,
        RelType extends RelationType
    >(
        type: Type,
        field: Any.Cast<Field, Field extends keyof CurrentDB[Type] ? never : Field>,
        target: Target,
        relType: RelType
    ): ApplySafe<Iter, Migrations, CurrentDB, AddRelationMigration<Type, Field, Target, RelType>>;

    renameField<
        Type extends Extract<keyof CurrentDB, string>,
        From extends Extract<keyof CurrentDB[Type], string>,
        To extends string
    >(
        type: Type,
        from: From,
        to: Any.Cast<To, To extends keyof CurrentDB[Type] ? never : To>
    ): ApplySafe<Iter, Migrations, CurrentDB, RenameFieldMigration<Type, From, To>>;

    removeField<
        Type extends Extract<keyof CurrentDB, string>,
        Field extends Extract<keyof CurrentDB[Type], string>
    >(
        type: Type,
        field: Field
    ): ApplySafe<Iter, Migrations, CurrentDB, RemoveFieldMigration<Type, Field>>;

    done(): readonly [...Migrations];
}

export type MigrationsApi<DB extends DatabaseMetadata, Migrations extends Migration[]> = MigrationBuilderStepSafe<Iteration.IterationOf<"0">, Migrations, ApplyMigrations<DB, Migrations>>;
