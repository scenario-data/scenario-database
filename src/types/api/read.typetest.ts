import { asId, entity } from "../definition/entity";
import { primitiveBranch, primitiveInt } from "../definition/primitives";
import { hasMany, hasOne } from "../definition/relations";
import { DatabaseRead, ReadRequest } from "./read";
import { asVersionId, masterBranchId } from "../temporal";
import { UniverseRestriction } from "./universe";
import { FetchResponse } from "./fetch_response";
import { FetchNode } from "./fetch_node";

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

declare function is<Expected = never>(actual: Expected): void;
declare function request<Relations extends FetchNode<Target>>(val: ReadRequest<Target, Relations>): void;

request({
    type: Target,
    branch: masterBranchId,
    ids: [asId("1")],
    relations: {},
});

request({
    type: Target,
    branch: masterBranchId,
    ids: [asId("1")],
    relations: { one: { target: { many: {} } } },
});

request({
    type: Target,
    at: asVersionId("0"),
    ids: [asId("1")],
    relations: { one: { target: { many: {
        // @ts-expect-error — unexpected relation request
        unexpected: {},
    } } } },
});


declare function createUniverse<U extends UniverseRestriction<U>>(u: U): U;
const universe = createUniverse({ Target, Relation });

declare const read: DatabaseRead<typeof universe>;
read({
    norelations: {
        type: Target,
        ids: [asId("1"), asId("2")],
        branch: masterBranchId,
        relations: {},
    },
    somerelations: {
        type: Relation,
        ids: [asId("1"), asId("2")],
        branch: masterBranchId,
        relations: { target: { one: { target: { many: {} } } } },
    },
}).then(res => {
    is<FetchResponse<Target, {}>>(res.norelations[0]!);
    is<FetchResponse<Relation, { target: { one: { target: { many: {} } } } }>>(res.somerelations[0]!);
});

read({
    incorrect: {
        type: Target,
        ids: [asId("1"), asId("2")],
        branch: masterBranchId,
        relations: { one: { target: { many: { target: {
            // @ts-expect-error
            unexpected: {},
        } } } } },
    },
}).then(() => void 0);
