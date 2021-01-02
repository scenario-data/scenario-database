import expect = require("expect.js");
import { migrate } from "./migrations_builder";
import { primitiveInt, primitiveString } from "../../definition/primitives";
import { AddTypeMigration, RemoveTypeMigration } from "../../definition/migrations";

describe("Migrations builder", () => {
    it("Should generate a list of migrations", async () => {
        const migrations = migrate({})
            .addType("t0")
            .addPrimitives("t0", { str: primitiveString(), int: primitiveInt() })

            .addType("t1")
            .addPrimitives("t1", { str: primitiveString(), int: primitiveInt() })
            .addPrimitives("t1", { removeme: primitiveString(), anotherStr: primitiveString() })

            .addType("t2")
            .addPrimitives("t2", { prap: primitiveString() })
            .renameField("t2", "prap", "prop")

            .addRelation("t2", "one", "t1", "one-to-one")
            .addRelation("t2", "many", "t1", "many-to-one")

            .removeField("t1", "removeme")
            .removeType("t0")

            .done();

        expect(migrations).to.be.an("array");

        const addTypeMigration: AddTypeMigration<"t0"> = { action: "addType", type: "t0" };
        expect(migrations[0]).to.eql(addTypeMigration);

        const removeTypeMigration: RemoveTypeMigration<"t0"> = { action: "removeType", type: "t0" };
        expect(migrations[migrations.length - 1]).to.eql(removeTypeMigration);
    });
});
