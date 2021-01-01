import { Notional } from "./misc/misc";

export type UserId = Notional<string, "user">;
export const asUserId = (str: string): UserId => str as any;
export const isUserId = (val: unknown): val is UserId => Boolean(val) && typeof val === "string";
export const rootUserId = asUserId("root");
export const anonymousUserId = asUserId("anonymous");
