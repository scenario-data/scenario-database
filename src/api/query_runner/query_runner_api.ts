import { Any, Iteration, Number, List, Boolean } from "ts-toolbelt";

export enum TransactionStatus {
    NoTransaction,
    Started,
    Committed,
    Rejected,
}

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Placeholder = `$${ Digit }`;
type ContainsPlaceholder = `${ string }${ Placeholder }${ string }`;

type _CountPlaceholders<T extends string, Iter extends Iteration.Iteration = Iteration.IterationOf<"0">> = T extends `${ infer Head }${ Placeholder }${ string }` ? _CountPlaceholders<Head, Iteration.Next<Iter>> : Iteration.Format<Iter, "s">;
type CountPlaceholders<T extends string> = Number.Max<_CountPlaceholders<T>>;

export type QueryPlaceholderValue = string | number;
type PlaceholderParam<T extends string> = List.Readonly<List.Repeat<QueryPlaceholderValue, CountPlaceholders<T>>>;

type QueryResult = { rows: { [column: string]: any; }[] };
type QueryParams<T extends string> = Any.IsLiteral<T, string> extends Boolean.True ? T extends ContainsPlaceholder ? [val: T, params: PlaceholderParam<T>] : [val: T] : ([val: T] | [val: T, params: ReadonlyArray<string>]);
interface Query { <T extends string>(...val: QueryParams<T>): Promise<QueryResult>; }

export type TransactionIsolationLevel = "SERIALIZABLE" | "REPEATABLE READ" | "READ COMMITTED" | "READ UNCOMMITTED";

export interface QueryRunner {
    query: Query;

    startTransaction: (level?: TransactionIsolationLevel) => Promise<void>;
    commitTransaction: () => Promise<void>;
    rollbackTransaction: () => Promise<void>;
    transactionStatus: () => TransactionStatus;

    release: (error?: Error | boolean) => Promise<void>;
}
