import {
    AddPrimitiveFieldsMigration, AddRelationMigration,
    AddTypeMigration,
    Migration, RemoveFieldMigration,
    RemoveTypeMigration, RenameFieldMigration
} from "../../definition/migrations";
import { Boolean, Test } from "ts-toolbelt";
import { ApplyMigration, ApplyMigrations } from "./apply_migrations_api";
import { DatabaseMetadataRestriction, DatabaseMetadata, RelationMeta } from "./metadata";
import { PrimitiveInt, PrimitiveString } from "../../definition/primitives";


type CheckEveryMigrationApplied<M extends Migration> = M extends M ? [ApplyMigration<{}, M>] extends [never] ? Boolean.False : Boolean.True : never;
declare const everyMigrationApplied: CheckEveryMigrationApplied<Migration>;
Test.checks([everyMigrationApplied]);

type IsDatabaseMeta<M> = M extends DatabaseMetadata ? M extends DatabaseMetadataRestriction<M> ? Boolean.True : Boolean.False : Boolean.False;
type CheckMigrationsProduceDatabaseMeta<M extends Migration> = M extends M ? IsDatabaseMeta<ApplyMigration<{}, M>> : never;
declare const migrationsProduceDatabaseMeta: CheckMigrationsProduceDatabaseMeta<Migration>;
Test.checks([migrationsProduceDatabaseMeta]);


// Check individual migrations
Test.checks([
    Test.check<ApplyMigration<{}, AddTypeMigration<"newType">>, { newType: {} }, Test.Pass>(),
    Test.check<ApplyMigration<{ someType: {} }, RemoveTypeMigration<"someType">>, {}, Test.Pass>(),
    Test.check<ApplyMigration<{ t: {} }, AddPrimitiveFieldsMigration<"t", { str: PrimitiveString, int: PrimitiveInt }>>, { t: { str: PrimitiveString, int: PrimitiveInt } }, Test.Pass>(),
    Test.check<ApplyMigration<{ t1: {}, t2: {} }, AddRelationMigration<"t1", "rel", "t2", "one-to-one">>, { t1: { rel: RelationMeta<"t2", "one-to-one"> }, t2: {} }, Test.Pass>(),
    Test.check<ApplyMigration<{ t1: {}, t2: {} }, AddRelationMigration<"t2", "rel", "t1", "many-to-one">>, { t1: {}, t2: { rel: RelationMeta<"t1", "many-to-one"> } }, Test.Pass>(),
    Test.check<ApplyMigration<{ t: { str: PrimitiveString } }, RenameFieldMigration<"t", "str", "prop">>, { t: { prop: PrimitiveString } }, Test.Pass>(),
    Test.check<ApplyMigration<{ t: { str: PrimitiveString } }, RemoveFieldMigration<"t", "str">>, { t: {} }, Test.Pass>(),
]);

// Check migrations applied as a set
Test.checks([
    Test.check<ApplyMigrations<{}, []>, {}, Test.Pass>(),
    Test.check<ApplyMigrations<{}, [
        AddTypeMigration<"t0">,
        AddPrimitiveFieldsMigration<"t0", { str: PrimitiveString, int: PrimitiveInt }>,

        AddTypeMigration<"t1">,
        AddPrimitiveFieldsMigration<"t1", { str: PrimitiveString, int: PrimitiveInt }>,
        AddPrimitiveFieldsMigration<"t1", { removeme: PrimitiveString, anotherStr: PrimitiveString }>,

        AddTypeMigration<"t2">,
        AddPrimitiveFieldsMigration<"t2", { prap: PrimitiveString }>,
        RenameFieldMigration<"t2", "prap", "prop">,

        AddRelationMigration<"t2", "one", "t1", "one-to-one">,
        AddRelationMigration<"t2", "many", "t1", "many-to-one">,

        RemoveFieldMigration<"t1", "removeme">,
        RemoveTypeMigration<"t0">
    ]>, {
        t1: { str: PrimitiveString, int: PrimitiveInt, anotherStr: PrimitiveString },
        t2: { prop: PrimitiveString, one: RelationMeta<"t1", "one-to-one">, many: RelationMeta<"t1", "many-to-one"> },
    }, Test.Pass>(),
]);
