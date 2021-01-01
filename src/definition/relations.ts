import { EntityDef } from "./entity";
import { KeysHaving } from "../misc/misc";

export type DataRelation = HasOne<any> | HasMany<any, string>;
const relationTypeKey: keyof DataRelation = "relation_type";
export const isDataRelation = (val: unknown): val is DataRelation => Boolean(val) && typeof val === "object" && relationTypeKey in (val as any) && typeof (val as any)[relationTypeKey] === "string";

export type RelationTarget<T extends DataRelation> =
      T extends HasOne<infer One> ? One
    : T extends HasMany<infer Many, any> ? Many
    : never;

export interface HasOne<T> { relation_type: "has_one"; target: () => EntityDef<T>; }
export const hasOne = <T>(target: () => EntityDef<T>): HasOne<T> => ({ relation_type: "has_one", target });

export interface HasMany<T, BacklinkKey extends keyof T> { relation_type: "has_many"; target: () => EntityDef<T>; backlink: BacklinkKey; }
export const hasMany = <T, BacklinkKey extends KeysHaving<HasOne<any>, T>>(target: () => EntityDef<T>, backlink: BacklinkKey): HasMany<T, BacklinkKey> => ({ relation_type: "has_many", target, backlink });
