import { UniverseElement, UniverseRestriction } from "./universe";
import { Index, IndexTargets } from "../definition/index";
import { FetchNode } from "./fetch_node";
import { BranchId } from "../temporal";
import { Any } from "ts-toolbelt";
import { NoExtraProperties } from "../util/no_extra_properties";
import { EntityRestriction, Id } from "../definition/entity";
import { FetchResponse } from "./fetch_response";
import { SearchRequest } from "../definition/index/search_request";
import { AtLeastOne } from "../../misc/typeguards";

export type SearchOrder<Entity extends EntityRestriction<Entity>, Targets extends IndexTargets<Entity>> = { prop: keyof Targets, direction: "asc" | "desc" };
export interface DatabaseSearch<Universe extends UniverseRestriction<Universe>> {
    <
        Entity extends UniverseElement<Universe>,
        Targets extends IndexTargets<Entity>,
        Relations extends FetchNode<Entity>
    >(
        index: Index<Entity, Targets>,
        request: SearchRequest<Entity, Targets> | null, // Null allows unrestricted pagination through entities of given type
        branch: BranchId,
        returning: Any.Cast<Relations, NoExtraProperties<FetchNode<Entity>, Relations>>,
        order?: SearchOrder<Entity, Targets> | AtLeastOne<SearchOrder<Entity, Targets>>,
        limit?: number,
        after?: Id<Entity>
    ): Promise<FetchResponse<Entity, Relations>[]>;
}
