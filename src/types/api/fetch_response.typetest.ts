import { entity, Id } from "../definition/entity";
import { PrimitiveBranch, primitiveBranch, primitiveInt } from "../definition/primitives";
import { hasMany, hasOne } from "../definition/relations";
import { FetchNode } from "./fetch_node";
import { FetchResponse, InternalFKPrimitiveFetchResponse } from "./fetch_response";
import { BranchId, VersionId } from "../temporal";
import { LocalDateTime } from "js-joda";
import { UserId } from "../user";

@entity()
class Target {
    public tgtProp = primitiveInt();
    public one = hasOne(() => Relation);
    public many = hasMany(() => Relation, "target");
}

@entity()
class Relation {
    public relProp = primitiveInt();
    public internalFK = primitiveBranch();
    public target = hasOne(() => Target);
}

declare function response<T extends FetchNode<Target>>(val: T): FetchResponse<Target, T>;
declare function is<Expected = never>(actual: Expected): void;
declare function noop(val: any): void;

// Check metadata
is<Id<Target>>(response({}).id);
is<VersionId>(response({}).at);
is<LocalDateTime>(response({}).ts);
is<UserId>(response({}).by);

// Check own property present
is<number | null>(response({}).tgtProp);

// @ts-expect-error — relation not requested, so not present
noop(response({}).one);
is<FetchResponse<Relation, {}> | null>(response({ one: {} }).one); // Relation present

// @ts-expect-error — relation not requested, so not present
noop(response({}).many);
is<FetchResponse<Relation, {}>[]>(response({ many: {} }).many); // Relation present

is<BranchId>(response({ one: { internalFK: {} } }).one!.internalFK.branchedFrom);
is<InternalFKPrimitiveFetchResponse<PrimitiveBranch, {}>>(response({ one: { internalFK: { branchedFrom: {} } } }).one!.internalFK.branchedFrom);

