import { Any } from "ts-toolbelt";
import { EntityDef, EntityRestriction, Id } from "../../definition/entity";
import { FetchNode } from "../fetch_types/fetch_node";
import { NoExtraProperties } from "../../misc/no_extra_properties";
import { BranchId, VersionId } from "../../temporal";
import { UniverseElement, UniverseRestriction } from "../universe";
import { FetchResponse } from "../fetch_types/fetch_response";

interface ReadRequestData<Entity extends EntityRestriction<Entity>, References extends FetchNode<Entity>> {
    type: EntityDef<Entity>;
    references: Any.Cast<References, NoExtraProperties<FetchNode<Entity>, References>>;
}

interface ReadRequestIds<Entity extends EntityRestriction<Entity>> {
    ids: Id<Entity>[];
}

interface ReadRequestTemporal {
    branch: BranchId;
    since?: VersionId;
    at?: VersionId;
}

export type ReadRequest<Entity extends EntityRestriction<Entity>, References extends FetchNode<Entity>> = ReadRequestData<Entity, References> & ReadRequestIds<Entity> & ReadRequestTemporal;

type RequestEntity<T extends ReadRequest<any, any>> = T extends ReadRequest<infer Entity, any> ? Entity : never;
type RequestReferences<T extends ReadRequest<any, any>> = T extends ReadRequest<infer _Entity, infer References> ? References : never;
export interface DatabaseRead<Universe extends UniverseRestriction<Universe>> {
    <T extends { [prop: string]: ReadRequest<UniverseElement<Universe>, any> }>(
        read: { [P in keyof T]: Any.Cast<T[P], ReadRequest<RequestEntity<T[P]>, RequestReferences<T[P]>>> }
    ): Promise<{ [P in keyof T]: FetchResponse<RequestEntity<T[P]>, RequestReferences<T[P]>>[] }>;
}
