import { UserId } from "../../user";

export interface UserApi {
    (createdBy: UserId): Promise<UserId>;
}
