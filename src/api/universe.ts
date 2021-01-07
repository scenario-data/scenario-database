import { EntityDef, EntityDefType, EntityRestriction, getEntityName } from "../definition/entity";


type _UniverseRestriction<T, P extends keyof T, Show extends "key" | "type"> = T[P] extends EntityDef<any> ? ([EntityDefType<T[P]>] extends [never] ? never : (Show extends "key" ? P : T[P])) : never;
export type UniverseRestriction<T> = { [P in Extract<_UniverseRestriction<T, keyof T, "key">, string>]: _UniverseRestriction<T, P, "type"> };
export type UniverseElement<Universe extends UniverseRestriction<Universe>> = Universe[keyof Universe] extends EntityDef<infer Def> ? (Def extends EntityRestriction<Def> ? Def : never) : never;

export function getUniverseElementName<Universe extends UniverseRestriction<Universe>>(universe: Universe, element: EntityDef<UniverseElement<Universe>>): string {
    const name = getEntityName(element);
    if (!(name in universe)) { throw new Error(`Element not in universe: ${ element.toString() }`); }
    return name;
}
