import { DataPrimitive } from "./primitives";
import { IndexFieldMeta } from "../api/migrations/metadata";

export type Migration = AddTypeMigration<string> | RemoveTypeMigration<string>
    | AddPrimitiveFieldsMigration<string, { [prop: string]: DataPrimitive }>
    | AddReferenceMigration<string, string, string>
    | RenameFieldMigration<string, string, string> | RemoveFieldMigration<string, string>
    | AddIndexMigration<string, string> | RemoveIndexMigration<string>
    | AddIndexFieldsMigration<string, { [prop: string]: IndexFieldMeta }> | RemoveIndexFieldMigration<string, string>;

export type AddTypeMigration<Type extends string> = { action: "addType", type: Type };
export type RemoveTypeMigration<Type extends string> = { action: "removeType", type: Type };
export type AddPrimitiveFieldsMigration<Type extends string, Fields extends { [prop: string]: DataPrimitive }> = { action: "addPrimitiveFields", type: Type, fields: Fields };

export type AddReferenceMigration<Type extends string, Field extends string, Target extends string> = { action: "addReference", type: Type, field: Field, target: Target };

export type RenameFieldMigration<Type extends string, From extends string, To extends string> = { action: "renameField", type: Type, from: From, to: To };
export type RemoveFieldMigration<Type extends string, Field extends string> = { action: "removeField", type: Type, field: Field };

export type AddIndexMigration<Index extends string, Type extends string> = { action: "addIndex", name: Index, type: Type };
export type RemoveIndexMigration<Index extends string> = { action: "removeIndex", index: Index };

export type AddIndexFieldsMigration<Index extends string, Fields extends { [prop: string]: IndexFieldMeta }> = { action: "addIndexFields", index: Index, fields: Fields };
export type RemoveIndexFieldMigration<Index extends string, Field extends string> = { action: "removeIndexField", index: Index, field: Field };
