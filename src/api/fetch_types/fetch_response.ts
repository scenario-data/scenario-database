import { Defined, KeysHaving } from "../../misc/misc";
import { InternalFKPrimitive, InternalFKPrimitiveResultShape } from "./internal_foreign_keys";
import { DataPrimitive, PrimitiveValue } from "../../definition/primitives";
import { HasMany, HasOne, HasOneInverse } from "../../definition/references";
import { EntityRestriction, Id } from "../../definition/entity";
import { VersionId } from "../../temporal";
import { LocalDateTime } from "js-joda";
import { UserId } from "../../user";
import { FetchNode, InternalFKPrimitiveRequestNode } from "./fetch_node";

type InternalFKPrimitiveResponseNode<Shape, Node> = {
    [P in Exclude<keyof Shape, KeysHaving<InternalFKPrimitive, Shape>>]: Shape[P]
} & {
    [P in Exclude<KeysHaving<InternalFKPrimitive, Shape>, Extract<keyof Defined<Node>, KeysHaving<InternalFKPrimitive, Shape>>>]: PrimitiveValue<Shape[P]>
} & {
    [P in Extract<keyof Defined<Node>, KeysHaving<InternalFKPrimitive, Shape>>]: InternalFKPrimitiveFetchResponseUnchecked<Shape[P], Defined<Node>[P]>
};
type InternalFKPrimitiveFetchResponseUnchecked<T extends InternalFKPrimitive, Node> = InternalFKPrimitiveResponseNode<InternalFKPrimitiveResultShape<T>, Node>;
export type InternalFKPrimitiveFetchResponse<T extends InternalFKPrimitive, Node extends InternalFKPrimitiveRequestNode<T>> = InternalFKPrimitiveFetchResponseUnchecked<T, Node>;

type ResolveResponseNode<T, Node> =
      T extends HasOne<infer One> ? (One extends EntityRestriction<One> ? (Node extends FetchNode<One> ? FetchResponseUnchecked<One, Node> | null : never) : never)
    : T extends HasOneInverse<infer InverseOne, any> ? (InverseOne extends EntityRestriction<InverseOne> ? (Node extends FetchNode<InverseOne> ? FetchResponseUnchecked<InverseOne, Node> : never) : never)
    : T extends HasMany<infer Many, any> ? (Many extends EntityRestriction<Many> ? (Node extends FetchNode<Many> ? FetchResponseUnchecked<Many, Node>[] : never) : never)
    : T extends InternalFKPrimitive ? (InternalFKPrimitiveFetchResponseUnchecked<T, Node> | null)
    : never;
type FetchResponseUnchecked<Entity extends EntityRestriction<Entity>, Request> = {
    // Id and metadata always exist on a fetched node
    id: Id<Entity>;
    at: VersionId;
    ts: LocalDateTime;
    by: UserId;
} & {
    // Primitives are always fetched, unless they represent a internal foreign key and were requested
    [P in Exclude<KeysHaving<DataPrimitive, Entity>, Extract<keyof Defined<Request>, KeysHaving<InternalFKPrimitive, Entity>>>]: PrimitiveValue<Entity[P]> | null
} & {
    // Reference keys will exist if requested
    [P in Extract<keyof Defined<Request>, keyof Entity>]-?: ResolveResponseNode<Entity[P], Defined<Request>[P]>
};
export type FetchResponse<Entity extends EntityRestriction<Entity>, Request extends FetchNode<Entity>> = FetchResponseUnchecked<Entity, Request>;
