import { ApplicableSearchConditions, SearchCondition } from "./search_conditions";
import { IndexTarget } from "./target";
import { Id } from "../entity";
import { primitiveBool, primitiveFloat, primitiveString } from "../primitives";
import { Any, Test } from "ts-toolbelt";

type Check<Expected extends SearchCondition, Actual extends SearchCondition> = Any.Contains<Expected, Actual>;

declare function matches<Expected extends SearchCondition = never>(): <Actual extends SearchCondition>(cond: Actual) => Check<Expected, Actual>;
declare function conditions<T extends IndexTarget>(target: T): ApplicableSearchConditions<T>;

Test.checks([
    matches<SearchCondition<"eq" | "neq", Id<any>>>()(conditions("id")),

    // @ts-expect-error: null comparison not allowed on "id" targets
    matches<SearchCondition<"eq" | "neq", Id<any> | null>>()(conditions("id")),

    matches<SearchCondition<"eq" | "neq", string | null>>()(conditions(primitiveString())),
    matches<SearchCondition<"contains", string>>()(conditions(primitiveString())),

    // @ts-expect-error: `contains` comparison only allowed on string targets
    matches<SearchCondition<"contains", boolean>>()(conditions(primitiveBool())),

    matches<SearchCondition<"eq" | "neq", boolean | null>>()(conditions(primitiveBool())),

    // @ts-expect-error: type mismatch
    matches<SearchCondition<"eq" | "neq", string | null>>()(conditions(primitiveBool())),

    // @ts-expect-error: `lt | gt` comparison doesn't make sense on bool
    matches<SearchCondition<"lt" | "gt", boolean>>()(conditions(primitiveString())),

    matches<SearchCondition<"eq" | "neq", number | null>>()(conditions(primitiveFloat())),
    matches<SearchCondition<"lt" | "gt", number>>()(conditions(primitiveFloat())),
]);
