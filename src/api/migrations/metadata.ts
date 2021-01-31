import { DataPrimitive } from "../../definition/primitives";
import { KnownSearchConditionTypes } from "../../definition/index/search_conditions";
import { IndexName } from "./migrations_builder_api";
import { AtLeastOne } from "../../misc/typeguards";


export type ReferenceMeta<Target extends string> = { reference_target: Target };

export type PropertyMetadata = DataPrimitive | ReferenceMeta<string>;
export type EntityMetadata = { [prop: string]: PropertyMetadata };

export type IndexFieldMeta = { path: AtLeastOne<string>; conditions: AtLeastOne<KnownSearchConditionTypes>; };
export type IndexMetadata<Target extends string> = { type: Target, fields: { [prop: string]: IndexFieldMeta } };

export type DatabaseMetadata = { [type: string]: EntityMetadata | IndexMetadata<string> };

export type EntityMetadataRestriction<T extends EntityMetadata> = { [P in keyof T]: T[P] extends PropertyMetadata ? T[P] : never };

type IndexFieldsRestriction<T> = { [P in keyof T]: T[P] extends IndexFieldMeta ? T[P] : never };
export type IndexMetadataRestriction<T extends IndexMetadata<string>> = T["fields"] extends IndexFieldsRestriction<T["fields"]> ? T : never;

export type DatabaseMetadataRestriction<T> = {
    [P in keyof T]:
          T[P] extends IndexMetadata<string> ? (
            T[P] extends IndexMetadataRestriction<T[P]> ? (P extends IndexName<string> ? T[P] : never) : never
        )
        : T[P] extends EntityMetadata ? (
            T[P] extends EntityMetadataRestriction<T[P]> ? (P extends IndexName<string> ? never : T[P]) : never
        )
        : never
};
