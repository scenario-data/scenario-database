import { isInteger as _isInteger } from "lodash";
import { LocalDate, LocalDateTime } from "js-joda";

export function objectKeys<T extends object>(obj: T): Array<Exclude<{ [P in keyof T]: P }[keyof T], undefined>> { return Object.keys(obj) as any; }

export function isNot<In, Out extends In>(guard: (val: In) => val is Out) { return <T extends In>(val: T | Out): val is T => !guard(val); }
export function isProp<In, Out extends In, K extends keyof any>(prop: K, guard: (val: In) => val is Out) { return <T extends { [P in K]: In | Out }>(val: T): val is T & { [P in K]: Out } => guard(val[prop]) as any; }
export function nullableGuard<In, Out extends In>(guard: (val: In) => val is Out) { return (val: In | null): val is Out | null => val === null ? true : guard(val); }

export const isNull = (val: unknown): val is null => val === null;
export const isNotNull = isNot(isNull);

export const isUndefined = (val: unknown): val is undefined => val === undefined;
export const isString = (val: any): val is string => typeof val === "string";
export const isNumber = (val: unknown): val is number => typeof val === "number";
export const isInteger = (x: any): x is number => typeof x === "number" && _isInteger(x);
export const isBoolean = (val: unknown): val is boolean => typeof val === "boolean";
export const isBuffer = (val: unknown): val is Buffer => Buffer.isBuffer(val);
export const isLocalDate = (x: any): x is LocalDate => x && typeof x === "object" && x instanceof LocalDate;
export const isLocalDateTime = (x: any): x is LocalDateTime => x && typeof x === "object" && x instanceof LocalDateTime;
export const isArrayOf = <T>(check: (val: any) => val is T) => (val: any[]): val is T[] => val.every(check);


export const identity = <T>(x: T): T => x;
export type AtLeastOne<T> = [T, ...T[]];
export function atLeastOne<T>(arr: readonly T[]): AtLeastOne<T> {
    if (arr.length === 0) { throw new Error("Empty array"); }
    return [arr[0]!, ...arr.slice(1)];
}

export const nevah = (x: never): never => { throw new Error(`Unexpected: ${ JSON.stringify(x) }`); };
