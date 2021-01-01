import { UniverseRestriction } from "./universe";
import { DatabaseRead } from "./read/read_api";
import { DatabaseWrite } from "./write/write_api";
import { DatabaseSearch } from "./search/search_api";
import { UserId } from "../user";
import { BranchId, VersionId } from "../temporal";

export interface Database<Universe extends UniverseRestriction<Universe>> {
    createUser(createdBy: UserId): Promise<UserId>;
    createBranch(branchFrom: BranchId, createdBy: UserId, startVersion?: VersionId): Promise<BranchId>;

    read: DatabaseRead<Universe>;
    write: DatabaseWrite<Universe>;
    search: DatabaseSearch<Universe>;
}
