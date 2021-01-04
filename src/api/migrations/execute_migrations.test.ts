import expect = require("expect.js");

import { QueryRunner } from "../query_runner/query_runner_api";
import { getQueryRunner } from "../query_runner/query_runner";
import { executeMigrations, prepare, refColumnName } from "./execute_migrations";
import { migrate } from "./migrations_builder";
import { columnDataType, columnExists, tableExists } from "./database_meta_util";
import { ApplyMigrations } from "./apply_migrations_api";
import {
    DataPrimitive,
    DataPrimitiveOfType, DataPrimitiveType, primitiveBool, primitiveBranch, primitiveBuffer, primitiveEnum,
    primitiveFloat,
    primitiveInt, primitiveLocalDate, primitiveLocalDateTime, primitiveMoney,
    primitiveString, primitiveUser, primitiveVersion
} from "../../definition/primitives";
import { objectKeys } from "../../misc/typeguards";
import { devDbConnectionConfig } from "../../config/dev_database_connection";
import { expectToFail } from "../../misc/test_util";


describe("Execute migrations", () => {
    let queryRunner: QueryRunner;
    beforeEach(async () => {
        queryRunner = await getQueryRunner("tst-execute-migrations", devDbConnectionConfig, true);
        await queryRunner.startTransaction();
        await prepare(queryRunner);
    });

    afterEach(async () => {
        await queryRunner.rollbackTransaction();
    });

    const targetType = "MigrationTestTarget";
    const referenceType = "MigrationTestReference";
    it("Should add types", async () => {
        await executeMigrations(
            queryRunner,
            migrate({})
                .addType(targetType)
                .done()
        );

        expect(await tableExists(queryRunner, targetType)).to.be(true);
        expect(await columnExists(queryRunner, targetType, "id")).to.be(true);
        expect(await columnExists(queryRunner, targetType, "at")).to.be(true);
        expect(await columnExists(queryRunner, targetType, "ts")).to.be(true);
        expect(await columnExists(queryRunner, targetType, "by")).to.be(true);
        expect(await columnExists(queryRunner, targetType, "branch")).to.be(true);
    });

    it("Should remove types", async () => {
        const prerequisites = migrate({})
            .addType(targetType)
            .done();

        await executeMigrations(queryRunner, prerequisites);
        await executeMigrations(
            queryRunner,
            migrate<ApplyMigrations<{}, typeof prerequisites>>({} as any)
                .removeType(targetType)
                .done()
        );

        expect(await tableExists(queryRunner, targetType)).to.be(false);
    });

    it("Should throw if removing a type referenced by external type", async () => {
        return expectToFail(
            () => executeMigrations(
                queryRunner,
                migrate({})
                    .addType(targetType)
                    .addType(referenceType)
                    .addReference(targetType, "ref", referenceType)
                    .removeType(referenceType as any)
                    .done()
            ),
            e => expect(e.message).to.match(/is referenced by/)
        );
    });

    it("Should remove type referencing itself", async () => {
        await executeMigrations(
            queryRunner,
            migrate({})
                .addType(targetType)
                .addReference(targetType, "self", targetType)
                .removeType(targetType)
                .done()
        );

        expect(await tableExists(queryRunner, targetType)).to.be(false);
    });

    it("Should add primitive fields", async () => {
        const primitives: {
            [P in DataPrimitiveType]: {
                primitive: DataPrimitiveOfType<P>,
                expectedDataType: string,
            }
        } = {
            user: {
                primitive: primitiveUser(),
                expectedDataType: "integer",
            },
            branch: {
                primitive: primitiveBranch(),
                expectedDataType: "integer",
            },
            int: {
                primitive: primitiveInt(),
                expectedDataType: "bigint",
            },
            float: {
                primitive: primitiveFloat(),
                expectedDataType: "double precision",
            },
            bool: {
                primitive: primitiveBool(),
                expectedDataType: "boolean",
            },
            buffer: {
                primitive: primitiveBuffer(),
                expectedDataType: "bytea",
            },
            string: {
                primitive: primitiveString(),
                expectedDataType: "text",
            },
            money: {
                primitive: primitiveMoney(),
                expectedDataType: "numeric",
            },
            version: {
                primitive: primitiveVersion(),
                expectedDataType: "bigint",
            },
            local_date: {
                primitive: primitiveLocalDate(),
                expectedDataType: "date",
            },
            local_date_time: {
                primitive: primitiveLocalDateTime(),
                expectedDataType: "timestamp without time zone",
            },
            enum: {
                primitive: primitiveEnum("MigrationTestEnum", ["one", "two", "three"]),
                expectedDataType: "USER-DEFINED",
            },
        };

        await executeMigrations(
            queryRunner,
            migrate({})
                .addType(targetType)
                .addPrimitives(targetType, objectKeys(primitives).reduce((_agg, k) => {
                    _agg[`primitive_${ k }`] = primitives[k].primitive;
                    return _agg;
                }, {} as { [prop: string]: DataPrimitive }))
                .done()
        );

        for (const primitiveType of objectKeys(primitives)) {
            expect(await columnExists(queryRunner, targetType, `primitive_${ primitiveType }`)).to.be(true);
            expect(await columnDataType(queryRunner, targetType, `primitive_${ primitiveType }`)).to.eql(primitives[primitiveType].expectedDataType);
        }
    });

    it("Should throw if added field is not a primitive", async () => {
        return expectToFail(
            () => executeMigrations(
                queryRunner,
                migrate({})
                    .addType(targetType)
                    .addPrimitives(targetType, { prop: 1 as any })
                    .done()
            ),
            e => expect(e.message).to.match(/Expected a data primitive/)
        );
    });

    it("Should add references between types", async () => {
        await executeMigrations(
            queryRunner,
            migrate({})
                .addType(targetType)
                .addType(referenceType)
                .addReference(targetType, "ref", referenceType)
                .done()
        );

        const columnName = refColumnName(`ref`, referenceType);
        expect(await columnExists(queryRunner, targetType, columnName)).to.be(true);
        expect(await columnDataType(queryRunner, targetType, columnName)).to.eql("integer");
    });

    it("Should throw if target type doesn't exists", async () => {
        return expectToFail(
            () => executeMigrations(
                queryRunner,
                migrate({})
                    .addType(targetType)
                    .addReference(targetType, "ref", referenceType as any)
                    .done()
            ),
            e => expect(e.message).to.match(/Unknown target type/)
        );
    });

    it("Should remove fields", async () => {
        await executeMigrations(
            queryRunner,
            migrate({})
                .addType(targetType)
                .addPrimitives(targetType, { prop: primitiveInt() })
                .removeField(targetType, "prop")
                .done()
        );

        expect(await columnExists(queryRunner, targetType, "prop")).to.be(false);
    });

    it("Should rename columns", async () => {
        await executeMigrations(
            queryRunner,
            migrate({})
                .addType(targetType)
                .addPrimitives(targetType, { prop: primitiveInt() })
                .renameField(targetType, "prop", "int")
                .done()
        );

        expect(await columnExists(queryRunner, targetType, "prop")).to.be(false);
        expect(await columnExists(queryRunner, targetType, "int")).to.be(true);
    });


});
