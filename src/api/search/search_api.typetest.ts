import { DatabaseSearch } from "./search_api";
import { TestTarget, TestUniverse } from "../_test_universe";
import { IndexDefinitionFn } from "../../definition/index";
import { indexPath } from "../../definition/index/path";
import { IndexRequestBuilder } from "../../definition/index/search_request";
import { masterBranchId } from "../../temporal";
import { FetchResponse } from "../fetch_types/fetch_response";
import { asId } from "../../definition/entity";


declare function is<Expected = never>(actual: Expected): void;
declare const index: IndexDefinitionFn;

const testIndex = index("some_index", TestTarget, {
    tgtProp: {
        target: indexPath<TestTarget>().tgtProp,
        conditions: ["eq", "neq", "lt", "gt"],
    },
    refProp: {
        target: indexPath<TestTarget>().one.refProp,
        conditions: ["eq", "neq", "lt"],
    },
    incompleteTypeMatch: {
        target: indexPath<TestTarget>().one.refProp,
        conditions: ["eq", "lt"],
    },
});

const testIndex2 = index("some_index", TestTarget, {
    prop: {
        target: indexPath<TestTarget>().tgtProp,
        conditions: ["eq"],
    },
});

declare const targetRequest: IndexRequestBuilder<TestTarget, typeof testIndex.targets>;
declare const search: DatabaseSearch<TestUniverse, [typeof testIndex, typeof testIndex2]>;

search(
    testIndex,
    targetRequest.and(
        targetRequest.data("tgtProp", { type: "neq", val: null }),
        targetRequest.or(
            targetRequest.data("refProp", { type: "eq", val: 1 }),
            targetRequest.data("incompleteTypeMatch", { type: "gt", val: 1 })
        )
    ),
    masterBranchId,
    { one: {}, many: { target: {} } }
).then(res => {
    is<FetchResponse<TestTarget, { one: {}, many: { target: {} } }>>(res[0]!);

    // @ts-expect-error — testing against a response with extra expected references
    is<FetchResponse<TestTarget, { one: {}, many: { target: { one: {} } } }>>(res[0]!);
});


search(
    testIndex2,

    // @ts-expect-error — request builder for a different index
    targetRequest.data("tgtProp", { type: "neq", val: null }),

    masterBranchId,
    {}
).then(() => void 0);



search(
    testIndex,
    targetRequest.data("tgtProp", { type: "neq", val: null }),
    masterBranchId,

    // @ts-expect-error — unknown reference
    { blah: {} }
).then(() => void 0);


const outOfScopeIndex = index("out_of_scope_index", TestTarget, {
    id: {
        target: indexPath<TestTarget>().id,
        conditions: ["eq"],
    },
});
declare const outOfScopeTargetRequest: IndexRequestBuilder<TestTarget, typeof outOfScopeIndex.targets>;

search(
    // @ts-expect-error — index not among specified in search api
    outOfScopeIndex,
    outOfScopeTargetRequest.data("id", { type: "eq", val: asId("tst") }),
    masterBranchId,
    {}
).then(() => void 0);
