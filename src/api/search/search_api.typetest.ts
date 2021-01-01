import { DatabaseSearch } from "./search_api";
import { TestTarget, TestUniverse } from "../_test_universe";
import { IndexDefinitionFn } from "../../definition/index";
import { indexPath } from "../../definition/index/path";
import { IndexRequestBuilder } from "../../definition/index/search_request";
import { masterBranchId } from "../../temporal";
import { FetchResponse } from "../fetch_types/fetch_response";


declare function is<Expected = never>(actual: Expected): void;
declare const search: DatabaseSearch<TestUniverse>;
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

const testIndex2 = index("some_index", TestTarget, {
    prop: {
        target: indexPath<TestTarget>().tgtProp,
        conditions: ["eq"],
    },
});

declare const targetRequest: IndexRequestBuilder<TestTarget, typeof testIndex.targets>;

search(
    testIndex,
    targetRequest.and(
        targetRequest.data("tgtProp", { type: "neq", val: null }),
        targetRequest.or(
            targetRequest.data("relProp", { type: "eq", val: 1 }),
            targetRequest.data("incompleteTypeMatch", { type: "gt", val: 1 })
        )
    ),
    masterBranchId,
    { one: {}, many: { target: {} } }
).then(res => {
    is<FetchResponse<TestTarget, { one: {}, many: { target: {} } }>>(res[0]!);

    // @ts-expect-error — testing against a response with extra expected relations
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

    // @ts-expect-error — unknown relation
    { blah: {} }
).then(() => void 0);
