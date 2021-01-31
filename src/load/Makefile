.PHONY: generate db
generate: datamodel.ts db dataset dataset_branches dataset_ids model/watdiv_model
	npx ts-node -T -r reflect-metadata/Reflect ./generate.ts

db:
	npm run task start_db

model/watdiv_model: model/watdiv_model_source
	cat model/watdiv_model_source | sed 's/^\s*//g' | grep -Pv "^\/\/" | grep -Pv "^\s*$$" > model/watdiv_model

datamodel.ts: model/watdiv_model generate_datamodel.ts
	npx ts-node -T ./generate_datamodel.ts

dataset_branches: dataset
	fgrep "/branch" dataset > dataset_branches

dataset_ids: dataset
	fgrep "/id" dataset > dataset_ids
