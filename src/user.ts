import { doesNotThrow, Notional } from "./misc/misc";
import { serializeUserId } from "./api/db_values/serialize";

export type UserId<T extends string = string> = Notional<T, "user">;
export const asUserId = (str: string): UserId => str as any;
export const isUserId = (val: unknown): val is UserId => Boolean(val) && typeof val === "string" && doesNotThrow(() => serializeUserId(val as UserId));

const namedUser = <T extends string>(val: T): UserId<T> => val as any;
export const rootUserId = namedUser("root");
export const anonymousUserId = namedUser("anonymous");
