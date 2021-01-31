import { UniverseRestriction } from "./universe";
import { IndicesRestriction } from "../definition/index";
import { Database } from "./database_api";
import { createBranching } from "./branch/branch";
import { QueryRunner } from "./query_runner/query_runner_api";
import { createUserApi } from "./user/user";
import { createRead } from "./read/read";
import { createWrite } from "./write/write";


export async function createDatabaseApi<
    Universe extends UniverseRestriction<Universe>,
    Indices extends IndicesRestriction<Universe, Indices>
>(queryRunner: QueryRunner, universe: Universe, _indices: Indices): Promise<Database<Universe, Indices>> {
    return {
        createUser: createUserApi(queryRunner),
        createBranch: createBranching(queryRunner),
        read: createRead(queryRunner, universe),
        write: createWrite(queryRunner, universe),
        search: () => { throw new Error("Search not implemented yet"); },
    };
}
