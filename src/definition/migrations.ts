import { DataPrimitive } from "./primitives";

export type Migration = AddTypeMigration<any> | RemoveTypeMigration<any>
    | AddPrimitiveFieldsMigration<any, any>
    | AddRelationMigration<any, any, any, any>
    | RenameFieldMigration<any, any, any> | RemoveFieldMigration<any, any>;

export type AddTypeMigration<Type extends string> = { action: "addType", type: Type };
export type RemoveTypeMigration<Type extends string> = { action: "removeType", type: Type };
export type AddPrimitiveFieldsMigration<Type extends string, Fields extends { [prop: string]: DataPrimitive }> = { action: "addPrimitiveFields", type: Type, fields: Fields };

export type RelationType = "one-to-one" | "many-to-one";
export type AddRelationMigration<Type extends string, Field extends string, Target extends string, RelType extends RelationType> = { action: "addRelation", type: Type, field: Field, target: Target, relType: RelType };

export type RenameFieldMigration<Type extends string, From extends string, To extends string> = { action: "renameField", type: Type, from: From, to: To };
export type RemoveFieldMigration<Type extends string, Field extends string> = { action: "removeField", type: Type, field: Field };
