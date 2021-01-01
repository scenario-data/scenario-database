import { Any, Misc, Iteration } from "ts-toolbelt";
type JSPrimitive = Misc.Primitive;

export type NoExtraProperties<Expected, Actual extends Expected> = Any.Compute<ValueHandling<Expected, Actual, Iteration.IterationOf<"0">>>;

type ValueHandling<Expected, Actual extends Expected, Iter extends Iteration.Iteration> =
      Actual extends JSPrimitive ? (Expected extends JSPrimitive ? Actual : never) // Handle the notional types like `string & { $$type: "blah" }`
    : Actual extends ArrayLike<any> ? never // No handling for arrays
    : Actual extends object ? (Expected extends object ? BoundRecursion<Expected, Actual, Iter> : never)
    : Actual;

type BoundRecursion<Expected, Actual extends Expected, Iter extends Iteration.Iteration> = {
    "finish": Actual;
    "proceed": ExcludeExtraProperties<Expected, Actual, Iteration.Next<Iter>>;
}[Iter extends Iteration.IterationOf<"40"> ? "finish" : "proceed"];

type ExcludeExtraProperties<Expected, Actual extends Expected, Iter extends Iteration.Iteration> = {
    [P in Extract<keyof Actual, keyof Expected>]: Actual[P] & ValueHandling<Expected[P], Actual[P], Iter>;
} & {
    [P in Exclude<keyof Actual, keyof Expected>]: never;
};
