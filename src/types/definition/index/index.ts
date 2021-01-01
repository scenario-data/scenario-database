import { EntityDef, EntityRestriction } from "../entity";
import { IndexPath } from "./path";
import { ApplicableSearchConditions, KnownSearchConditionTypes } from "./search_conditions";
import { IndexTarget } from "./target";
import { Any } from "ts-toolbelt";
import { AtLeastOne } from "../../../misc/typeguards";


type TargetConditions<Target extends IndexTarget> = AtLeastOne<ApplicableSearchConditions<Target>["type"]>;

export type IndexConstituent<
    Entity extends EntityRestriction<Entity>,
    Target extends IndexTarget,
    Conditions extends TargetConditions<Target>
> = {
    target: IndexPath<Entity, Target>,
    conditions: Conditions,
};

export type IndexTargets<Entity extends EntityRestriction<Entity>> = { [prop: string]: IndexConstituent<Entity, IndexTarget, AtLeastOne<KnownSearchConditionTypes>> };
export type Index<Entity extends EntityRestriction<Entity>, Targets extends IndexTargets<Entity>> = { name: string, entity: EntityDef<Entity>, targets: Targets };

export type IndexConstituentTarget<Constituent extends IndexConstituent<any, any, any>> = Constituent extends IndexConstituent<infer _Entity, infer Target, any> ? Target : never;
export type IndexConstituentConditions<Constituent extends IndexConstituent<any, any, any>> = Constituent extends IndexConstituent<infer _Entity, infer _Target, infer Conditions> ? (Conditions extends ArrayLike<infer I> ? I : never) : never;

type InferConditions<Constituent extends IndexConstituent<any, any, any>> = Constituent extends IndexConstituent<infer _Entity, infer Target, infer Conditions> ? (Conditions extends TargetConditions<Target> ? Conditions : never) : never;
type RecheckConditions<Target extends IndexTarget, Conditions> = Conditions extends TargetConditions<Target> ? Conditions : never;


export type IndexDefinitionFn = {
    <Entity extends EntityRestriction<Entity>, Targets extends IndexTargets<Entity>>(
        name: string,
        entity: EntityDef<Entity>,
        targets: { [P in keyof Targets]: Any.Cast<Targets[P], IndexConstituent<Entity, IndexConstituentTarget<Targets[P]>, RecheckConditions<IndexConstituentTarget<Targets[P]>, InferConditions<Targets[P]>>>> }
    ): Index<Entity, Targets>;
};
