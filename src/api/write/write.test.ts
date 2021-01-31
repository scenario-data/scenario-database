import expect = require("expect.js");

import { QueryRunner } from "../query_runner/query_runner_api";
import { getQueryRunner } from "../query_runner/query_runner";
import { devDbConnectionConfig } from "../../config/dev_database_connection";
import { executeMigrations, prepare } from "../migrations/execute_migrations";
import { entity, isId } from "../../definition/entity";
import { generateMigrations } from "../migrations/generate_migrations";
import { createWrite, transientId } from "./write";
import { isVersionId, masterBranchId } from "../../temporal";
import { rootUserId } from "../../user";
import { atLeastOne } from "../../misc/typeguards";
import { LocalDate, LocalDateTime } from "js-joda";
import { primitiveLocalDate, primitiveString } from "../../definition/primitives";
import { hasMany, hasOne, hasOneInverse } from "../../definition/references";
import { expectToFail } from "../../misc/test_util";
import { createBranching } from "../branch/branch";
import { createRead } from "../read/read";
import { createUserApi } from "../user/user";


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
        expect(item1?.at).to.eql(item2?.at); // Check all entries are inserted at same version
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

    it("Should assign same db id to entities marked with same transient id", async () => {
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
                    values: [{ id: transientId("ref") }],
                },
                targets: {
                    type: Target,
                    returning: { ref: {} },
                    values: [
                        { ref: { id: transientId("ref") } },
                        { ref: { id: transientId("ref") } },
                    ],
                },
            }
        );

        const refId = atLeastOne(ref)[0].id;
        expect(targets[0]?.ref?.id).to.eql(refId);
        expect(targets[1]?.ref?.id).to.eql(refId);
    });

    it("Should update references", async () => {
        @entity() class Target { public ref = hasOne(() => Reference); }
        @entity() class Reference { public prop = primitiveString(); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: { ref: {} },
                    values: [{ ref: { prop: "initial" } }],
                },
            }
        );

        const createdItem = atLeastOne(create)[0];
        const { update } = await write(
            masterBranchId,
            rootUserId, {
                update: {
                    type: Target,
                    returning: { ref: {} },
                    values: [
                        {
                            id: createdItem.id,
                            ref: { prop: "changed" },
                        },
                    ],
                },
            }
        );

        const updatedItem = atLeastOne(update)[0];
        expect(updatedItem.ref?.id).to.not.eql(createdItem.ref?.id);
        expect(createdItem.ref?.prop).to.eql("initial");
        expect(updatedItem.ref?.prop).to.eql("changed");
    });

    it("Should create to-many references", async () => {
        @entity() class Target { public refs = hasMany(() => Reference, "tgt"); }
        @entity() class Reference { public tgt = hasOne(() => Target); public prop = primitiveString(); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: { refs: {} },
                    values: [{ refs: [
                        { prop: "ref1" },
                        { prop: "ref2" },
                    ] }],
                },
            }
        );

        const item = atLeastOne(create)[0];
        expect(item.refs).to.have.length(2);

        const values = item.refs.map(r => r.prop);
        expect(values).to.contain("ref1");
        expect(values).to.contain("ref2");
    });

    it("Should unset references if the value is set to null", async () => {
        @entity() class Target { public ref = hasOne(() => Reference); }
        @entity() class Reference { public tgt = hasOneInverse(() => Target, "ref"); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const { toOne, inverse } = await write(
            masterBranchId,
            rootUserId, {
                toOne: {
                    type: Target,
                    returning: {},
                    values: [{ ref: {} }],
                },
                inverse: {
                    type: Reference,
                    returning: {},
                    values: [{ tgt: {} }],
                },
            }
        );

        const { unsetOne, unsetInverse } = await write(
            masterBranchId,
            rootUserId, {
                unsetOne: {
                    type: Target,
                    returning: { ref: {} },
                    values: [{
                        id: atLeastOne(toOne)[0].id,
                        ref: null,
                    }],
                },
                unsetInverse: {
                    type: Reference,
                    returning: { tgt: {} },
                    values: [{
                        id: atLeastOne(inverse)[0].id,
                        tgt: null,
                    }],
                },
            }
        );

        expect(atLeastOne(unsetOne)[0]).to.have.property("ref", null);
        expect(atLeastOne(unsetInverse)[0]).to.have.property("tgt", null);
    });

    it("Should allow unsetting an inverse reference and updating the entity at the same time", async () => {
        @entity() class Target { public ref = hasOne(() => Reference); public prop = primitiveString(); }
        @entity() class Reference { public tgt = hasOneInverse(() => Target, "ref"); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Reference,
                    returning: { tgt: {} },
                    values: [{ tgt: {} }],
                },
            }
        );

        const propVal = "value";
        const createdItem = atLeastOne(create)[0];
        const { update, unset } = await write(
            masterBranchId,
            rootUserId, {
                update: {
                    type: Target,
                    returning: { ref: {} },
                    values: [{
                        id: createdItem.tgt.id,
                        prop: propVal,
                    }],
                },
                unset: {
                    type: Reference,
                    returning: { tgt: {} },
                    values: [{
                        id: createdItem.id,
                        tgt: null,
                    }],
                },
            }
        );

        const targetItem = atLeastOne(update)[0];
        expect(targetItem).to.have.property("prop", propVal);
        expect(targetItem.ref).to.eql(null);

        expect(atLeastOne(unset)[0]).to.have.property("tgt", null);
    });

    it("Should not create a relation on a new entity if value is set to null", async () => {
        @entity()
        class Target {
            public r1 = hasOne(() => Reference);
            public r2 = hasOne(() => Reference);
        }

        @entity()
        class Reference {
            public tgt = hasOneInverse(() => Target, "r1");
            public tgts = hasMany(() => Target, "r2");
        }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));


        const write = createWrite(queryRunner, universe);
        const { one, inverse, many } = await write(
            masterBranchId,
            rootUserId, {
                one: {
                    type: Target,
                    returning: { r1: {} },
                    values: [{ r1: null }],
                },
                inverse: {
                    type: Reference,
                    returning: { tgt: {} },
                    values: [{ tgt: null }],
                },
                many: {
                    type: Reference,
                    returning: { tgts: {} },
                    values: [{ tgts: [] }],
                },
            }
        );

        expect(atLeastOne(one)[0]).to.have.property("r1", null);
        expect(atLeastOne(inverse)[0]).to.have.property("tgt", null);
        expect(atLeastOne(many)[0].tgts).to.eql([]);
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
            e => expect(e.message).to.match(/Entity id may only be an entity id, undefined or a transient id/)
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

    it("Should throw if save request contains conflicting to-one references", async () => {
        @entity() class Target { public ref = hasOne(() => Reference); }
        @entity() class Reference {} // tslint:disable-line:no-unnecessary-class
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
                        values: [
                            {
                                id: transientId("target"),
                                ref: { id: transientId("ref1") },
                            },
                            {
                                id: transientId("target"),
                                ref: { id: transientId("ref2") }, // Same target, different ref
                            },
                        ],
                    },
                }
            ),
            e => expect(e.message).to.match(/conflict/i)
        );
    });

    it("Should throw if save request contains conflicting primitive properties", async () => {
        @entity() class Target { public prop = primitiveLocalDate(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        return expectToFail(
            () => write(
                masterBranchId,
                rootUserId, {
                    create: {
                        type: Target,
                        returning: {},
                        values: [
                            {
                                id: transientId("target"),
                                prop: LocalDate.now(),
                            },
                            {
                                id: transientId("target"),
                                prop: LocalDate.now().plusDays(10), // Same target, different prop
                            },
                        ],
                    },
                }
            ),
            e => expect(e.message).to.match(/conflict/i)
        );
    });

    it("Should not throw if save request specifies identical primitive property twice", async () => {
        @entity() class Target { public prop = primitiveLocalDate(); }
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
                        {
                            id: transientId("target"),
                            prop: LocalDate.now(),
                        },
                        {
                            id: transientId("target"),
                            prop: LocalDate.now(), // Same target, same prop value
                        },
                    ],
                },
            }
        );

        const propVal = atLeastOne(create)[0].prop;
        expect(propVal?.isEqual(LocalDate.now())).to.be(true);
    });

    it("Should throw if save request contains conflicting to-one-inverse references", async () => {
        @entity() class Target {
            public r1 = hasOne(() => Reference);
            public r2 = hasOne(() => Reference);
        }
        @entity() class Reference {
            public tgt = hasOneInverse(() => Target, "r1");
            public irrelevant = hasOneInverse(() => Target, "r2");
        }
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
                            r1: {
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

    it("Should set ref when request causes an unset and set on same prop", async () => {
        @entity() class Target { public ref = hasOne(() => Reference); }
        @entity() class Reference { public inverse = hasOneInverse(() => Target, "ref"); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const { create } = await write(
            masterBranchId,
            rootUserId, {
                create: {
                    type: Target,
                    returning: { ref: {} },
                    values: [{ ref: {} }],
                },
            }
        );

        const item = atLeastOne(create)[0];
        const refId = item.ref!.id;
        const { set, unset } = await write(
            masterBranchId,
            rootUserId, {
                set: {
                    type: Target,
                    returning: { ref: {} },
                    values: [{
                        id: item.id,
                        ref: {}, // Sets ref to new item
                    }],
                },
                unset: {
                    type: Reference,
                    returning: { inverse: {} },
                    values: [{
                        id: refId,
                        inverse: null, // Unset targeting the same ref
                    }],
                },
            }
        );

        const updatedRef = atLeastOne(set)[0].ref;
        expect(updatedRef).to.not.be(null);
        expect(updatedRef?.id).to.not.be(refId);
        expect(atLeastOne(unset)[0]).to.have.property("inverse", null);
    });

    it("Should throw if entity value is not a plain object", async () => {
        @entity() class Target { public ref = hasOne(() => Reference); }
        @entity() class Reference {} // tslint:disable-line:no-unnecessary-class
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
                        values: [{ ref: 1 as any }],
                    },
                }
            ),
            e => expect(e.message).to.match(/Expected a plain object/)
        );
    });

    it("Should throw if to-many set is not an array", async () => {
        @entity() class Target { public refs = hasMany(() => Reference, "tgt"); }
        @entity() class Reference { public tgt = hasOne(() => Target); }
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
                        values: [{ refs: 1 as any }],
                    },
                }
            ),
            e => expect(e.message).to.match(/Data for to-many relation must be an array/)
        );
    });

    it("Should write to the specified branch", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const read = createRead(queryRunner, universe);
        const write = createWrite(queryRunner, universe);
        const createBranch = createBranching(queryRunner);

        const newBranch = await createBranch(masterBranchId, rootUserId);
        const { create } = await write(
            newBranch,
            rootUserId, {
                create: {
                    type: Target,
                    returning: {},
                    values: [{}],
                },
            }
        );

        const itemId = atLeastOne(create)[0].id;
        const { branched, master } = await read({
            master: {
                type: Target,
                references: {},
                branch: masterBranchId,
                ids: [itemId],
            },
            branched: {
                type: Target,
                references: {},
                branch: newBranch,
                ids: [itemId],
            },
        });

        expect(master).to.have.length(0);
        expect(branched).to.have.length(1);
    });

    it("Should log which user caused the change", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const createUser = createUserApi(queryRunner);
        const write = createWrite(queryRunner, universe);

        const newUser = await createUser(rootUserId);
        const { create } = await write(
            masterBranchId,
            newUser, {
                create: {
                    type: Target,
                    returning: {},
                    values: [{}],
                },
            }
        );

        expect(atLeastOne(create)[0]).to.have.property("by", newUser);
    });

    it("Should write an entry for a defined id, which did not exist in a target branch before", async () => {
        @entity() class Target { public prop = primitiveString(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const createBranch = createBranching(queryRunner);

        const newBranch = await createBranch(masterBranchId, rootUserId);
        const { created } = await write(newBranch, rootUserId, {
            created: {
                type: Target,
                returning: {},
                values: [{ prop: "value" }],
            },
        });

        const originalItem = atLeastOne(created)[0];
        const { insert } = await write(masterBranchId, rootUserId, {
            insert: {
                type: Target,
                returning: {},
                values: [{ id: originalItem.id }], // Item id exists in the database, but not in master branch
            },
        });

        const item = atLeastOne(insert)[0];
        expect(item).to.have.property("id", originalItem.id);
        expect(item).to.have.property("prop", null); // Does not receives a value from original item, because it's in another branch
    });

    it("Should write an entry with payload for a defined id, which did not exist in a target branch before", async () => {
        @entity() class Target { public p1 = primitiveString(); public p2 = primitiveString(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const write = createWrite(queryRunner, universe);
        const createBranch = createBranching(queryRunner);

        const newBranch = await createBranch(masterBranchId, rootUserId);
        const { created } = await write(newBranch, rootUserId, {
            created: {
                type: Target,
                returning: {},
                values: [{ p1: "old", p2: "value" }],
            },
        });

        const originalItem = atLeastOne(created)[0];
        const { insert } = await write(masterBranchId, rootUserId, {
            insert: {
                type: Target,
                returning: {},
                values: [{ id: originalItem.id, p1: "new" }], // Item id exists in the database, but not in master branch
            },
        });

        const item = atLeastOne(insert)[0];
        expect(item).to.have.property("id", originalItem.id);
        expect(item).to.have.property("p1", "new"); // Receives the new payload
        expect(item).to.have.property("p2", null); // Does not receives a value from original item, because it's in another branch
    });
});
