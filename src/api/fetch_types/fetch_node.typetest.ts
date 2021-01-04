import { FetchNode } from "./fetch_node";
import { TestTarget } from "../_test_universe";

declare function test(node: FetchNode<TestTarget>): void;

// Traversing references
test({
    one: { target: {} },
    many: { target: { many: {} } },
});

test({
    // @ts-expect-error — Nonexistent reference
    blah: {},
});

test({
    one: { target: { many: { target: { one: {
        // @ts-expect-error — Deep nonexistent reference
        blah: {},
    } } } } },
});

// Traversing internal fk
test({ one: { internalFK: { branchedFrom: { createdBy: { createdBy: {} } } } } });

test({ one: { internalFK: { branchedFrom: { createdBy: { createdBy: {
    // @ts-expect-error — Deep nonexistent reference on internal fk
    blah: {},
} } } } } });

test({
    // @ts-expect-error — Type mismatch
    one: 1,
});
