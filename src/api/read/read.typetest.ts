import { asId } from "../../definition/entity";
import { DatabaseRead, ReadRequest } from "./read_api";
import { asVersionId, masterBranchId } from "../../temporal";
import { FetchResponse } from "../fetch_types/fetch_response";
import { FetchNode } from "../fetch_types/fetch_node";
import { TestReference, TestTarget, TestUniverse } from "../_test_universe";

declare function is<Expected = never>(actual: Expected): void;
declare function request<References extends FetchNode<TestTarget>>(val: ReadRequest<TestTarget, References>): void;

request({
    type: TestTarget,
    branch: masterBranchId,
    ids: [asId("1")],
    references: {},
});

request({
    type: TestTarget,
    branch: masterBranchId,
    ids: [asId("1")],
    references: { one: { inverse: {} } },
});

request({
    type: TestTarget,
    branch: masterBranchId,
    ids: [asId("1")],
    references: { one: { target: { many: {} } } },
});

request({
    type: TestTarget,
    at: asVersionId("0"),
    ids: [asId("1")],
    references: { one: { target: { many: {
        // @ts-expect-error — unexpected reference request
        unexpected: {},
    } } } },
});



declare const read: DatabaseRead<TestUniverse>;
read({
    noreferences: {
        type: TestTarget,
        ids: [asId("1"), asId("2")],
        branch: masterBranchId,
        references: {},
    },
    somereferences: {
        type: TestReference,
        ids: [asId("1"), asId("2")],
        branch: masterBranchId,
        references: { target: { one: { target: { many: {} } } } },
    },
    inversereference: {
        type: TestReference,
        branch: masterBranchId,
        ids: [asId("1")],
        references: { inverse: {} },
    },
}).then(res => {
    is<FetchResponse<TestTarget, {}>>(res.noreferences[0]!);
    is<FetchResponse<TestReference, { target: { one: { target: { many: {} } } } }>>(res.somereferences[0]!);
    is<FetchResponse<TestReference, { inverse: {} }>>(res.inversereference[0]!);
});

read({
    incorrect: {
        type: TestTarget,
        ids: [asId("1"), asId("2")],
        branch: masterBranchId,
        references: { one: { target: { many: { target: {
            // @ts-expect-error
            unexpected: {},
        } } } } },
    },
}).then(() => void 0);
