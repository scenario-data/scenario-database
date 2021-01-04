import expect = require("expect.js");
import { pgFormat } from "./pg_format";


describe("PG Format", () => {
    it("Should embed escaped placeholders", async () => {
        expect(pgFormat(`ALTER TABLE "public".%I ADD CONSTRAINT %I FOREIGN KEY ("branch") REFERENCES "public"."branch"("id")`, ["someTable", "MyConstraint"]))
            .to.eql(`ALTER TABLE "public"."someTable" ADD CONSTRAINT "MyConstraint" FOREIGN KEY ("branch") REFERENCES "public"."branch"("id")`);
    });
});
