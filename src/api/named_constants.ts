import { invert } from "lodash";

import { BranchId, masterBranchId, metaBranchId } from "../temporal";
import { anonymousUserId, rootUserId, UserId } from "../user";
import { Notional } from "../misc/misc";


const unwrap = <T>(val: Notional<T, any>): T => val;

const namedBranches = {
    [unwrap(masterBranchId)]: 1,
    [unwrap(metaBranchId)]: 2,
} as const;
type BranchDBId = (typeof namedBranches)[keyof typeof namedBranches];
const namedBranchIds = invert(namedBranches);

export const namedBranchId = <T extends keyof typeof namedBranches>(val: BranchId<T>) => namedBranches[unwrap(val)];
export const isNamedBranchId = (val: BranchDBId) => String(val) in namedBranchIds;
export const namedBranchById = (val: BranchDBId) => {
    if (!isNamedBranchId(val)) { throw new Error(`Not a named branch id: ${ val }`); }
    return namedBranchIds[String(val)];
};

const namedUsers = {
    [unwrap(rootUserId)]: 1,
    [unwrap(anonymousUserId)]: 2,
} as const;
type UserDBId = (typeof namedUsers)[keyof typeof namedUsers];
const namedUserIds = invert(namedUsers);

export const namedUserId = <T extends keyof typeof namedUsers>(val: UserId<T>) => namedUsers[unwrap(val)];
export const isNamedUserId = (val: UserDBId) => String(val) in namedUserIds;
export const namedUserById = (val: UserDBId) => {
    if (!isNamedUserId(val)) { throw new Error(`Not a named user id: ${ val }`); }
    return namedUserIds[String(val)];
};
