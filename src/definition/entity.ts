import { DataPrimitive, PrimitiveValue } from "./primitives";
import { DataReference, HasMany, HasOne } from "./references";
import { Object } from "ts-toolbelt";

export type EntityDef<T> = new () => T;
export type EntityRestriction<T> = { [P in Extract<keyof T, string>]: T[P] extends DataPrimitive | DataReference ? T[P] : never };
export type EntityOf<T extends EntityRestriction<T>> = { id: Id<T> } & { [P in keyof T]:
      T[P] extends DataPrimitive ? PrimitiveValue<T[P]> | null
    : T[P] extends HasOne<infer One> ? (One extends EntityRestriction<One> ? EntityOf<One> | null : never)
    : T[P] extends HasMany<infer Many, any> ? (Many extends EntityRestriction<Many> ? Array<EntityOf<Many>> : never)
    : never
};
export type PartialEntity<T extends EntityRestriction<T>> = Object.Partial<EntityOf<T>, "deep">;

export const entityMetadataKey = Symbol("chicken-katsu:entity");
export const entity = () => <T>(target: new () => EntityRestriction<T>) => {
    Reflect.defineMetadata(entityMetadataKey, target.name, target);
};

export type Id<Entity extends EntityRestriction<Entity>> = string & { $$entity: Entity };
export const asId = <Entity extends EntityRestriction<Entity> = never>(id: string): Id<Entity> => id as any;
export const isId = (val: unknown): val is Id<any> => Boolean(val) && typeof val === "string";
