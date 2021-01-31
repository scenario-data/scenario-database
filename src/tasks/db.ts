import * as gulp from "gulp";
import { runOnce } from "./util/runOnce";
import { execTask } from "./util/execTask";
import { detectLog } from "./util/detectLog";
import { format } from "util";
import { devDbConnectionConfig } from "../config/dev_database_connection";


export default () => {
    // Setup db
    const dbReadyStr = "database system is ready to accept connections";
    const checkDbRunning = (log: string) => {
        const ready = log.indexOf(dbReadyStr) > -1;
        if (!ready) { return false; }

        if (log.indexOf("waiting for server to start...") > -1) {
            // Container was started for the first time and is being inited.
            // Need to wait for database ready _twice._
            return log.lastIndexOf(dbReadyStr) !== log.indexOf(dbReadyStr);
        }

        return ready;
    };
    gulp.task("start_db", runOnce(
        execTask("docker-compose -f ./devcontainer/docker-compose.yml up", {
            background: (stdout, _, started) => detectLog(stdout, checkDbRunning, started),
        })
    ));
    gulp.task("kill_db", execTask("docker-compose -f ./devcontainer/docker-compose.yml down"));

    const connectionString = format(`postgresql://%s:%s@%s:%s/%s`, devDbConnectionConfig.user, devDbConnectionConfig.password, devDbConnectionConfig.host, devDbConnectionConfig.port, devDbConnectionConfig.database);
    gulp.task("dump_db", gulp.series("start_db", execTask(`docker-compose -f ./devcontainer/docker-compose.yml exec -T db pg_dump '${ connectionString }' > ./src/load/dump.sql`)));
    gulp.task("load_db", gulp.series("start_db", execTask(`cat ./src/load/dump.sql | docker-compose -f ./devcontainer/docker-compose.yml exec -T db psql '${ connectionString }'`)));
};
