import { Id } from "../../definition/entity";
import { PrimitiveBranch } from "../../definition/primitives";
import { FetchNode } from "./fetch_node";
import { FetchResponse, InternalFKPrimitiveFetchResponse } from "./fetch_response";
import { BranchId, VersionId } from "../../temporal";
import { LocalDateTime } from "js-joda";
import { UserId } from "../../user";
import { TestReference, TestTarget } from "../_test_universe";

declare function response<T extends FetchNode<TestTarget>>(val: T): FetchResponse<TestTarget, T>;
declare function is<Expected = never>(actual: Expected): void;
declare function noop(val: any): void;

// Check metadata
is<Id<TestTarget>>(response({}).id);
is<VersionId>(response({}).at);
is<LocalDateTime>(response({}).ts);
is<UserId>(response({}).by);

// Check own property present
is<number | null>(response({}).tgtProp);

// @ts-expect-error — reference not requested, so not present
noop(response({}).one);
is<FetchResponse<TestReference, {}> | null>(response({ one: {} }).one); // Reference present

// @ts-expect-error — reference not requested, so not present
noop(response({}).many);
is<FetchResponse<TestReference, {}>[]>(response({ many: {} }).many); // Reference present

is<BranchId>(response({ one: { internalFK: {} } }).one!.internalFK!.branched_from);
is<InternalFKPrimitiveFetchResponse<PrimitiveBranch, {}>>(response({ one: { internalFK: { branched_from: {} } } }).one!.internalFK!.branched_from);

// Check traversing inverse reference
is<FetchResponse<TestTarget, {}> | null>(response({ one: { inverse: {} } }).one!.inverse);
is<number | null>(response({ one: { inverse: {} } }).one!.inverse!.tgtProp);
