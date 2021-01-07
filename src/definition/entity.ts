import { Object } from "ts-toolbelt";
import { DataPrimitive, isDataPrimitive, PrimitiveValue } from "./primitives";
import { DataReference, HasMany, HasOne, isDataReference } from "./references";
import { isString, objectKeys } from "../misc/typeguards";

export type EntityDef<T> = new () => T;
export type EntityProp = DataPrimitive | DataReference;
export type EntityShape = { [prop: string]: EntityProp; };
export type EntityRestriction<T> = { [P in Extract<keyof T, string>]: T[P] extends EntityProp ? T[P] : never };
export type EntityOf<T extends EntityRestriction<T>> = { id: Id<T> } & { [P in keyof T]:
      T[P] extends DataPrimitive ? PrimitiveValue<T[P]> | null
    : T[P] extends HasOne<infer One> ? (One extends EntityRestriction<One> ? EntityOf<One> | null : never)
    : T[P] extends HasMany<infer Many, any> ? (Many extends EntityRestriction<Many> ? Array<EntityOf<Many>> : never)
    : never
};
export type PartialEntity<T extends EntityRestriction<T>> = Object.Partial<EntityOf<T>, "deep">;
export type EntityDefType<T extends EntityDef<any>> = T extends EntityDef<infer Def> ? (Def extends EntityRestriction<Def> ? Def : never) : never;

const entityMetadataKey = Symbol("chicken-katsu:entity");
export const entity = (name?: string) => <T extends EntityRestriction<T>>(Type: EntityDef<T>) => {
    if (typeof Type !== "function") { throw new Error("Expected an entity constructor"); }

    const elementName = name || Type.name;
    if (!elementName || !isString(elementName)) { throw new Error("No entity name found"); }

    const typeDef = new Type();
    objectKeys(typeDef).forEach(prop => {
        const propDef = typeDef[prop];
        if (!isDataPrimitive(propDef) && !isDataReference(propDef)) {
            throw new Error(`Expected property '${ prop }' on type '${ elementName }' to be a primitive or reference definition`);
        }
    });

    Reflect.defineMetadata(entityMetadataKey, elementName, Type);
};

export const getEntityName = <T>(etty: new () => EntityRestriction<T>) => {
    const name = Reflect.getMetadata(entityMetadataKey, etty);
    if (!isString(name)) { throw new Error(`Unknown entity type: ${ etty.toString() }`); }
    return name;
};

export type Id<Entity extends EntityRestriction<Entity>> = string & { $$entity: Entity };
export const asId = <Entity extends EntityRestriction<Entity> = never>(id: string): Id<Entity> => id as any;
export const isId = (val: unknown): val is Id<any> => Boolean(val) && typeof val === "string";
