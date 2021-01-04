import {
    AddPrimitiveFieldsMigration, AddReferenceMigration,
    AddTypeMigration,
    Migration, RemoveFieldMigration,
    RemoveTypeMigration, RenameFieldMigration
} from "../../definition/migrations";
import { Boolean, Test } from "ts-toolbelt";
import { ApplyMigration, ApplyMigrations } from "./apply_migrations_api";
import { DatabaseMetadataRestriction, DatabaseMetadata, ReferenceMeta } from "./metadata";
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
    Test.check<ApplyMigration<{ t1: {}, t2: {} }, AddReferenceMigration<"t1", "ref", "t2">>, { t1: { ref: ReferenceMeta<"t2"> }, t2: {} }, Test.Pass>(),
    Test.check<ApplyMigration<{ t1: {}, t2: {} }, AddReferenceMigration<"t2", "ref", "t1">>, { t1: {}, t2: { ref: ReferenceMeta<"t1"> } }, Test.Pass>(),
    Test.check<ApplyMigration<{ t: { str: PrimitiveString } }, RenameFieldMigration<"t", "str", "prop">>, { t: { prop: PrimitiveString } }, Test.Pass>(),
    Test.check<ApplyMigration<{ t: { str: PrimitiveString } }, RemoveFieldMigration<"t", "str">>, { t: {} }, Test.Pass>(),
]);

// Check migrations applied as a set
Test.checks([
    Test.check<ApplyMigrations<{}, readonly []>, {}, Test.Pass>(),
    Test.check<ApplyMigrations<{}, readonly [
        AddTypeMigration<"t0">,
        AddPrimitiveFieldsMigration<"t0", { str: PrimitiveString, int: PrimitiveInt }>,

        AddTypeMigration<"t1">,
        AddPrimitiveFieldsMigration<"t1", { str: PrimitiveString, int: PrimitiveInt }>,
        AddPrimitiveFieldsMigration<"t1", { removeme: PrimitiveString, anotherStr: PrimitiveString }>,

        AddTypeMigration<"t2">,
        AddPrimitiveFieldsMigration<"t2", { prap: PrimitiveString }>,
        RenameFieldMigration<"t2", "prap", "prop">,

        AddReferenceMigration<"t2", "one", "t1">,
        AddReferenceMigration<"t2", "many", "t1">,

        RemoveFieldMigration<"t1", "removeme">,
        RemoveTypeMigration<"t0">
    ]>, {
        t1: { str: PrimitiveString, int: PrimitiveInt, anotherStr: PrimitiveString },
        t2: { prop: PrimitiveString, one: ReferenceMeta<"t1">, many: ReferenceMeta<"t1"> },
    }, Test.Pass>(),
]);
