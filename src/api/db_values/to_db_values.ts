import { Id } from "../../definition/entity";
import { BranchId, VersionId } from "../../temporal";
import { UserId } from "../../user";
import {
    isNamedBranchId,
    isNamedUserId,
    namedBranchId,
    namedUserId
} from "../named_constants";

// tslint:disable-next-line:no-unnecessary-callback-wrapper — preserve types
export const serializeId = (id: Id<any>): number => Number(id);

// tslint:disable-next-line:no-unnecessary-callback-wrapper — preserve types
export const serializeVersionId = (version: VersionId): number => Number(version);

export const serializeUserId = (userId: UserId): number => isNamedUserId(userId) ? namedUserId(userId) : Number(userId);
export const serializeBranchId = (branchId: BranchId): number => isNamedBranchId(branchId) ? namedBranchId(branchId) : Number(branchId);
