import { Misc } from "ts-toolbelt";
type JSPrimitive = Misc.Primitive;

export type PositionalComparison = -1 | 0 | 1;
export type Comparator<T> = (one: T, another: T) => PositionalComparison;

export const toPositionalComparison = (val: number): PositionalComparison => val === 0 ? 0 : (val < 0 ? -1 : 1);
export const compareByReference = <T extends JSPrimitive>(one: T, another: T): PositionalComparison => one === another ? 0 : (one < another ? -1 : 1);


export const nullableComparator = <T>(comparator: Comparator<T>): Comparator<T | null> => (one, another) => {
    if (one === null || another === null) { return one === another ? 0 : (one === null ? -1 : 1); }
    return comparator(one, another);
};
