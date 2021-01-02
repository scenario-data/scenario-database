import { entity } from "../definition/entity";
import { primitiveBranch, primitiveInt } from "../definition/primitives";
import { hasMany, hasOne, hasOneInverse } from "../definition/relations";
import { UniverseRestriction } from "./universe";

@entity()
export class TestTarget {
    public tgtProp = primitiveInt();
    public one = hasOne(() => TestRelation);
    public many = hasMany(() => TestRelation, "target");
}

@entity()
export class TestRelation {
    public relProp = primitiveInt();
    public internalFK = primitiveBranch();
    public target = hasOne(() => TestTarget);
    public inverse = hasOneInverse(() => TestTarget, "one");
}

declare function createUniverse<U extends UniverseRestriction<U>>(u: U): U;
const universe = createUniverse({ TestTarget, TestRelation });
export type TestUniverse = typeof universe;
