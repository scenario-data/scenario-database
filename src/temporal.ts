import { doesNotThrow, Notional } from "./misc/misc";
import { serializeBranchId, serializeVersionId } from "./api/db_values/serialize";

export type VersionId = Notional<string, "version">;
export const asVersionId = (str: string): VersionId => str as any;
export const isVersionId = (val: unknown): val is VersionId => Boolean(val) && typeof val === "string" && doesNotThrow(() => serializeVersionId(val as VersionId));

export type BranchId<T extends string = string> = Notional<T, "branch">;
export const asBranchId = (str: string): BranchId => str as any;
export const isBranchId = (val: unknown): val is BranchId => Boolean(val) && typeof val === "string" && doesNotThrow(() => serializeBranchId(val as BranchId));

const namedBranch = <T extends string>(val: T): BranchId<T> => val as any;
export const masterBranchId = namedBranch("master");
export const metaBranchId = namedBranch("meta");
