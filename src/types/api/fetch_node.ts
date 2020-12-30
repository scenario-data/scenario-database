import { InternalFKPrimitive, InternalFKPrimitiveShape } from "./internal_foreign_keys";
import { KeysHaving } from "../util/misc";
import { EntityRestriction } from "../definition/entity";
import { DataRelation, RelationTarget } from "../definition/relations";

export type InternalFKPrimitiveRequestNode<T extends InternalFKPrimitive> = FetchNodeUnchecked<InternalFKPrimitiveShape<T>>;

type FetchNodeIfEtty<T> = T extends EntityRestriction<T> ? FetchNodeUnchecked<T> : never;
type FetchNodePropHandling<T extends DataRelation | InternalFKPrimitive> =
      T extends DataRelation ? FetchNodeIfEtty<RelationTarget<T>>
    : T extends InternalFKPrimitive ? InternalFKPrimitiveRequestNode<T>
    : never;

export type FetchNodeUnchecked<Entity> = { [P in KeysHaving<DataRelation | InternalFKPrimitive, Entity>]?: FetchNodePropHandling<Entity[P]> };
export type FetchNode<Entity extends EntityRestriction<Entity>> = FetchNodeUnchecked<Entity>;
