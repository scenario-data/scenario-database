import { DataPrimitive, PrimitiveTypeValue } from "../primitives";
import { Id } from "../entity";

export type IndexTarget = "id" | DataPrimitive;
export type IndexTargetValue<T extends IndexTarget> =
      T extends DataPrimitive ? PrimitiveTypeValue<T["primitive_type"]>
    : T extends "id" ? Id<any>
    : never;
