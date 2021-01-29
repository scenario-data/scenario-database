import { EntityDef, EntityRestriction } from "../../definition/entity";
import { DataReference, isDataReference } from "../../definition/references";
import { refColumnName } from "../migrations/execute_migrations";
import { nevah, objectKeys } from "../../misc/typeguards";
import { FetchNode, InternalFKPrimitiveRequestNode } from "../fetch_types/fetch_node";
import { ReadRequest, ReadRequestData } from "./read_api";
import { getUniverseElementName, UniverseElement, UniverseRestriction } from "../universe";
import {
    InternalFKPrimitive,
    InternalFKPrimitiveDefinitions,
    isInternalFKPrimitive
} from "../fetch_types/internal_foreign_keys";
import {
    isDataPrimitive,
    primitiveBranch,
    primitiveLocalDateTime,
    primitiveUser,
    primitiveVersion
} from "../../definition/primitives";

export interface ReadIdentifiedNode<T extends EntityRestriction<T>> {
    nodeType: "identified";
    type: EntityDef<T>;
    tableName: string;
    alias: string;
    nested: (ReadReferenceNode<any> | ReadInternalRefNode)[];
}

export interface ReadReferenceNode<T extends EntityRestriction<T>> {
    nodeType: "reference";
    type: EntityDef<T>;
    tableName: string;
    alias: string;
    count: "one" | "many";
    resultKey: string;
    parentAlias: string;
    parentTargetColumn: string;
    ownTargetColumn: string;
    nested: (ReadReferenceNode<any> | ReadInternalRefNode)[];
}

export interface ReadInternalRefNode {
    nodeType: "internalReference";
    tableName: string;
    alias: string;
    resultKey: string;
    parentAlias: string;
    parentTargetColumn: string;
    selections: string[];
    nested: ReadInternalRefNode[];
}

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
    const ownAlias = getAlias();
    const tableName = getTypeName(Type);
    return {
        nodeType: "reference",
        type: Type,
        tableName,
        alias: ownAlias,
        count,
        resultKey,
        ownTargetColumn,
        parentAlias,
        parentTargetColumn,
        nested: generateNestedStructure(req, tableName, Type, getTypeName, getAlias, ownAlias),
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
    const ownAlias = getAlias();
    const tableName = getTypeName(Type);
    return {
        nodeType: "identified",
        type: Type,
        tableName,
        alias: ownAlias,
        nested: generateNestedStructure(req, tableName, Type, getTypeName, getAlias, ownAlias),
    };
}

function generateNestedStructure<Entity extends EntityRestriction<Entity>, References extends FetchNode<Entity>>(
    req: ReadRequestData<Entity, References>,
    tableName: string,
    Type: EntityDef<Entity>,
    getTypeName: (type: EntityDef<any>) => string,
    getAlias: () => string, ownAlias: string
) {
    const typeDef = new Type();
    return objectKeys(req.references).map(refKeyUntyped => {
        const refKey = refKeyUntyped as unknown as Extract<keyof typeof typeDef, string>;
        if (!(refKey in typeDef)) { throw new Error(`Requested reference '${ refKey }' does not exists on type '${ tableName }'`); }

        const propDef: unknown = typeDef[refKey];
        if (!isDataReference(propDef)) {
            if (!isDataPrimitive(propDef) || !isInternalFKPrimitive(propDef)) { throw new Error(`Requested reference '${ refKey }' on type '${ tableName }' is not a data reference or internal fk definition`); }
            return generateInternalStructure(
                propDef,
                (req.references as any)[refKey],
                ownAlias,
                refKey,
                getAlias
            );
        }

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
    });
}

function resolveColumns(
    Type: EntityDef<any>,
    propDef: DataReference,
    refKey: string,
    getTypeName: (type: EntityDef<any>) => string
) {
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
}


const internalFKStructure: { [P in keyof InternalFKPrimitiveDefinitions]: InternalFKPrimitiveDefinitions[P]["shape"] } = {
    user: {
        id: primitiveUser(),
        ts: primitiveLocalDateTime(),
        created_by: { ref: primitiveUser() },
    },
    branch: {
        id: primitiveBranch(),
        ts: primitiveLocalDateTime(),
        start_version: primitiveVersion(),
        branched_from: { ref: primitiveBranch() },
        created_by: { ref: primitiveUser() },
    },
};
export const getInternalFKShape = <P extends keyof InternalFKPrimitiveDefinitions>(type: P) => internalFKStructure[type];

const internalTables: { [P in keyof InternalFKPrimitiveDefinitions]: string } = {
    branch: "branch",
    user: "user",
};

function generateInternalStructure<T extends InternalFKPrimitive>(
    primitive: T,
    references: InternalFKPrimitiveRequestNode<T>,
    parentAlias: string,
    parentTargetColumn: string,
    getAlias: () => string
): ReadInternalRefNode {
    const shape = getInternalFKShape(primitive.primitive_type);
    const ownAlias = getAlias();

    return {
        nodeType: "internalReference",
        alias: ownAlias,
        tableName: internalTables[primitive.primitive_type],

        parentAlias,
        parentTargetColumn,
        resultKey: parentTargetColumn,
        selections: objectKeys(shape),
        nested: objectKeys(references).map(refKeyUntyped => {
            const refKey = refKeyUntyped as unknown as Extract<keyof typeof shape, string>;
            if (!(refKey in shape)) { throw new Error(`Requested '${ refKey }' is not in internal fk shape for primitive '${ primitive.primitive_type }'`); }

            const def = shape[refKey];
            if (!("ref" in def)) { throw new Error(`Requested '${ refKey }' is not an internal ref`); }

            return generateInternalStructure(
                def.ref,
                (references as any)[refKey],
                ownAlias,
                refKey,
                getAlias
            );
        }),
    };
}
