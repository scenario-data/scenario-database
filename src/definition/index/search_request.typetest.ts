import { IndexRequestBuilder } from "./search_request";
import { TestTarget } from "../../api/_test_universe";
import { indexPath } from "./path";
import { IndexDefinitionFn } from "./index";


declare const index: IndexDefinitionFn;
const testIndex = index("some_index", TestTarget, {
    tgtProp: {
        target: indexPath<TestTarget>().tgtProp,
        conditions: ["eq", "neq", "lt", "gt"],
    },
    relProp: {
        target: indexPath<TestTarget>().one.relProp,
        conditions: ["eq", "neq", "lt"],
    },
    incompleteTypeMatch: {
        target: indexPath<TestTarget>().one.relProp,
        conditions: ["eq", "lt"],
    },
});

const testIndexTargets = testIndex.targets;
declare const request: IndexRequestBuilder<TestTarget, typeof testIndexTargets>;

request.data("tgtProp", { type: "eq", val: 1 });
request.data("tgtProp", { type: "eq", val: null });
request.data("relProp", { type: "eq", val: 1 });

request.data("incompleteTypeMatch", { type: "eq", val: 1 });
request.data("incompleteTypeMatch", { type: "neq", val: 1 }); // `neq` not explicitly specified, but inferred by condition definition
request.data("incompleteTypeMatch", { type: "lt", val: 1 });
request.data("incompleteTypeMatch", { type: "gt", val: 1 }); // `gt` not explicitly specified, but inferred by condition definition

// @ts-expect-error — value mismatch: given string for int property
request.data("tgtProp", { type: "eq", val: "stringy" });

// @ts-expect-error — condition type mismatch: `contains` is not applicable to int properties
request.data("tgtProp", { type: "contains", val: 1 });

// @ts-expect-error — field not in index
request.data("nonexistent", { type: "eq", val: 1 });

request.and(
    request.data("tgtProp", { type: "neq", val: null }),
    request.or(
        request.data("relProp", { type: "eq", val: 1 }),
        request.data("incompleteTypeMatch", { type: "gt", val: 1 })
    )
);
