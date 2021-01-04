import { entity } from "../definition/entity";
import { primitiveBranch, primitiveInt } from "../definition/primitives";
import { hasMany, hasOne, hasOneInverse } from "../definition/references";
import { UniverseRestriction } from "./universe";

@entity()
export class TestTarget {
    public tgtProp = primitiveInt();
    public one = hasOne(() => TestReference);
    public many = hasMany(() => TestReference, "target");
}

@entity()
export class TestReference {
    public refProp = primitiveInt();
    public internalFK = primitiveBranch();
    public target = hasOne(() => TestTarget);
    public inverse = hasOneInverse(() => TestTarget, "one");
}

declare function createUniverse<U extends UniverseRestriction<U>>(u: U): U;
const universe = createUniverse({ TestTarget, TestReference });
export type TestUniverse = typeof universe;
