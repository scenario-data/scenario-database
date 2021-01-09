import { once } from "lodash";
import { Client, ClientConfig, Pool, PoolClient } from "pg";
import { QueryPlaceholderValue, QueryRunner, TransactionIsolationLevel, TransactionStatus } from "./query_runner_api";
import { objectKeys } from "../../misc/typeguards";

export type ConnectionConfig = ClientConfig;

export const getPool = once((config: ConnectionConfig) => new Pool(config));
export const getPoolClient = (config: ConnectionConfig) => getPool(config).connect();
const getStandaloneClient = async (config: ConnectionConfig) => {
    const c = new Client(config);
    await c.connect();
    return c;
};

const _isolationLevels: {[P in TransactionIsolationLevel]: null} = {
    "READ UNCOMMITTED": null,
    "READ COMMITTED": null,
    "REPEATABLE READ": null,
    SERIALIZABLE: null,
};
const isolationLevels = objectKeys(_isolationLevels);

const NEWLINE_RE = /\n/g;
const WHITESPACE_RE = /\s+/g;
const formatQuery = (query: string): string => query.replace(NEWLINE_RE, " ").replace(WHITESPACE_RE, " ").trim(); // TODO: better formatting?

export const getQueryRunnerForClient = (logId: string, client: Client | PoolClient): QueryRunner => {
    let released = false;
    let transactionStatus: TransactionStatus = TransactionStatus.NoTransaction;

    const runner: QueryRunner = {
        async query(queryString: string, parameters?: ReadonlyArray<QueryPlaceholderValue>) {
            if (released) { throw new Error("Can't run a query on a released query runner"); }

            // tslint:disable-next-line:no-console // TODO: better logging
            console.log(logId, formatQuery(queryString), JSON.stringify(parameters));

            try {
                return await client.query(queryString, [...(parameters || [])]);
            } catch (e) {
                await runner.release(e);
                return Promise.reject(e);
            }
        },

        async startTransaction(level = "READ COMMITTED") {
            if (isolationLevels.indexOf(level) === -1) { throw new Error(`Unexpected isolation level: ${ level }`); }
            if (transactionStatus !== TransactionStatus.NoTransaction) { throw new Error("Transaction was already started"); }
            transactionStatus = TransactionStatus.Started;

            try {
                await runner.query(`START TRANSACTION ISOLATION LEVEL ${ level }`);
            } catch (e) {
                await runner.release(e);
                return Promise.reject(e);
            }
        },

        async commitTransaction() {
            if (transactionStatus !== TransactionStatus.Started) { throw new Error("Can not commit a transaction that wasn't started"); }
            transactionStatus = TransactionStatus.Committed;

            try {
                await runner.query("COMMIT TRANSACTION");
                await runner.release();
            } catch (e) {
                await runner.release(e);
                return Promise.reject(e);
            }
        },

        async rollbackTransaction() {
            if (transactionStatus !== TransactionStatus.Started) { throw new Error("Can not roll back a transaction that wasn't started"); }
            transactionStatus = TransactionStatus.Rejected;

            try {
                await runner.query("ROLLBACK TRANSACTION");
                await runner.release();
            } catch (e) {
                await runner.release(e);
                return Promise.reject(e);
            }
        },

        transactionStatus() {
            return transactionStatus;
        },

        isReleased() { return released; },
        async release(error) {
            if (error) {
                // tslint:disable-next-line:no-console
                console.log(logId, error); // TODO: better logging
            }

            if (released) { return; }
            released = true;

            if ("release" in client) {
                client.release(error);
            } else {
                await client.end();
            }
        },
    };

    return runner;
};

export const getQueryRunner = async (logId: string, config: ConnectionConfig, standalone?: boolean): Promise<QueryRunner> => {
     // istanbul ignore next
    const client = await (standalone ? getStandaloneClient(config) : getPoolClient(config));
    return getQueryRunnerForClient(logId, client);
};
