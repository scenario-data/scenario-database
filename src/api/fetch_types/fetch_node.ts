import { InternalFKPrimitive, InternalFKPrimitiveResultShape } from "./internal_foreign_keys";
import { KeysHaving } from "../../misc/misc";
import { EntityRestriction } from "../../definition/entity";
import { DataReference, ReferenceTarget } from "../../definition/references";

export type InternalFKPrimitiveRequestNode<T extends InternalFKPrimitive> = FetchNodeUnchecked<InternalFKPrimitiveResultShape<T>>;

type FetchNodeIfEtty<T> = T extends EntityRestriction<T> ? FetchNodeUnchecked<T> : never;
type FetchNodePropHandling<T extends DataReference | InternalFKPrimitive> =
      T extends DataReference ? FetchNodeIfEtty<ReferenceTarget<T>>
    : T extends InternalFKPrimitive ? InternalFKPrimitiveRequestNode<T>
    : never;

type FetchNodeUnchecked<Entity> = { [P in KeysHaving<DataReference | InternalFKPrimitive, Entity>]?: FetchNodePropHandling<Entity[P]> };
export type FetchNode<Entity extends EntityRestriction<Entity>> = FetchNodeUnchecked<Entity>;
