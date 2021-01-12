import expect = require("expect.js");
import { isBranchId, isVersionId, masterBranchId } from "./temporal";
import { hydrateBranchId, hydrateVersionId } from "./api/db_values/hydrate";

describe("Temporal", () => {
    describe("isBranchId", () => {
        it("Should return true for a named branch", async () => {
            expect(isBranchId(masterBranchId)).to.be(true);
        });

        it("Should return true for a user defined branch id", async () => {
            expect(isBranchId(hydrateBranchId(999))).to.be(true);
        });

        it("Should return false for an arbitrary string", async () => {
            expect(isBranchId("blah" as any)).to.be(false);
        });
    });

    describe("isVersionId", () => {
        it("Should return true for a version id", async () => {
            expect(isVersionId(hydrateVersionId(999))).to.be(true);
        });

        it("Should return false for an arbitrary string", async () => {
            expect(isVersionId("blah" as any)).to.be(false);
        });
    });
});
