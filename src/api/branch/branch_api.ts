import { BranchId, VersionId } from "../../temporal";
import { UserId } from "../../user";

export interface BranchingApi {
    (branchFrom: BranchId, createdBy: UserId, startVersion?: VersionId): Promise<BranchId>;
}
