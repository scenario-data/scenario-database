import { EntityDef } from "./entity";
import { KeysHaving } from "../misc/misc";
import { Any } from "ts-toolbelt";

export type DataReference = HasOne<any> | HasOneInverse<any, string> | HasMany<any, string>;
const referenceTypeKey: keyof DataReference = "reference_type";
export const isDataReference = (val: unknown): val is DataReference => Boolean(val) && typeof val === "object" && referenceTypeKey in (val as any) && typeof (val as any)[referenceTypeKey] === "string";

export type ReferenceTarget<T extends DataReference> =
      T extends HasOne<infer One> ? One
    : T extends HasOneInverse<infer Inverse, any> ? Inverse
    : T extends HasMany<infer Many, any> ? Many
    : never;

export interface HasOne<T> { reference_type: "has_one"; target: () => EntityDef<T>; }
export const hasOne = <T>(target: () => EntityDef<T>): HasOne<T> => ({ reference_type: "has_one", target });

export interface HasOneInverse<T, BacklinkKey extends keyof T> { reference_type: "has_one_inverse"; target: () => EntityDef<T>; backlink: BacklinkKey; }
export const hasOneInverse = <T, BacklinkKey extends keyof T>(target: () => EntityDef<T>, backlink: Any.Cast<BacklinkKey, CheckBacklink<T, BacklinkKey>>): HasOneInverse<T, BacklinkKey> => ({ reference_type: "has_one_inverse", target, backlink: backlink as any });

export interface HasMany<T, BacklinkKey extends keyof T> { reference_type: "has_many"; target: () => EntityDef<T>; backlink: BacklinkKey; }
export const hasMany = <T, BacklinkKey extends keyof T>(target: () => EntityDef<T>, backlink: Any.Cast<BacklinkKey, CheckBacklink<T, BacklinkKey>>): HasMany<T, BacklinkKey> => ({ reference_type: "has_many", target, backlink: backlink as any });

// This check avoids circular references imposed by using `KeysHaving<{ reference_type: "has_one" }, T>` directly
type CheckBacklink<T, BacklinkKey extends keyof T> = T[BacklinkKey] extends { reference_type: "has_one" } ? BacklinkKey : KeysHaving<{ reference_type: "has_one" }, T>;
