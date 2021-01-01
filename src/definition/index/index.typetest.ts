import { IndexDefinitionFn } from "./index";
import { TestTarget } from "../../api/_test_universe";
import { indexPath } from "./path";
import { primitiveString } from "../primitives";


declare const index: IndexDefinitionFn;

// Index with no targets in combination with `null` search request
// allows unrestricted pagination through entities of given type
index("some_index", TestTarget, {});

index("some_index", TestTarget, {
    id: {
        target: indexPath<TestTarget>().id,
        conditions: ["eq"],
    },
    relationId: {
        target: indexPath<TestTarget>().one.id,
        conditions: ["eq"],
    },
    tgtProp: {
        target: indexPath<TestTarget>().tgtProp,
        conditions: ["eq", "neq", "lt", "gt"],
    },
    relProp: {
        target: indexPath<TestTarget>().one.relProp,
        conditions: ["eq", "lt"],
    },
    internalFK: {
        target: indexPath<TestTarget>().one.internalFK,
        conditions: ["eq"],
    },
    internalFKDeep: {
        target: indexPath<TestTarget>().one.internalFK.branchedFrom.createdBy.createdBy.ts,
        conditions: ["lt", "gt"],
    },
});

class Str { public str = primitiveString(); }
index("some_index", Str, {
    str: {
        target: indexPath<Str>().str,
        conditions: ["contains"],
    },
});

index("some_index", TestTarget, {
    toMany: {
        // @ts-expect-error — to-many traversal not allowed for indices, otherwise may lead to combinatorial explosions
        target: indexPath<TestTarget>().many.relProp,
        conditions: ["eq", "lt"],
    },
});

index("some_index", TestTarget, {
    relation: {
        // @ts-expect-error — relation itself is not an allowed
        target: indexPath<TestTarget>().one,
        conditions: ["eq", "lt"],
    },
});

index("some_index", TestTarget, {
    conditionMismatch: {
        target: indexPath<TestTarget>().id,

        // @ts-expect-error — `lt` not allowed for `id` target
        conditions: ["eq", "lt"],
    },
});

index("some_index", TestTarget, {
    conditionMismatch: {
        // @ts-expect-error — Type not specified for `indexPath`
        target: indexPath().id,
        conditions: ["eq"],
    },
});
