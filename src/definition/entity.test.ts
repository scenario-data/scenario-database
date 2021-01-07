import expect = require("expect.js");

import { entity, getEntityName } from "./entity";

describe("Entity definition", () => {
    describe("decorator", () => {
        it("Should throw if no element name is found", async () => {
            expect(() => entity()(class {})).to.throwError(/No entity name found/);
        });

        it("Should throw if given argument is not an entity constructor", async () => {
            expect(() => entity()(1 as any)).to.throwError(/Expected an entity constructor/);
        });

        it("Should throw if class has unexpected properties", async () => {
            expect(() => entity("test")(class {
                public prop = 1 as any;
            })).to.throwError(/primitive or reference definition/);
        });
    });

    describe("getEntityName", () => {
        it("Should return the specified entity name", async () => {
            const name = "some name";

            @entity(name)
                // tslint:disable-next-line:no-unnecessary-class
            class Something {}

            expect(getEntityName(Something)).to.eql(name);
        });

        it("Should return class name as name by default", async () => {
            @entity()
                // tslint:disable-next-line:no-unnecessary-class
            class Something {}

            expect(getEntityName(Something)).to.eql("Something");
        });

        it("Should throw if given an unknown entity", async () => {
            expect(() => getEntityName(class {})).to.throwError(/Unknown entity type/);
        });
    });
});
