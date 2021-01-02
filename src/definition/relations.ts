import { EntityDef } from "./entity";
import { KeysHaving } from "../misc/misc";
import { Any } from "ts-toolbelt";

export type DataRelation = HasOne<any> | HasOneInverse<any, string> | HasMany<any, string>;
const relationTypeKey: keyof DataRelation = "relation_type";
export const isDataRelation = (val: unknown): val is DataRelation => Boolean(val) && typeof val === "object" && relationTypeKey in (val as any) && typeof (val as any)[relationTypeKey] === "string";

export type RelationTarget<T extends DataRelation> =
      T extends HasOne<infer One> ? One
    : T extends HasOneInverse<infer Inverse, any> ? Inverse
    : T extends HasMany<infer Many, any> ? Many
    : never;

export interface HasOne<T> { relation_type: "has_one"; target: () => EntityDef<T>; }
export const hasOne = <T>(target: () => EntityDef<T>): HasOne<T> => ({ relation_type: "has_one", target });

export interface HasOneInverse<T, BacklinkKey extends keyof T> { relation_type: "has_one_inverse"; target: () => EntityDef<T>; backlink: BacklinkKey; }
export const hasOneInverse = <T, BacklinkKey extends keyof T>(target: () => EntityDef<T>, backlink: Any.Cast<BacklinkKey, CheckBacklink<T, BacklinkKey>>): HasOneInverse<T, BacklinkKey> => ({ relation_type: "has_one_inverse", target, backlink: backlink as any });

export interface HasMany<T, BacklinkKey extends keyof T> { relation_type: "has_many"; target: () => EntityDef<T>; backlink: BacklinkKey; }
export const hasMany = <T, BacklinkKey extends keyof T>(target: () => EntityDef<T>, backlink: Any.Cast<BacklinkKey, CheckBacklink<T, BacklinkKey>>): HasMany<T, BacklinkKey> => ({ relation_type: "has_many", target, backlink: backlink as any });

// This check avoids circular references imposed by using `KeysHaving<{ relation_type: "has_one" }, T>` directly
type CheckBacklink<T, BacklinkKey extends keyof T> = T[BacklinkKey] extends { relation_type: "has_one" } ? BacklinkKey : KeysHaving<{ relation_type: "has_one" }, T>;
