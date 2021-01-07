import expect = require("expect.js");

import { getUniverseElementName } from "./universe";
import { entity, getEntityName } from "../definition/entity";

describe("Universe", () => {
    describe("getUniverseElementName", () => {
        @entity()
        // tslint:disable-next-line:no-unnecessary-class
        class Target {}

        it("Should return entity name", async () => {
            expect(getUniverseElementName({ Target }, Target)).to.eql(getEntityName(Target));
        });

        it("Should throw if entity is not defined on the given universe", async () => {
            expect(() => getUniverseElementName({}, Target as any)).to.throwError(/Element not in universe/);
        });
    });
});
