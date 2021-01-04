import { EntityDef, EntityRestriction } from "../definition/entity";

type DefType<T extends EntityDef<any>> = T extends EntityDef<infer Def> ? (Def extends EntityRestriction<Def> ? Def : never) : never;
type _UniverseRestriction<T, P extends keyof T, Show extends "key" | "type"> = T[P] extends EntityDef<any> ? ([DefType<T[P]>] extends [never] ? never : (Show extends "key" ? P : T[P])) : never;
export type UniverseRestriction<T> = { [P in Extract<_UniverseRestriction<T, keyof T, "key">, string>]: _UniverseRestriction<T, P, "type"> };
export type UniverseElement<Universe extends UniverseRestriction<Universe>> = Universe[keyof Universe] extends EntityDef<infer Def> ? (Def extends EntityRestriction<Def> ? Def : never) : never;

export function getUniverseElementName<Universe extends UniverseRestriction<Universe>>(universe: Universe, element: EntityDef<UniverseElement<Universe>>): string {
    // TODO: needs more robust implementation, relying on constructor name is icky
    if (!(element.name in universe)) { throw new Error("Implementation error"); }
    return element.name;
}
