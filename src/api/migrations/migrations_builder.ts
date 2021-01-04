import { DatabaseMetadataRestriction } from "./metadata";
import { MigrationsApi } from "./migrations_builder_api";
import {
    AddPrimitiveFieldsMigration, AddReferenceMigration,
    AddTypeMigration,
    Migration, RemoveFieldMigration,
    RemoveTypeMigration, RenameFieldMigration
} from "../../definition/migrations";

export function migrate<DB extends DatabaseMetadataRestriction<DB>>(_prevDefinition: DB): MigrationsApi<DB, []> {
    const migrations: Migration[] = [];
    const createApiMethod = <K extends keyof MigrationsApi<any, any> = never, M extends Migration = never>(creator: (...params: Parameters<MigrationsApi<any, any>[K]>) => M) => {
        return function(this: MigrationsApi<any, any>, ...params: any[]): any {
            migrations.push((creator as any)(...params));
            return this;
        };
    };

    const api: MigrationsApi<any, any> = {
        addType: createApiMethod<"addType", AddTypeMigration<any>>(type => ({ action: "addType", type })),
        removeType: createApiMethod<"removeType", RemoveTypeMigration<any>>(type => ({ action: "removeType", type })),

        addPrimitives: createApiMethod<"addPrimitives", AddPrimitiveFieldsMigration<any, any>>((type, fields) => ({ action: "addPrimitiveFields", type, fields })),
        addReference: createApiMethod<"addReference", AddReferenceMigration<any, any, any>>((type, field, target) => ({ action: "addReference", type, field, target })),

        renameField: createApiMethod<"renameField", RenameFieldMigration<any, any, any>>((type, from, to) => ({ action: "renameField", type, from, to })),
        removeField: createApiMethod<"removeField", RemoveFieldMigration<any, any>>((type, field) => ({ action: "removeField", type, field })),

        done() {
            return [...migrations];
        },
    };

    return api as any;
}
