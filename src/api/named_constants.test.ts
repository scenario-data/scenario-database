import expect = require("expect.js");
import {
    isNamedBranchId,
    isNamedBranchSerializedId,
    isNamedUserId, isNamedUserSerializedId,
    namedBranchById,
    namedBranchId, namedUserById, namedUserId
} from "./named_constants";
import { asBranchId, masterBranchId } from "../temporal";
import { asUserId, rootUserId } from "../user";

describe("Named branches", () => {
    describe("namedBranchId", () => {
        it("Should return a database id of a named branch", async () => {
            expect(namedBranchId(masterBranchId)).to.eql(1);
        });
    });

    describe("isNamedBranchId", () => {
        it("Should return true for a named branch", async () => {
            expect(isNamedBranchId(masterBranchId)).to.be(true);
        });

        it("Should return false for a user-defined branch", async () => {
            expect(isNamedBranchId(asBranchId("whatever"))).to.eql(false);
        });
    });

    describe("isNamedBranchSerializedId", () => {
        it("Should return true if given db id identifies a named branch", async () => {
            expect(isNamedBranchSerializedId(namedBranchId(masterBranchId))).to.be(true);
        });

        it("Should return false for user-defined branches", async () => {
            expect(isNamedBranchSerializedId(999)).to.be(false);
        });
    });

    describe("namedBranchById", () => {
        it("Should return a named branch if given a matching database id", async () => {
            expect(namedBranchById(namedBranchId(masterBranchId))).to.eql(masterBranchId);
        });

        it("Should throw if given a user-defined branch", async () => {
            expect(() => namedBranchById(999 as any)).to.throwError(/Not a named branch/);
        });
    });
});

describe("Named users", () => {
    describe("namedUserId", () => {
        it("Should return a database id of a named user", async () => {
            expect(namedUserId(rootUserId)).to.eql(1);
        });
    });

    describe("isNamedUserId", () => {
        it("Should return true for a named user", async () => {
            expect(isNamedUserId(rootUserId)).to.be(true);
        });

        it("Should return false for a user-defined user", async () => {
            expect(isNamedUserId(asUserId("whatever"))).to.eql(false);
        });
    });

    describe("isNamedUserSerializedId", () => {
        it("Should return true if given db id identifies a named user", async () => {
            expect(isNamedUserSerializedId(namedUserId(rootUserId))).to.be(true);
        });

        it("Should return false for user-defined users", async () => {
            expect(isNamedUserSerializedId(999)).to.be(false);
        });
    });

    describe("namedUserById", () => {
        it("Should return a named user if given a matching database id", async () => {
            expect(namedUserById(namedUserId(rootUserId))).to.eql(rootUserId);
        });

        it("Should throw if given a user-defined user", async () => {
            expect(() => namedUserById(999 as any)).to.throwError(/Not a named user/);
        });
    });
});
