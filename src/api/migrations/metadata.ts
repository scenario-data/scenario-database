import { DataPrimitive } from "../../definition/primitives";
import { HasOne } from "../../definition/references";


export type ReferenceMeta<Target extends string> = { reference_target: Target };

export type PropertyMetadata = DataPrimitive | ReferenceMeta<string>;
export type EntityMetadata = { [prop: string]: PropertyMetadata };
export type DatabaseMetadata = { [type: string]: EntityMetadata };

export type EntityMetadataRestriction<T extends EntityMetadata> = { [P in keyof T]: T[P] extends PropertyMetadata ? T[P] : never };
export type DatabaseMetadataRestriction<T extends DatabaseMetadata> = { [P in keyof T]: T[P] extends EntityMetadataRestriction<T[P]> ? T[P] : never };

export type EntityDefInstanceFromMeta<DB extends DatabaseMetadata & DatabaseMetadataRestriction<DB>, T extends keyof DB> = {
    [P in keyof DB[T]]:
        DB[T][P] extends ReferenceMeta<infer Target>
            ? HasOne<EntityDefInstanceFromMeta<DB, Target>>
            : DB[T][P];
};
