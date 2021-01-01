import { FetchNode } from "./fetch_node";
import { TestTarget } from "../_test_universe";

declare function test(node: FetchNode<TestTarget>): void;

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
