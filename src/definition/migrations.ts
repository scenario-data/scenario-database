import { DataPrimitive } from "./primitives";

export type Migration = AddTypeMigration<string> | RemoveTypeMigration<string>
    | AddPrimitiveFieldsMigration<string, { [prop: string]: DataPrimitive }>
    | AddReferenceMigration<string, string, string>
    | RenameFieldMigration<string, string, string> | RemoveFieldMigration<string, string>;

export type AddTypeMigration<Type extends string> = { action: "addType", type: Type };
export type RemoveTypeMigration<Type extends string> = { action: "removeType", type: Type };
export type AddPrimitiveFieldsMigration<Type extends string, Fields extends { [prop: string]: DataPrimitive }> = { action: "addPrimitiveFields", type: Type, fields: Fields };

export type AddReferenceMigration<Type extends string, Field extends string, Target extends string> = { action: "addReference", type: Type, field: Field, target: Target };

export type RenameFieldMigration<Type extends string, From extends string, To extends string> = { action: "renameField", type: Type, from: From, to: To };
export type RemoveFieldMigration<Type extends string, Field extends string> = { action: "removeField", type: Type, field: Field };
