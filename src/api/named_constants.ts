import { invert } from "lodash";

import { asBranchId, BranchId, masterBranchId, metaBranchId } from "../temporal";
import { anonymousUserId, asUserId, rootUserId, UserId } from "../user";
import { Notional } from "../misc/misc";


const unwrap = <T>(val: Notional<T, any>): T => val;

const namedBranches = {
    [unwrap(masterBranchId)]: 1,
    [unwrap(metaBranchId)]: 2,
} as const;
type NamedBranchId = keyof typeof namedBranches;
type BranchDBId = (typeof namedBranches)[NamedBranchId];
const namedBranchIds = invert(namedBranches);

export const namedBranchId = <T extends NamedBranchId>(val: BranchId<T>): BranchDBId => namedBranches[unwrap(val)];
export const isNamedBranchId = (val: BranchId): val is BranchId<NamedBranchId> => unwrap(val) in namedBranches;
export const isNamedBranchSerializedId = (val: number): val is BranchDBId => String(val) in namedBranchIds;
export const namedBranchById = (val: BranchDBId): BranchId<NamedBranchId> => {
    if (!isNamedBranchSerializedId(val)) { throw new Error(`Not a named branch id: ${ val }`); }
    return asBranchId(namedBranchIds[String(val)]!) as BranchId<NamedBranchId>;
};

const namedUsers = {
    [unwrap(rootUserId)]: 1,
    [unwrap(anonymousUserId)]: 2,
} as const;
type NamedUserId = keyof typeof namedUsers;
type UserDBId = (typeof namedUsers)[NamedUserId];
const namedUserIds = invert(namedUsers);

export const namedUserId = <T extends NamedUserId>(val: UserId<T>): UserDBId => namedUsers[unwrap(val)];
export const isNamedUserId = (val: UserId): val is UserId<NamedUserId> => unwrap(val) in namedUsers;
export const isNamedUserSerializedId = (val: number): val is UserDBId => String(val) in namedUserIds;
export const namedUserById = (val: UserDBId): UserId<NamedUserId> => {
    if (!isNamedUserSerializedId(val)) { throw new Error(`Not a named user id: ${ val }`); }
    return asUserId(namedUserIds[String(val)]!) as UserId<NamedUserId>;
};
