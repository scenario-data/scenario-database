import { Defined, KeysHaving } from "../util/misc";
import { InternalFKPrimitive, InternalFKPrimitiveShape } from "./internal_foreign_keys";
import { DataPrimitive, PrimitiveValue } from "../definition/primitives";
import { HasMany, HasOne } from "../definition/relations";
import { EntityRestriction, Id } from "../definition/entity";
import { VersionId } from "../temporal";
import { LocalDateTime } from "js-joda";
import { UserId } from "../user";
import { FetchNodeUnchecked, InternalFKPrimitiveRequestNode } from "./fetch_node";

type InternalFKPrimitiveResponseNode<Shape, Node> = {
    [P in Exclude<keyof Shape, KeysHaving<InternalFKPrimitive, Shape>>]: Shape[P]
} & {
    [P in Exclude<KeysHaving<InternalFKPrimitive, Shape>, Extract<keyof Defined<Node>, KeysHaving<InternalFKPrimitive, Shape>>>]: PrimitiveValue<Shape[P]>
} & {
    [P in Extract<keyof Defined<Node>, KeysHaving<InternalFKPrimitive, Shape>>]: InternalFKPrimitiveFetchResponseUnchecked<Shape[P], Defined<Node>[P]>
};
type InternalFKPrimitiveFetchResponseUnchecked<T extends InternalFKPrimitive, Node> = InternalFKPrimitiveResponseNode<InternalFKPrimitiveShape<T>, Node>;
export type InternalFKPrimitiveFetchResponse<T extends InternalFKPrimitive, Node extends InternalFKPrimitiveRequestNode<T>> = InternalFKPrimitiveFetchResponseUnchecked<T, Node>;

type ResolveResponseNode<T, Node> =
      T extends HasOne<infer One> ? (Node extends FetchNodeUnchecked<One> ? (One extends EntityRestriction<One> ? FetchResponseUnchecked<One, Node> | null : never) : never)
    : T extends HasMany<infer Many, any> ? (Node extends FetchNodeUnchecked<Many> ? (Many extends EntityRestriction<Many> ? FetchResponseUnchecked<Many, Node>[] : never) : never)
    : T extends InternalFKPrimitive ? InternalFKPrimitiveFetchResponseUnchecked<T, Node>
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
    // Relation keys will exist if requested
    [P in Extract<keyof Defined<Request>, keyof Entity>]-?: ResolveResponseNode<Entity[P], Defined<Request>[P]>
};
export type FetchResponse<Entity extends EntityRestriction<Entity>, Request extends FetchNodeUnchecked<Entity>> = FetchResponseUnchecked<Entity, Request>;
