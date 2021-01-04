import { TestTarget, TestUniverse } from "../_test_universe";
import { DatabaseWrite, WriteRequest } from "./write_api";
import { masterBranchId } from "../../temporal";
import { rootUserId } from "../../user";
import { FetchResponse } from "../fetch_types/fetch_response";
import { asId } from "../../definition/entity";
import { FetchNode } from "../fetch_types/fetch_node";

declare function is<Expected = never>(actual: Expected): void;
declare function request<References extends FetchNode<TestTarget>>(val: WriteRequest<TestTarget, References>): void;
declare const write: DatabaseWrite<TestUniverse>;

request({
    type: TestTarget,
    branch: masterBranchId,
    by: rootUserId,
    values: [
        {
            id: asId("0"),
            tgtProp: 1,

            // @ts-expect-error — unknown property
            asdfsdf: 1,
        },
        {
            // @ts-expect-error — to-many doesn't support nulls
            many: null,
        },
        {
            one: {
                target: {
                    many: [{
                        internalFK: masterBranchId,
                        refProp: 1,

                        // @ts-expect-error — unknown property
                        asdfsdf: 1,
                    }],
                },
            },
        },
    ],
    returning: {},
});

request({
    type: TestTarget,
    branch: masterBranchId,
    by: rootUserId,
    values: [],
    returning: { one: { target: {
        // @ts-expect-error — unknown reference
        nonexistent: {},
    } } },
});

write({
    simple: {
        type: TestTarget,
        branch: masterBranchId,
        by: rootUserId,
        values: [{}],
        returning: {},
    },
    withRequest: {
        type: TestTarget,
        branch: masterBranchId,
        by: rootUserId,
        values: [{}],
        returning: { one: { target: { many: {} } } },
    },
    withValues: {
        type: TestTarget,
        branch: masterBranchId,
        by: rootUserId,
        values: [
            {
                id: asId("0"),
                tgtProp: 1,
            },
            {
                tgtProp: null,
                one: null,
                many: [{
                    internalFK: null,
                    refProp: null,
                    target: null,
                }],
            },
            {
                one: {
                    target: {
                        many: [{
                            internalFK: masterBranchId,
                            refProp: 1,
                        }],
                    },
                },
            },
        ],
        returning: {},
    },
}).then(res => {
    // @ts-expect-error — testing against a response with extra expected references
    is<FetchResponse<TestTarget, { one: {} }>>(res.simple[0]!);
    is<FetchResponse<TestTarget, {}>>(res.simple[0]!);

    // @ts-expect-error — testing against a response with extra expected references
    is<FetchResponse<TestTarget, { one: {} }>>(res.withValues[0]!);
    is<FetchResponse<TestTarget, {}>>(res.withValues[0]!);

    // @ts-expect-error — testing against a response with extra expected references
    is<FetchResponse<TestTarget, { one: { target: { many: { target: {} } } } }>>(res.withRequest[0]!);
    is<FetchResponse<TestTarget, { one: { target: { many: {} } } }>>(res.withRequest[0]!);
});

write({
    value_errors: {
        type: TestTarget,
        branch: masterBranchId,
        by: rootUserId,
        values: [
            {
                id: asId("0"),
                tgtProp: 1,

                // @ts-expect-error — unknown property
                asdfsdf: 1,
            },
            {
                // @ts-expect-error — unknown property
                many: null,
            },
            {
                one: {
                    target: {
                        many: [{
                            internalFK: masterBranchId,
                            refProp: 1,

                            // @ts-expect-error — unknown property
                            asdfsdf: 1,
                        }],
                    },
                },
            },
        ],
        returning: {},
    },
}).then(() => void 0);

write({
    correct: {
        type: TestTarget,
        branch: masterBranchId,
        by: rootUserId,
        values: [],
        returning: {},
    },
    reference_errors: {
        type: TestTarget,
        branch: masterBranchId,
        by: rootUserId,
        values: [],
        returning: { one: { target: {
            // @ts-expect-error — unknown reference
            nonexistent: {},
        } } },
    },
}).then(() => void 0);
