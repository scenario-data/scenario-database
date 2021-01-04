import * as gulp from "gulp";
import { runOnce } from "./util/runOnce";
import { execTask } from "./util/execTask";
import { detectLog } from "./util/detectLog";


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
};
