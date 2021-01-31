import * as ts from "typescript";
import { Project, Scope } from "ts-morph";
import { flatten } from "lodash";
import { join } from "path";
import { isNot, nevah, objectKeys } from "../misc/typeguards";
import { isWatdivEntity, isWatdivRef, WatdivEntity, WatdivName, WatdivPropertyType, WatdivRef } from "./parser/watdiv_parser";
import { builtinNamespace, watdivModel } from "./model/watdiv_model_def";


const isName = (namespace: string, name: string) => (n: WatdivName) => n.name === name && n.namespace === namespace;
const isUser = isName(builtinNamespace.name, "user");
const isBranch = isName(builtinNamespace.name, "branch");
const isId = isName(builtinNamespace.name, "id");
const isBuiltinName = (n: WatdivName) => isUser(n) || isBranch(n);
const isBuiltin = (etty: WatdivEntity): etty is any => isBuiltinName(etty.name);

type HasOne = { ref_type: "has_one", target: string };
type HasMany = { ref_type: "has_many", target: string, backlink: string };
type Reference = HasOne | HasMany;

const entityName = (n: WatdivName) => n.name;
const entities: { [name: string]: { [prop: string]: WatdivPropertyType | "branch" | "user" | Reference } } = {};


// Set primitive properties on entities
for (const entityDef of watdivModel.filter(isWatdivEntity).filter(isNot(isBuiltin))) {
    const name = entityName(entityDef.name);
    if (name in entities) { throw new Error(`Entity already exists: ${ name }`); }

    const props: { [prop: string]: WatdivPropertyType } = {};
    const propDefs = flatten(entityDef.propGroups);
    for (const prop of propDefs) {
        if (isId(prop.name)) { continue; }

        const propName = prop.name.name;
        if (propName in props && props[propName] !== prop.type) {
            throw new Error(`Prop '${ propName }' type mismatch on '${ name }': ${ props[propName] } vs ${ prop.type }`);
        }

        props[propName] = prop.type;
    }

    entities[name] = props;
}


// Set relations between entities
const selectRelType = (subjCardinality: WatdivRef["subjCardinality"], objCardinality: WatdivRef["objCardinality"]) => {
    if (subjCardinality === 2 && objCardinality > 1) { return "many-to-many"; }
    if (subjCardinality === 1 && objCardinality > 1) { return "one-to-many"; }
    if (subjCardinality === 2 && objCardinality === 1) { return "many-to-one"; }
    if (subjCardinality === 1 && objCardinality === 1) { return "one-to-one"; }
    throw new Error("Unhandled combination of cardinalities");
};
for (const refDef of watdivModel.filter(isWatdivRef)) {
    if (isBuiltinName(refDef.from)) { continue; } // Ignore relations originating from builtins

    const fromEntity = entityName(refDef.from);
    if (!(fromEntity in entities)) { throw new Error(`Unknown entity '${ fromEntity }'`); }

    if (isBuiltinName(refDef.to)) {
        if (refDef.subjCardinality !== 1) { throw new Error(`Only subject cardinality of 1 supported for built-ins`); }
        if (refDef.objCardinality !== 1) { throw new Error(`Only object cardinality of 1 supported for built-ins`); }

        if (isBranch(refDef.to)) {
            if (refDef.field.name === "branch") { continue; } // This determines which branch the value would be written into — not user definable
            entities[fromEntity]![refDef.field.name] = "branch";
            continue;
        }

        if (isUser(refDef.to)) {
            entities[fromEntity]![refDef.field.name] = "user";
            continue;
        }

        throw new Error(`Unhandled built-in: ${ refDef.to.name }`);
    }


    const toEntity = entityName(refDef.to);
    if (!(toEntity in entities)) { throw new Error(`Unknown entity '${ toEntity }'`); }

    const relType = selectRelType(refDef.subjCardinality, refDef.objCardinality);
    switch (relType) {
        case "one-to-one":
            entities[fromEntity]![refDef.field.name] = { ref_type: "has_one", target: toEntity };
            continue;

        case "one-to-many":
            entities[fromEntity]![refDef.field.name] = { ref_type: "has_one", target: toEntity };
            entities[toEntity]![`${ fromEntity }_${ refDef.field.name }_inverse`] = {
                ref_type: "has_many",
                target: fromEntity,
                backlink: refDef.field.name,
            };
            continue;

        case "many-to-one":
            const backlink = `${ fromEntity }_${ refDef.field.name }_inverse`;
            entities[toEntity]![backlink] = { ref_type: "has_one", target: fromEntity };
            entities[fromEntity]![refDef.field.name] = { ref_type: "has_many", target: toEntity, backlink };
            continue;

        case "many-to-many":
            const edgeName = entityName({ namespace: "edge", name: `${ refDef.from.name }_${ refDef.to.name }` });
            entities[edgeName] = {
                [refDef.from.name]: { ref_type: "has_one", target: fromEntity },
                [refDef.to.name]: { ref_type: "has_one", target: toEntity },
            };
            entities[fromEntity]![refDef.field.name] = { ref_type: "has_many", target: edgeName, backlink: refDef.from.name };
            entities[toEntity]![`${ fromEntity }_${ refDef.field.name }_inverse`] = { ref_type: "has_many", target: edgeName, backlink: refDef.to.name };
            continue;

        default:
            nevah(relType);
            throw new Error("Unhandled relation type");
    }
}


// Generate entity definitions
const tsConfigName = "tsconfig.json";
const directory = process.cwd();

const configPath = ts.findConfigFile(directory, ts.sys.fileExists, tsConfigName);
if (!configPath) { throw new Error("Config not found"); }


const project = new Project({ tsConfigFilePath: configPath });
const datamodelSource = project.createSourceFile(join(directory, "datamodel.ts"), undefined, { overwrite: true });

for (const currentEntityName of objectKeys(entities)) {
    const entityDef = entities[currentEntityName]!;

    datamodelSource.addClass({
        isExported: true,
        name: currentEntityName,
        decorators: [{ name: "entity", arguments: [] }],
        properties: objectKeys(entityDef).map(prop => ({
            name: prop,
            scope: Scope.Public,
            initializer: writer => {
                const def = entityDef[prop]!;

                if (typeof def === "string") {
                    switch (def) {
                        case "name":
                        case "string": return writer.write("primitiveString()");

                        case "date": return writer.write("primitiveLocalDate()");
                        case "integer": return writer.write("primitiveInt()");

                        case "branch": return writer.write("primitiveBranch()");
                        case "user": return writer.write("primitiveUser()");

                        default:
                            nevah(def);
                            throw new Error("Unhandled primitive");
                    }
                }

                switch (def.ref_type) {
                    case "has_one": return writer.write(`hasOne(() => ${ def.target })`);
                    case "has_many": return writer.write(`hasMany(() => ${ def.target }, '${ def.backlink }')`);
                    default:
                        nevah(def);
                        throw new Error("Unhandled primitive");
                }
            },
        })),
    });
}

datamodelSource.fixMissingImports(undefined, { importModuleSpecifierPreference: "relative" });
datamodelSource.formatText();

// Disable ts-lint for the file
datamodelSource.insertStatements(0, writer => writer.write("// tslint:disable"));

datamodelSource.save().catch(err => {
    console.error(err);
    process.exit(1);
});
