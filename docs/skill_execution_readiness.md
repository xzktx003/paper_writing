# Skill execution readiness contract

Paper Writer must not treat a Skill as executable merely because its YAML or package metadata loaded successfully. Catalog visibility, semantic recommendation, static readiness, and real execution are separate states.

## Execution metadata

A Skill can explicitly declare:

```yaml
requirements:
  commands: []
  credentials: []
  network: []
  files: []
  providerCapabilities: []
sideEffects: []
costClass: free
```

Supported `costClass` values are `free`, `low`, `medium`, and `high`.

Requirements may be strings or objects with `required: false` for optional requirements. File requirements may use `scope: project` or `scope: skill`. Packaged scripts infer their interpreter command (`python3`, `node`, or `bash`) and the `executes-local-commands` side effect, but inference does not make otherwise missing execution metadata authoritative.

## Readiness states

- `ready`: all declared required static requirements are available and no required condition remains unverified.
- `degraded`: execution metadata is missing, a required network target is unverified, or a required project file cannot be checked until a project is selected.
- `unavailable`: a declared required command, credential, file, or Provider capability is missing.

Legacy YAML Skills without explicit execution metadata are deliberately `degraded`. They remain discoverable and recommendable, but the UI must not represent them as proven executable.

An object key whose value is `undefined` is not a declaration. UI projection and API enrichment must omit absent `requirements`, `sideEffects`, and `costClass` fields so a serialization detail cannot turn unknown metadata into `ready`.

## Static readiness check

`POST /api/skills/:name/dry-run` performs a read-only static readiness check. It may:

- look up fixed command names without a shell;
- inspect configured credential presence without returning secret values;
- inspect the configured Provider capability;
- check declared files inside an already resolved project or Skill root;
- report network requirements as verified, missing, or unverified when the caller supplies trusted probe results.

It must not:

- execute Skill scripts;
- call a model;
- access a declared network target by default;
- write project files;
- claim that a successful static check proves task-level output quality.

## Run history boundary

`dryRun` and `lastRun` are different records. A static readiness check updates only `dryRun`. Package tests update `lastRun` with `kind: package-tests`; successful or failed AI requests that actually assemble one or more selected Skills update it with `kind: model-guided-execution`.

`lastRun` is persisted atomically in `<OPENPRISM_DATA_DIR>/.openprism-skill-runs.json` with mode `0600` and is restored after backend restart. Model-guided records contain outcome, duration, Provider/model/version when the adapter supplies provenance, reviewable project-relative artifact paths, cost when available, and declared side effects. They deliberately never contain the user prompt, model response, project absolute root, API key, or bearer token. A successful record proves that the Skill prompt participated in one completed model request; it does not by itself prove scientific correctness or make a `degraded` Skill `ready`.

## UI behavior

- Show readiness, cost class, side effects, and individual checks in Skill management.
- Disable direct activation for `unavailable` Skills.
- Keep `degraded` Skills selectable only with their unverified status visible; they must not be labeled ready.
- Recommendation may preserve the best semantic match, but must expose its readiness and must not silently imply that an unavailable recommendation can run.
- A readiness check button must be described as a static/read-only check, not a rehearsal of real execution.

## Regression evidence

The contract is covered by:

- `app/tests/skillReadiness.test.mjs`
- `app/tests/aiSkillRunLedger.test.mjs`
- `app/tests/skillReadinessUiContract.test.mjs`
- `app/apps/backend/src/routes/__tests__/skills.test.js`
- `app/tests/skillEngine.test.mjs`
- `app/tests/skillCategoryUi.test.mjs`

The runtime audit must also count readiness states after loading the real catalog. At the time this contract was introduced, all 123 legacy Skills correctly remain `degraded` until their manifests explicitly declare execution requirements.

## 当前运行结果语义

`lastRun.status=success` 不表示论文目标或科学结论已经通过。持久化记录同时包含：

- `outcome`：底层执行层面的 `provider_completed`、`provider_failed`、`provider_skipped`、`tests_passed`、`tests_failed`、`tests_skipped`、`execution_completed`、`execution_failed` 或 `unknown`；
- `verificationStatus`：产物或外部验证是否执行；
- `objectiveStatus`：用户目标是否有专门 evaluator 证明，合法值为 `not_evaluated`、`achieved`、`partially_achieved`、`not_achieved`，默认是 `not_evaluated`。

管理界面必须把“Provider 已完成（目标尚未评估）”与“目标已验证”分开显示。未来接入真正的 Skill evaluator 时，只能由 evaluator 明确写入目标状态，不能从模型 HTTP 200 或 package test 通过自动推导。
