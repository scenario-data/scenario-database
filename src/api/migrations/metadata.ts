import { DataPrimitive } from "../../definition/primitives";
import { RelationType } from "../../definition/migrations";

export type RelationMeta<Target extends string, RelType extends RelationType> = { relation_type: RelType, target: Target };

export type PropertyMetadata = DataPrimitive | RelationMeta<string, RelationType>;
export type EntityMetadata = { [prop: string]: PropertyMetadata };
export type DatabaseMetadata = { [type: string]: EntityMetadata };

export type EntityMetadataRestriction<T extends EntityMetadata> = { [P in keyof T]: T[P] extends PropertyMetadata ? T[P] : never };
export type DatabaseMetadataRestriction<T extends DatabaseMetadata> = { [P in keyof T]: T[P] extends EntityMetadataRestriction<T[P]> ? T[P] : never };
