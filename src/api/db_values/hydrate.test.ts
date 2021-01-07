import expect = require("expect.js");

import {
    primitiveBranch,
    primitiveString,
    primitiveUser
} from "../../definition/primitives";
import { asUserId, rootUserId } from "../../user";
import { asBranchId, masterBranchId } from "../../temporal";
import { hydratePrimitive } from "./hydrate";
import { serializePrimitive } from "./serialize";
import { namedBranchId, namedUserId } from "../named_constants";


describe("DB values hydration/serialization", () => {
    it("Should return null if serializing null", async () => {
        expect(hydratePrimitive(primitiveString(), null)).to.eql(null);
    });

    it("Should return null if hydrating null", async () => {
        expect(serializePrimitive(primitiveString(), null)).to.eql(null);
    });

    it("Should throw if hydrated value doesn't match the type", async () => {
        expect(() => hydratePrimitive(primitiveString(), false)).to.throwError(/Value doesn't match expected type/);
    });

    it("Should throw if serialized value doesn't match the type", async () => {
        expect(() => serializePrimitive(primitiveString(), false as any)).to.throwError(/Value doesn't match expected type/);
    });

    describe("Named branch handling", () => {
        it("Should serialize named branches to db id", async () => {
            expect(serializePrimitive(primitiveBranch(), masterBranchId)).to.eql(namedBranchId(masterBranchId));
        });

        it("Should deserialize named branch db id to a name", async () => {
            expect(hydratePrimitive(primitiveBranch(), namedBranchId(masterBranchId))).to.eql(masterBranchId);
        });

        it("Should deserialize user defined branches to branch id", async () => {
            expect(hydratePrimitive(primitiveBranch(), 999)).to.eql(asBranchId("999"));
        });
    });

    describe("Named user handling", () => {
        it("Should serialize named users to db id", async () => {
            expect(serializePrimitive(primitiveUser(), rootUserId)).to.eql(namedUserId(rootUserId));
        });

        it("Should deserialize named user db id to a name", async () => {
            expect(hydratePrimitive(primitiveUser(), namedUserId(rootUserId))).to.eql(rootUserId);
        });

        it("Should deserialize user defined user to user id", async () => {
            expect(hydratePrimitive(primitiveUser(), 999)).to.eql(asUserId("999"));
        });
    });
});
