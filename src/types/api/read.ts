import { Any } from "ts-toolbelt";
import { EntityRestriction, Id } from "../definition/entity";
import { FetchNode } from "./fetch_node";
import { Ctor } from "../util/misc";
import { NoExtraProperties } from "../util/no_extra_properties";
import { BranchId, VersionId } from "../temporal";
import { UniverseElement, UniverseRestriction } from "./universe";
import { FetchResponse } from "./fetch_response";

interface ReadRequestData<Entity extends EntityRestriction<Entity>, Relations extends FetchNode<Entity>> {
    type: Ctor<Entity>;
    relations: Any.Cast<Relations, NoExtraProperties<FetchNode<Entity>, Relations>>;
}

interface ReadRequestIds<Entity extends EntityRestriction<Entity>> {
    ids: Id<Entity>[];
}

interface ReadRequestTemporal {
    branch: BranchId;
    since?: VersionId;
    at?: VersionId;
}

export type ReadRequest<Entity extends EntityRestriction<Entity>, Relations extends FetchNode<Entity>> = ReadRequestData<Entity, Relations> & ReadRequestIds<Entity> & ReadRequestTemporal;

type RequestEntity<T extends ReadRequest<any, any>> = T extends ReadRequest<infer Entity, any> ? Entity : never;
type RequestRelations<T extends ReadRequest<any, any>> = T extends ReadRequest<infer _Entity, infer Relations> ? Relations : never;
export interface DatabaseRead<Universe extends UniverseRestriction<Universe>> {
    <T extends { [prop: string]: ReadRequest<UniverseElement<Universe>, any> }>(
        read: { [P in keyof T]: Any.Cast<T[P], ReadRequest<RequestEntity<T[P]>, RequestRelations<T[P]>>> }
    ): Promise<{ [P in keyof T]: FetchResponse<RequestEntity<T[P]>, RequestRelations<T[P]>>[] }>;
}
