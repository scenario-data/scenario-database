import expect = require("expect.js");

import { QueryRunner } from "../query_runner/query_runner_api";
import { getQueryRunner } from "../query_runner/query_runner";
import { devDbConnectionConfig } from "../../config/dev_database_connection";
import { executeMigrations, prepare } from "../migrations/execute_migrations";
import { entity, isId } from "../../definition/entity";
import { generateMigrations } from "../migrations/generate_migrations";
import { createWrite, tempId } from "./write";
import { isVersionId, masterBranchId } from "../../temporal";
import { rootUserId } from "../../user";
import { atLeastOne } from "../../misc/typeguards";
import { LocalDateTime } from "js-joda";
import { primitiveString } from "../../definition/primitives";
import { hasOne, hasOneInverse } from "../../definition/references";
import { expectToFail } from "../../misc/test_util";


describe("Database write", () => {
    let queryRunner: QueryRunner;
    beforeEach(async () => {
        queryRunner = await getQueryRunner("tst-write-api", devDbConnectionConfig, true);
        await queryRunner.startTransaction();
        await prepare(queryRunner);
    });

    afterEach(async () => {
        if (!queryRunner.isReleased()) { await queryRunner.rollbackTransaction(); }
    });

    it("Should create new entities when given an object without id", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: {},
                    values: [
                        {}, // Empty object without id — creates a new entity
                    ],
                },
            }
        );

        const item = atLeastOne(create)[0];
        expect(item).to.have.property("id");
        expect(isId(item.id)).to.be(true);

        expect(item).to.have.property("ts");
        expect(item.ts.isAfter(LocalDateTime.now().minusMinutes(1))).to.be(true);

        expect(item).to.have.property("by");
        expect(item.by).to.eql(rootUserId);

        expect(item).to.have.property("at");
        expect(isVersionId(item.at)).to.be(true);
    });

    it("Should write props onto new entities", async () => {
        @entity() class Target { public prop = primitiveString(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const val = "some value";

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: {},
                    values: [
                        { prop: val },
                    ],
                },
            }
        );

        expect(atLeastOne(create)[0]).to.have.property("prop", val);
    });

    it("Should create multiple new entities when given multiple values", async () => {
        @entity() class Target { public prop = primitiveString(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const val1 = "some value 1";
        const val2 = "some value 2";

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: {},
                    values: [
                        { prop: val1 },
                        { prop: val2 },
                    ],
                },
            }
        );

        const [item1, item2] = create;
        expect(item1).to.have.property("prop", val1);
        expect(item2).to.have.property("prop", val2);
    });

    it("Should update entities when given an object with id", async () => {
        @entity() class Target { public prop = primitiveString(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: {},
                    values: [{ prop: "prev value" }],
                },
            }
        );

        const newValue = "new value";
        const itemId = atLeastOne(create)[0].id;
        const { update } = await write(
            masterBranchId,
            rootUserId, {
                update: {
                    type: Target,
                    returning: {},
                    values: [
                        {
                            id: itemId,
                            prop: newValue,
                        },
                    ],
                },
            }
        );

        const item = atLeastOne(update)[0];
        expect(item.id).to.eql(itemId);
        expect(item.prop).to.eql(newValue);
    });

    it("Should handle mixed create/update", async () => {
        @entity() class Target { public prop = primitiveString(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const val1 = "some value 1";
        const val2 = "some value 2";

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: {},
                    values: [{ prop: "prev value" }],
                },
            }
        );

        const existingItemId = atLeastOne(create)[0].id;
        const { update } = await write(
            masterBranchId,
            rootUserId, {
                update: {
                    type: Target,
                    returning: {},
                    values: [
                        { prop: val1 },
                        { id: existingItemId, prop: val2 },
                    ],
                },
            }
        );

        const [item1, item2] = update;
        expect(item1).to.have.property("prop", val1);
        expect(item2).to.have.property("prop", val2);
        // TODO: uncomment: expect(item1?.at).to.eql(item2?.at); // Check all entries are inserted at same version
    });

    it("Should create referred entities when they are given without id", async () => {
        @entity() class Target { public ref = hasOne(() => Reference); }
        @entity() class Reference { public prop = primitiveString(); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const val = "prop value";

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: { ref: {} },
                    values: [{ ref: { prop: val } }],
                },
            }
        );

        const item = atLeastOne(create)[0];
        expect(item.ref).to.have.property("prop", val);
    });

    it("Should preserve unchanged properties", async () => {
        @entity() class Target {
            public p1 = primitiveString();
            public p2 = primitiveString();
        }

        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const preserved = "preserved";
        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: {},
                    values: [{ p1: preserved }],
                },
            }
        );
        const itemId = atLeastOne(create)[0].id;

        const { update } = await write(
            masterBranchId,
            rootUserId, {
                update: {
                    type: Target,
                    returning: {},
                    values: [{
                        id: itemId,
                        p2: "something",
                    }],
                },
            }
        );

        const updatedItem = atLeastOne(update)[0];
        expect(updatedItem).to.have.property("p1", preserved);
    });

    it("Should assign same db id to entities marked with same temp id", async () => {
        @entity() class Target { public ref = hasOne(() => Reference); }
        @entity() class Reference {} // tslint:disable-line:no-unnecessary-class

        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const { ref, targets } = await write(
            masterBranchId,
            rootUserId, {
                ref: {
                    type: Reference,
                    returning: {},
                    values: [{ id: tempId("ref") }],
                },
                targets: {
                    type: Target,
                    returning: { ref: {} },
                    values: [
                        { ref: { id: tempId("ref") } },
                        { ref: { id: tempId("ref") } },
                    ],
                },
            }
        );

        const refId = atLeastOne(ref)[0].id;
        expect(targets[0]?.ref?.id).to.eql(refId);
        expect(targets[1]?.ref?.id).to.eql(refId);
    });

    it("Should throw if entity id does not match the expected type", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        return expectToFail(
            () => write(
                masterBranchId,
                rootUserId, { create: {
                    type: Target,
                    returning: {},
                    values: [{ id: Buffer.from("whatever") as any }],
                } }
            ),
            e => expect(e.message).to.match(/Entity id may only be an entity id, undefined or a temp id/)
        );
    });

    it("Should throw if entity has unknown properties", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        return expectToFail(
            () => write(
                masterBranchId,
                rootUserId, { create: {
                    type: Target,
                    returning: {},
                    values: [{ whatever: Buffer.from("whatever") } as any],
                } }
            ),
            e => expect(e.message).to.match(/Unknown property/)
        );
    });

    it("Should accept read result as a valid write value", async () => {
        @entity() class Target { public prop = primitiveString(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: {},
                    values: [{ prop: "initial" }],
                },
            }
        );
        const item = atLeastOne(create)[0];

        const updatedVal = "updated";
        const { update } = await write(
            masterBranchId,
            rootUserId, {
                update: {
                    type: Target,
                    returning: {},
                    values: [{ ...item, prop: updatedVal }],
                },
            }
        );

        expect(atLeastOne(update)[0]).to.have.property("prop", updatedVal);
    });

    it("Should throw if save request contains conflicting edits", async () => {
        @entity() class Target { public ref = hasOne(() => Reference); }
        @entity() class Reference { public tgt = hasOneInverse(() => Target, "ref"); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        return expectToFail(
            () => write(
                masterBranchId,
                rootUserId, {
                    create: {
                        type: Target,
                        returning: {},
                        values: [{
                            // Create new `Target`
                            ref: {
                                // ...with a new `Reference`
                                tgt: {
                                    // ...pointing to another `Target`,
                                    // except this is an inverse relation,
                                    // which causes two `Target`s to conflict.
                                },
                            },
                        }],
                    },
                }
            ),
            e => expect(e.message).to.match(/conflict/i)
        );
    });
});
