import { asId } from "../../definition/entity";
import { DatabaseRead, ReadRequest } from "./read_api";
import { asVersionId, masterBranchId } from "../../temporal";
import { FetchResponse } from "../fetch_types/fetch_response";
import { FetchNode } from "../fetch_types/fetch_node";
import { TestRelation, TestTarget, TestUniverse } from "../_test_universe";

declare function is<Expected = never>(actual: Expected): void;
declare function request<Relations extends FetchNode<TestTarget>>(val: ReadRequest<TestTarget, Relations>): void;

request({
    type: TestTarget,
    branch: masterBranchId,
    ids: [asId("1")],
    relations: {},
});

request({
    type: TestTarget,
    branch: masterBranchId,
    ids: [asId("1")],
    relations: { one: { inverse: {} } },
});

request({
    type: TestTarget,
    branch: masterBranchId,
    ids: [asId("1")],
    relations: { one: { target: { many: {} } } },
});

request({
    type: TestTarget,
    at: asVersionId("0"),
    ids: [asId("1")],
    relations: { one: { target: { many: {
        // @ts-expect-error — unexpected relation request
        unexpected: {},
    } } } },
});



declare const read: DatabaseRead<TestUniverse>;
read({
    norelations: {
        type: TestTarget,
        ids: [asId("1"), asId("2")],
        branch: masterBranchId,
        relations: {},
    },
    somerelations: {
        type: TestRelation,
        ids: [asId("1"), asId("2")],
        branch: masterBranchId,
        relations: { target: { one: { target: { many: {} } } } },
    },
    inverserelation: {
        type: TestRelation,
        branch: masterBranchId,
        ids: [asId("1")],
        relations: { inverse: {} },
    },
}).then(res => {
    is<FetchResponse<TestTarget, {}>>(res.norelations[0]!);
    is<FetchResponse<TestRelation, { target: { one: { target: { many: {} } } } }>>(res.somerelations[0]!);
    is<FetchResponse<TestRelation, { inverse: {} }>>(res.inverserelation[0]!);
});

read({
    incorrect: {
        type: TestTarget,
        ids: [asId("1"), asId("2")],
        branch: masterBranchId,
        relations: { one: { target: { many: { target: {
            // @ts-expect-error
            unexpected: {},
        } } } } },
    },
}).then(() => void 0);
