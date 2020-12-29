import * as gulp from "gulp";
import { execTask } from "./util/execTask";

interface TestOpts {
    testSpec?: string;
    noCoverage?: boolean;
    bail?: boolean;
    debugMocha?: boolean;
}

export const defaultTestSpec = "'src/**/*.test.ts'";
export default (opts: TestOpts) => {
    const nycExcludes = [
        "**.test.ts",
    ];
    const nyc = `nyc -r=text -r=html -i ts-node/register -e .ts --include 'src/**' ${ nycExcludes.map(excl => `--exclude '${ excl }'`).join(" ")}`;

    const mochaIncludes = [
        "ts-node/register",
        "reflect-metadata/Reflect",
    ];
    const mocha = `mocha -A ${ opts.bail ? "--bail" : "" } ${ opts.debugMocha ? "--inspect=5252 --inspect-brk" : "" } -t 5000 ${ mochaIncludes.map(incl => `-r ${ incl }`).join(" ") } ${ opts.testSpec || defaultTestSpec }`;

    gulp.task("mocha_tests", execTask(`TS_NODE_TRANSPILE_ONLY=true ${ opts.noCoverage ? "" : nyc } ${ mocha }`, { env: { NODE_OPTIONS: "--max_old_space_size=2048" } }));
    gulp.task("lint", execTask("tslint -c tslint.json -p ./tsconfig.json './src/**/*.ts'"));
    gulp.task("check_only", execTask("./src/tasks/util/check-only.sh"));

    gulp.task("all_tests", gulp.parallel(
        "mocha_tests",
        "check_only",
        "typecheck",
        "lint"
    ));
};
