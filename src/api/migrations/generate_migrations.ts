import { getUniverseElementName, UniverseRestriction } from "../universe";
import { Migration } from "../../definition/migrations";
import { objectKeys } from "../../misc/typeguards";
import { migrate } from "./migrations_builder";
import { EntityDef } from "../../definition/entity";
import { DataPrimitive, isDataPrimitive } from "../../definition/primitives";
import { isDataReference } from "../../definition/references";
import { MigrationsApi } from "./migrations_builder_api";

export function generateMigrations<Universe extends UniverseRestriction<Universe>>(targetUniverse: Universe): Migration[] {
    const universeTypes = objectKeys(targetUniverse);

    const createTypes = universeTypes
        .map(t => migrate({}).addType(t as string).done())
        .reduce((a, b) => [...a, ...b], [] as Migration[]);

    const createPrimitives = universeTypes.map(t => {
        const TypeDef: EntityDef<any> = targetUniverse[t];
        const typeDef = new TypeDef();

        const typePrimitives = objectKeys(typeDef).reduce((primitives, prop) => {
            const propDef = typeDef[prop];
            if (!isDataPrimitive(propDef)) { return primitives; }

            primitives[prop] = propDef;
            return primitives;
        }, {} as { [prop: string]: DataPrimitive });
        if (objectKeys(typePrimitives).length === 0) { return []; }

        return migrate({ [t]: {} })
            .addPrimitives(t as string, typePrimitives)
            .done();
    }).reduce((a, b) => [...a, ...b], [] as Migration[]);

    const createReferences = universeTypes.map(t => {
        const TypeDef: EntityDef<any> = targetUniverse[t];
        const typeDef = new TypeDef();

        return objectKeys(typeDef).reduce((builder: MigrationsApi<{ [prop: string]: {} }, []>, prop) => {
            const propDef = typeDef[prop];
            if (!isDataReference(propDef)) { return builder as any; }
            if (propDef.reference_type !== "has_one") { return builder as any; }
            return builder.addReference(t as string, prop, getUniverseElementName(targetUniverse, propDef.target()));

        }, migrate<any>({})).done();
    }).reduce((a, b) => [...a, ...b], [] as Migration[]);

    return [
        ...createTypes,
        ...createPrimitives,
        ...createReferences,
    ];
}
