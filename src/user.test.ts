import expect = require("expect.js");
import { hydrateUserId } from "./api/db_values/hydrate";
import { anonymousUserId, isUserId } from "./user";

describe("User", () => {
    describe("isUserId", () => {
        it("Should return true for a named user", async () => {
            expect(isUserId(anonymousUserId)).to.be(true);
        });

        it("Should return true for a user defined user id", async () => {
            expect(isUserId(hydrateUserId(999))).to.be(true);
        });

        it("Should return false for an arbitrary string", async () => {
            expect(isUserId("blah" as any)).to.be(false);
        });
    });
});
