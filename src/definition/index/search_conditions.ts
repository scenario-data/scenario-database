import {
    DataPrimitive,
    PrimitiveFloat,
    PrimitiveInt,
    PrimitiveLocalDate, PrimitiveLocalDateTime,
    PrimitiveMoney,
    PrimitiveString
} from "../primitives";
import { IndexTarget, IndexTargetValue } from "./target";

type FindMatching<Conditions extends SingleConditionDef, Target extends IndexTarget> = Conditions extends (infer Cond) ? Cond extends SingleConditionDef ? Target extends Cond["matches"] ? Cond["def"] : never : never : never;
export type ApplicableSearchConditions<Target extends IndexTarget> = FindMatching<SearchConditionDef<IndexTargetValue<Target>>, Target>;
export type KnownSearchConditionTypes = SearchConditionDef<any>["def"]["type"];


// export type SearchConditionsByType<Type extends KnownSearchConditionTypes, Value> = Extract<SearchConditionDef<Value>, {  def: { type: Type } }>["def"];
export type SearchConditionsByType<Type extends KnownSearchConditionTypes, Value> = SearchConditionDef<Value> extends (infer One) ? (One extends SingleConditionDef ? (Type extends One["def"]["type"] ? One["def"] : never) : never) : never;

export type SearchCondition<Type extends string = string, Value = any> = { type: Type, val: Value };
type SingleConditionDef = {
    def: SearchCondition,
    matches: IndexTarget,
};

type SearchConditionDef<Value> =
    {
        def: { type: "eq" | "neq", val: Value },
        matches: "id";
    }
    | {
        def: { type: "eq" | "neq", val: Value | null },
        matches: DataPrimitive;
    }
    | {
        def: { type: "lt" | "gt", val: Value },
        matches: PrimitiveFloat | PrimitiveMoney | PrimitiveInt | PrimitiveLocalDate | PrimitiveLocalDateTime;
    }
    | {
        def: { type: "contains", val: Value },
        matches: PrimitiveString;
    };
