import { primitiveBranch, primitiveInt } from "../definition/primitives";
import { hasMany, hasOne } from "../definition/relations";
import { entity } from "../definition/entity";
import { FetchNode } from "./fetch_node";

@entity()
class Target {
    public tgtProp = primitiveInt();
    public one = hasOne(() => Relation);
    public many = hasMany(() => Relation, "target");
}

@entity()
class Relation {
    public relProp = primitiveInt();
    public internalFK = primitiveBranch();
    public target = hasOne(() => Target);
}

declare function test(node: FetchNode<Target>): void;

// Traversing relations
test({
    one: { target: {} },
    many: { target: { many: {} } },
});

test({
    // @ts-expect-error — Nonexistent relation
    blah: {},
});

test({
    one: { target: { many: { target: { one: {
        // @ts-expect-error — Deep nonexistent relation
        blah: {},
    } } } } },
});

// Traversing internal fk
test({ one: { internalFK: { branchedFrom: { createdBy: { createdBy: {} } } } } });

test({ one: { internalFK: { branchedFrom: { createdBy: { createdBy: {
    // @ts-expect-error — Deep nonexistent relation on internal fk
    blah: {},
} } } } } });

test({
    // @ts-expect-error — Type mismatch
    one: 1,
});
