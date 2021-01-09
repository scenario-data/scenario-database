import pgFormatOriginal = require("pg-format");
import { Any, Boolean, Iteration, List, Number } from "ts-toolbelt";

type Placeholder = "%%" | "%I" | "%L" | "%s";
type _CountPlaceholders<T extends string, Iter extends Iteration.Iteration = Iteration.IterationOf<"0">> = T extends `${ string }${ Placeholder }${ infer Tail }` ? _CountPlaceholders<Tail, Iteration.Next<Iter>> : Iteration.Format<Iter, "s">;
type CountPlaceholders<T extends string> = Number.Max<_CountPlaceholders<T>>;

type PlaceholderPrimitiveValue = string | number | boolean | null;
type PlaceholderValue = PlaceholderPrimitiveValue | ReadonlyArray<PlaceholderPrimitiveValue> | ReadonlyArray<ReadonlyArray<PlaceholderPrimitiveValue>>;
type PlaceholderParam<T extends string> = List.Readonly<List.Repeat<PlaceholderValue, CountPlaceholders<T>>>;


type FormatParams<T extends string> = Any.IsLiteral<T, string> extends Boolean.True
    ? (CountPlaceholders<T> extends "0" ? [`format string must contain placeholders: ${ Placeholder }`, ...any[]] : [val: T, params: PlaceholderParam<T>])
    : [val: T, params: ReadonlyArray<PlaceholderValue>];
export interface PgFormat { <T extends string>(...params: FormatParams<T>): string; }
export const pgFormat: PgFormat = ((val: string, params?: ReadonlyArray<PlaceholderValue>) => pgFormatOriginal(val, ...(params || /* istanbul ignore next */[]))) as any;
