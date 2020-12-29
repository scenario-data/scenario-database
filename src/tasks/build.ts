import * as gulp from "gulp";
import { execTask } from "./util/execTask";
import { runOnce } from "./util/runOnce";

export default () => {
    gulp.task("typecheck", runOnce(execTask("tsc -p tsconfig.json --noEmit")));
};
