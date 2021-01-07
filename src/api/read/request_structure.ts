import { EntityDef, EntityRestriction } from "../../definition/entity";
import { DataReference, isDataReference } from "../../definition/references";
import { refColumnName } from "../migrations/execute_migrations";
import { nevah, objectKeys } from "../../misc/typeguards";
import { FetchNode } from "../fetch_types/fetch_node";
import { ReadRequest, ReadRequestData, ReadRequestTemporal } from "./read_api";
import { getUniverseElementName, UniverseElement, UniverseRestriction } from "../universe";

export interface ReadIdentifiedNode<T extends EntityRestriction<T>> extends ReadRequestTemporal {
    type: EntityDef<T>;
    tableName: string;
    alias: string;
    nested: ReadReferenceNode<any>[];
}

export interface ReadReferenceNode<T extends EntityRestriction<T>> {
    type: EntityDef<T>;
    tableName: string;
    alias: string;
    count: "one" | "many";
    resultKey: string;
    parentAlias: string;
    parentTargetColumn: string;
    ownTargetColumn: string;
    nested: ReadReferenceNode<any>[];
}

const resolveColumns = (
    Type: EntityDef<any>,
    propDef: DataReference,
    refKey: string,
    getTypeName: (type: EntityDef<any>) => string
) => {
    switch (propDef.reference_type) {
        case "has_one":
            return {
                parentTargetColumn: refColumnName(refKey, getTypeName(propDef.target())),
                ownTargetColumn: "id",
                count: "one",
            } as const;

        case "has_many":
        case "has_one_inverse":
            const targetDef = new (propDef.target())();
            const backlinkDef = targetDef[propDef.backlink];

            // istanbul ignore next
            if (!backlinkDef || !isDataReference(backlinkDef) || backlinkDef.reference_type !== "has_one") {
                throw new Error(`Request backlink '${ propDef.backlink }' is not a to-one reference on type '${ getTypeName(propDef.target()) }'`);
            }

            return {
                parentTargetColumn: "id",
                ownTargetColumn: refColumnName(propDef.backlink, getTypeName(Type)),
                count: propDef.reference_type === "has_one_inverse" ? "one" : "many",
            } as const;

         // istanbul ignore next
        default:
            nevah(propDef);
            throw new Error("Unhandled reference type");
    }
};

function generateReferences<Entity extends EntityRestriction<Entity>, References extends FetchNode<Entity>>(
    req: ReadRequestData<Entity, References>,
    resultKey: string,
    getAlias: () => string,
    getTypeName: (type: EntityDef<any>) => string,
    ownTargetColumn: string,
    parentAlias: string,
    parentTargetColumn: string,
    count: "one" | "many"
): ReadReferenceNode<Entity> {
    const Type = req.type;
    const typeDef = new Type();

    const ownAlias = getAlias();
    const tableName = getTypeName(Type);
    return {
        type: Type,
        tableName,
        alias: ownAlias,
        count,
        resultKey,
        ownTargetColumn,
        parentAlias,
        parentTargetColumn,
        nested: objectKeys(req.references).map(refKeyUntyped => {
            const refKey = refKeyUntyped as unknown as Extract<keyof typeof typeDef, string>;
            // istanbul ignore next
            if (!(refKey in typeDef)) { throw new Error(`Requested reference '${ refKey }' does not exists on type '${ tableName }'`); }

            const propDef = typeDef[refKey];
            // istanbul ignore next
            if (!isDataReference(propDef)) { throw new Error(`Requested reference '${ refKey }' on type '${ tableName }' is not a data reference definition`); }

            const resolvedColumns = resolveColumns(Type, propDef, refKey, getTypeName);
            return generateReferences(
                {
                    type: propDef.target(),
                    references: (req.references as any)[refKey],
                },
                refKey,
                getAlias,
                getTypeName,
                resolvedColumns.ownTargetColumn,
                ownAlias,
                resolvedColumns.parentTargetColumn,
                resolvedColumns.count
            );
        }),
    };
}

export function generateRequestStructure<Universe extends UniverseRestriction<Universe>, Entity extends UniverseElement<Universe>, References extends FetchNode<Entity>>(
    universe: Universe,
    req: ReadRequest<Entity, References>
): ReadIdentifiedNode<Entity> {
    let aliasId = 0;
    const getAlias = () => `a${ aliasId++ }`;
    const getTypeName = <T extends UniverseElement<Universe>>(type: EntityDef<T>) => getUniverseElementName(universe, type);

    const Type = req.type;
    const typeDef = new Type();

    const ownAlias = getAlias();
    const tableName = getTypeName(Type);
    return {
        type: Type,
        branch: req.branch,
        tableName,
        alias: ownAlias,
        nested: objectKeys(req.references).map(refKeyUntyped => {
            const refKey = refKeyUntyped as unknown as Extract<keyof typeof typeDef, string>;
            // istanbul ignore next
            if (!(refKey in typeDef)) { throw new Error(`Requested reference '${ refKey }' does not exists on type '${ tableName }'`); }

            const propDef: unknown = typeDef[refKey];
            // istanbul ignore next
            if (!isDataReference(propDef)) { throw new Error(`Requested reference '${ refKey }' on type '${ tableName }' is not a data reference definition`); }

            const resolvedColumns = resolveColumns(Type, propDef, refKey, getTypeName);
            return generateReferences(
                {
                    type: propDef.target(),
                    references: (req.references as any)[refKey],
                },
                refKey,
                getAlias,
                getTypeName,
                resolvedColumns.ownTargetColumn,
                ownAlias,
                resolvedColumns.parentTargetColumn,
                resolvedColumns.count
            );
        }),
    };
}
