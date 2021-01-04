import { UniverseRestriction } from "./universe";
import { DatabaseRead } from "./read/read_api";
import { DatabaseWrite } from "./write/write_api";
import { DatabaseSearch } from "./search/search_api";
import { UserApi } from "./user/user_api";
import { BranchingApi } from "./branch/branch_api";

export interface Database<Universe extends UniverseRestriction<Universe>> {
    createUser: UserApi;
    createBranch: BranchingApi;

    read: DatabaseRead<Universe>;
    write: DatabaseWrite<Universe>;
    search: DatabaseSearch<Universe>;
}
