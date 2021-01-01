import { UniverseRestriction } from "./universe";
import { DatabaseRead } from "./read";
import { DatabaseWrite } from "./write";
import { DatabaseSearch } from "./search";
import { UserId } from "../user";
import { BranchId, VersionId } from "../temporal";

export interface Database<Universe extends UniverseRestriction<Universe>> {
    createUser(createdBy: UserId): Promise<UserId>;
    createBranch(branchFrom: BranchId, createdBy: UserId, startVersion?: VersionId): Promise<BranchId>;

    read: DatabaseRead<Universe>;
    write: DatabaseWrite<Universe>;
    search: DatabaseSearch<Universe>;
}
