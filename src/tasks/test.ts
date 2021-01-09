import * as gulp from "gulp";
import { execTask } from "./util/execTask";
import { isNotNull, objectKeys } from "../misc/typeguards";

interface TestOpts {
    testSpec?: string;
    noCoverage?: boolean;
    bail?: boolean;
    debugMocha?: boolean;
    noDB?: boolean;
}

export const defaultTestSpec = "'src/**/*.test.ts'";
export default (opts: TestOpts) => {
    const nycExcludes = [
        "**/*.test.ts",
    ];

    const coverageLimits = {
        branches: 100,
        statements: 100,
        functions: 100,
        lines: 100,
    };
    const limitsParams = !opts.testSpec || opts.testSpec === defaultTestSpec
        ? `--check-coverage ${ objectKeys(coverageLimits).map(t => `--${ t }=${ coverageLimits[t] }`).join(" ") }`
        : ""; // Ignore limits when spec is specified

    const nyc = `nyc -r=text -r=html -i ts-node/register -e .ts ${ limitsParams } --include 'src/**' ${ nycExcludes.map(excl => `--exclude '${ excl }'`).join(" ") }`;


    const mochaIncludes = [
        "ts-node/register",
        "reflect-metadata/Reflect",
    ];
    const mocha = `mocha -A ${ opts.bail ? "--bail" : "" } ${ opts.debugMocha ? "--inspect=5252 --inspect-brk" : "" } -t 5000 ${ mochaIncludes.map(incl => `-r ${ incl }`).join(" ") } ${ opts.testSpec || defaultTestSpec }`;

    const mochaPrerequisites = [
        opts.noDB ? null : "start_db",
    ].filter(isNotNull);
    gulp.task("mocha_tests", gulp.series(
        gulp.parallel(mochaPrerequisites),
        execTask(`TS_NODE_TRANSPILE_ONLY=true ${ opts.noCoverage ? "" : nyc } ${ mocha }`, { env: { NODE_OPTIONS: "--max_old_space_size=2048" } })
    ));

    gulp.task("lint", execTask("tslint -c tslint.json -p ./tsconfig.json './src/**/*.ts'"));
    gulp.task("check_only", execTask("./src/tasks/util/check-only.sh"));

    gulp.task("all_tests", gulp.parallel(
        "mocha_tests",
        "check_only",
        "typecheck",
        "lint"
    ));
};
