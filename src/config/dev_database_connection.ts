import { ConnectionConfig } from "../api/query_runner/query_runner";

export const devDbConnectionConfig: ConnectionConfig = {
    user: "user",
    host: "localhost",
    database: "data",
    password: "pass",
    port: 5432,
    keepAlive: false,
};
