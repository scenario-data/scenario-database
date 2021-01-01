import { DataPrimitive } from "../primitives";
import { EntityRestriction } from "../entity";
import { path, Path } from "../../misc/tspath";
import { InternalFKPrimitive, InternalFKPrimitiveShape, InternalFKRef } from "../../api/fetch_types/internal_foreign_keys";
import { KeysHaving } from "../../misc/misc";
import { HasOne } from "../relations";
import { IndexTarget } from "./target";

export type IndexPath<Entity extends EntityRestriction<Entity>, Target extends IndexTarget> = Path<Entity, Target> & { __$$fieldPath: true };
export type IndexPathTarget<P extends IndexPath<any, IndexTarget>> = P extends IndexPath<any, infer Target> ? Target : never;

type InternalFKPathBuilder<From extends EntityRestriction<From>, To extends InternalFKPrimitive> = {
    [P in Exclude<keyof InternalFKPrimitiveShape<To>, "id">]:
          InternalFKPrimitiveShape<To>[P] extends InternalFKRef<infer Target> ? IndexPath<From, Target> & InternalFKPathBuilder<From, Target>
        : InternalFKPrimitiveShape<To>[P] extends DataPrimitive ? IndexPath<From, InternalFKPrimitiveShape<To>[P]>
        : never
};

type IndexPathBuilder<From extends EntityRestriction<From>, To extends EntityRestriction<To>> = {
    [P in KeysHaving<DataPrimitive | HasOne<any>, To>]:
          To[P] extends InternalFKPrimitive ? IndexPath<From, To[P]> & InternalFKPathBuilder<From, To[P]>
        : To[P] extends DataPrimitive ? IndexPath<From, To[P]>
        : To[P] extends HasOne<infer One> ? (One extends EntityRestriction<One> ? IndexPathBuilder<From, One> : never)
        : never
} & {
    id: IndexPath<From, "id">;
};

export function indexPath<T extends EntityRestriction<T>>(): IndexPathBuilder<T, T> { return path<any>() as any; }
