import { Notional } from "./misc/misc";

export type UserId<T extends string = string> = Notional<T, "user">;
export const asUserId = (str: string): UserId => str as any;
export const isUserId = (val: unknown): val is UserId => Boolean(val) && typeof val === "string";

const namedUser = <T extends string>(val: T): UserId<T> => val as any;
export const rootUserId = namedUser("root");
export const anonymousUserId = namedUser("anonymous");
