import { invert, once } from "lodash";

import { asBranchId, BranchId, masterBranchId, metaBranchId } from "../temporal";
import { anonymousUserId, asUserId, rootUserId, UserId } from "../user";
import { Notional } from "../misc/misc";


const unwrap = <T>(val: Notional<T, any>): T => val;
const getNamedBranches = once(() => ({
    [unwrap(masterBranchId)]: 1,
    [unwrap(metaBranchId)]: 2,
} as const));
type NamedBranchId = keyof ReturnType<typeof getNamedBranches>;
type BranchDBId = ReturnType<typeof getNamedBranches>[NamedBranchId];
const getNamedBranchIds = once(() => invert(getNamedBranches()));

export const namedBranchId = <T extends NamedBranchId>(val: BranchId<T>): BranchDBId => getNamedBranches()[unwrap(val)];
export const isNamedBranchId = (val: BranchId): val is BranchId<NamedBranchId> => unwrap(val) in getNamedBranches();
export const isNamedBranchSerializedId = (val: number): val is BranchDBId => String(val) in getNamedBranchIds();
export const namedBranchById = (val: BranchDBId): BranchId<NamedBranchId> => {
    if (!isNamedBranchSerializedId(val)) { throw new Error(`Not a named branch id: ${ val }`); }
    return asBranchId(getNamedBranchIds()[String(val)]!) as BranchId<NamedBranchId>;
};

const getNamedUsers = once(() => ({
    [unwrap(rootUserId)]: 1,
    [unwrap(anonymousUserId)]: 2,
} as const));
type NamedUserId = keyof ReturnType<typeof getNamedUsers>;
type UserDBId = ReturnType<typeof getNamedUsers>[NamedUserId];
const getNamedUserIds = once(() => invert(getNamedUsers()));

export const namedUserId = <T extends NamedUserId>(val: UserId<T>): UserDBId => getNamedUsers()[unwrap(val)];
export const isNamedUserId = (val: UserId): val is UserId<NamedUserId> => unwrap(val) in getNamedUsers();
export const isNamedUserSerializedId = (val: number): val is UserDBId => String(val) in getNamedUserIds();
export const namedUserById = (val: UserDBId): UserId<NamedUserId> => {
    if (!isNamedUserSerializedId(val)) { throw new Error(`Not a named user id: ${ val }`); }
    return asUserId(getNamedUserIds()[String(val)]!) as UserId<NamedUserId>;
};
