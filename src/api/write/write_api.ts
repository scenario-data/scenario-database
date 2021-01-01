import { Any } from "ts-toolbelt";
import { EntityDef, EntityRestriction, PartialEntity } from "../../definition/entity";
import { BranchId } from "../../temporal";
import { UserId } from "../../user";
import { FetchNode } from "../fetch_types/fetch_node";
import { NoExtraProperties } from "../../misc/no_extra_properties";
import { UniverseElement, UniverseRestriction } from "../universe";
import { FetchResponse } from "../fetch_types/fetch_response";


export type WriteRequest<
    Entity extends EntityRestriction<Entity>,
    Relations extends FetchNode<Entity>
> = {
    type: EntityDef<Entity>,
    branch: BranchId,

    by: UserId;
    values: PartialEntity<Entity>[];

    returning: Any.Cast<Relations, NoExtraProperties<FetchNode<Entity>, Relations>>;
};


type RequestEntity<T extends WriteRequest<any, any>> = T extends WriteRequest<infer Entity, any> ? Entity : never;
type RequestRelations<T extends WriteRequest<any, any>> = T extends WriteRequest<infer _Entity, infer Relations> ? Relations : never;
export interface DatabaseWrite<Universe extends UniverseRestriction<Universe>> {
    <T extends { [prop: string]: WriteRequest<UniverseElement<Universe>, any> }>(
        write: { [P in keyof T]: Any.Cast<T[P], WriteRequest<RequestEntity<T[P]>, RequestRelations<T[P]>>> }
    ): Promise<{ [P in keyof T]: FetchResponse<RequestEntity<T[P]>, RequestRelations<T[P]>>[] }>;
}
