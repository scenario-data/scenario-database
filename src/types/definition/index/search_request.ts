import { EntityRestriction } from "../entity";
import { IndexConstituentConditions, IndexConstituentTarget, IndexTargets } from "./index";
import { SearchConditionsByType } from "./search_conditions";
import { IndexTargetValue } from "./target";

export type SearchDataRequest<Entity extends EntityRestriction<Entity>, Targets extends IndexTargets<Entity>, P extends keyof Targets> = { type: "data", field: P, request: SearchConditionsByType<IndexConstituentConditions<Targets[P]>, IndexTargetValue<IndexConstituentTarget<Targets[P]>>> };

export type SearchOr<Entity extends EntityRestriction<Entity>, Targets extends IndexTargets<Entity>> = { type: "or", requests: [SearchRequest<Entity, Targets>, SearchRequest<Entity, Targets>] };
export type SearchAnd<Entity extends EntityRestriction<Entity>, Targets extends IndexTargets<Entity>> = { type: "and", requests: [SearchRequest<Entity, Targets>, SearchRequest<Entity, Targets>] };
export type CombinableSearchRequest<Entity extends EntityRestriction<Entity>, Targets extends IndexTargets<Entity>> = SearchOr<Entity, Targets> | SearchAnd<Entity, Targets>;

export type SearchRequest<Entity extends EntityRestriction<Entity>, Targets extends IndexTargets<Entity>> = CombinableSearchRequest<Entity, Targets> | SearchDataRequest<Entity, Targets, keyof Targets>;


type SearchBuilderStep<Entity extends EntityRestriction<Entity>, Targets extends IndexTargets<Entity>> = SearchRequest<Entity, Targets> & IndexRequestBuilder<Entity, Targets>;
export interface IndexRequestBuilder<Entity extends EntityRestriction<Entity>, Targets extends IndexTargets<Entity>> {
    and(c1: SearchRequest<Entity, Targets>, c2: SearchRequest<Entity, Targets>): SearchBuilderStep<Entity, Targets>;
    or(c1: SearchRequest<Entity, Targets>, c2: SearchRequest<Entity, Targets>): SearchBuilderStep<Entity, Targets>;
    data<P extends keyof Targets>(field: P, val: SearchConditionsByType<IndexConstituentConditions<Targets[P]>, IndexTargetValue<IndexConstituentTarget<Targets[P]>>>): SearchDataRequest<Entity, Targets, P>;
}
