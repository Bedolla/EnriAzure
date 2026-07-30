# Capability Matrix

All tools accept `collection` and `project` when their routes require them.
Configured defaults apply only when omitted. Identifiers accept names or IDs
where the Azure DevOps Server endpoint supports both.

## Coverage levels

EnriAzure exposes 94 MCP tools:

- 34 purpose-built tools for the common workflows summarized below;
- `official_api_catalog`, `official_api`, and `official_api_write` for global
  discovery and execution by exact operation key;
- 57 read/write-separated `official_<area>` tools spanning every one of the 30
  official on-premises areas.

The official layer is generated from 35 Azure DevOps Server 7.1 on-premises
OpenAPI specifications at source commit
`3785641890ef409f82134f5d2fcccb2b2631ab9c`. It contains 889 operations and
2,198 reusable OpenAPI definitions. See
[the generated inventory](OFFICIAL_API_COVERAGE.md) for counts by area.

Purpose-built deployment tools additionally expose the Server 2022 Update 2
Approvals `7.2-preview.2` filters and Checks `7.2-preview.1` evaluation actions
documented for that product update. These endpoint-specific preview contracts
do not replace the stable 7.1 profile or change the generated operation count.

For every generated operation, EnriAzure retains and enforces:

- exact operation key, HTTP method, route template, and API version;
- explicit instance/collection/project/team scope plus every remaining path
  parameter, including intentional bypass of configured defaults;
- documented query parameters, primitive types, formats, and enum values;
- exact inline body shapes plus reusable schemas recursively available through
  `official_api_catalog action=get_schema`;
- documented request headers through a six-header allowlist;
- required request body and JSON, JSON Patch, or octet-stream media type;
- documented response media types, including bounded base64 binary responses;
- read, write, or `full` access classification.

Every operation is enumerated in the schema of its area tool. Automated tests
construct a representative constrained request for all 889 operations and
verify that every operation appears in its matching MCP tool schema. A
protocol-level audit also verifies that all 94 tool titles and every top-level
parameter have detailed model-facing descriptions in Mexican Spanish.

## Purpose-built workflow tools

| Tool             | Read actions                                                                                  | Mutation actions                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `server`         | `info`, `list_collections`, `list_resource_areas`                                             | -                                                                                                                                     |
| `project`        | `list`, `get`, `list_teams`, `get_team`, `list_team_members`                                  | `project_write`: `create`, `update`, `delete`, `create_team`, `update_team`, `delete_team`                                            |
| `repository`     | `list`, `get`, `list_deleted`, branches, items, trees, commits                                | `repository_write`: `create`, `update`, `delete`, `restore`, `purge`, `update_refs`, `push`                                           |
| `pull_request`   | PRs, threads, comments, reviewers, commits, iterations, changes                               | `pull_request_write`: create/update PR, thread/comment/reviewer lifecycle                                                             |
| `work_item`      | Active/recycled work items, batches, WIQL, saved queries, comments, revisions, types, fields  | `work_item_write`: work item/comment/query CRUD plus recycle-bin restore/purge                                                        |
| `board`          | Team settings, backlogs, iterations, iteration/area nodes, capacities, boards                 | `board_write`: sprint/area node CRUD, team iteration assignment, capacity, board/settings updates                                     |
| `pipeline`       | Pipelines, preview, runs, run logs/artifacts, definitions, builds, timelines, logs, artifacts | `pipeline_write`: create/run pipeline, queue/update/cancel/delete build, definition CRUD                                              |
| `deployment`     | Environments, deployment groups/targets, permissions, check evaluations, filtered approvals   | `deployment_write`: environment/deployment-group CRUD, targets, permissions, check CRUD/evaluate/rerun/bypass/defer, approval updates |
| `variable_group` | `list`, `get`; secret values always masked                                                    | `variable_group_write`: `create_group`, `update_group`, `share_group`, `delete_group`, `set_variable`, `delete_variable`              |
| `secure_file`    | `list`, `get` metadata without content or download tickets                                    | `secure_file_write`: `upload`, `update_metadata`, `delete`                                                                            |
| `agent_pool`     | Pools, agents, project queues                                                                 | `agent_pool_write`: pool CRUD, agent add/replace/update/delete, queue create/delete                                                   |
| `release`        | Definitions/revisions, releases, deployments, approvals, environments, manual interventions   | `release_write`: definition CRUD, release updates, environment deployment, approval/intervention updates                              |
| `artifact_feed`  | Feeds/deleted feeds, packages/versions, permissions, retention, views                         | `artifact_feed_write`: feed CRUD/restore/purge, permissions, retention, view CRUD, empty recycle bin                                  |
| `wiki`           | Wikis, pages by path/ID, page trees and stats                                                 | `wiki_write`: wiki/page CRUD, page move, ETag-aware updates                                                                           |
| `test`           | Plans, suites, suite cases, runs, results                                                     | `test_write`: plan/suite/run CRUD, add/remove suite cases, add/update results                                                         |
| `search`         | `code`, `work_items`, `wiki`                                                                  | -                                                                                                                                     |
| `administration` | Aggregated feed, pool, queue, Variable Group, endpoint, policy, hook, and release reads       | `administration_write`: aggregated agent, endpoint, policy, hook, and release mutations                                               |
| `raw_rest`       | Same-host `_apis/` `GET`/`HEAD`, optional binary response, safe headers, and all four scopes  | `raw_rest_write`: `POST`/`PUT`/`PATCH`/`DELETE`, JSON/Patch/binary body, safe headers, and all four scopes                            |

## Variable Group safety

Azure DevOps has no single-variable REST update. `set_variable` and
`delete_variable` therefore:

1. enforce the mutation policy before any network request;
2. read the current project-scoped group;
3. reject non-native group types;
4. clone the complete variable map;
5. change only the selected variable;
6. retain sibling variables, `isReadOnly`, project references, and secret
   entries represented by `value: null, isSecret: true`;
7. update the complete group through the collection-scoped API;
8. redact secret values again before returning the result.

Creating or replacing a secret requires an explicit new value. Preserving an
existing secret does not. Changing a secret to non-secret without providing its
replacement value fails. Variable and group deletion require the `full` write
policy, which means complete CRUD including delete and removal.

## Azure DevOps lifecycle semantics

EnriAzure exposes every supported verb for the listed resources, but it does
not invent operations absent from Azure DevOps Server:

- pull requests transition to `abandoned` or `completed`; the server has no PR
  delete API;
- test results support create/update, not deletion;
- project queues support create/delete, not an independent update endpoint;
- publishing package payloads uses NuGet, npm, Maven, or Universal Package
  protocols, while the MCP manages feed lifecycle and package metadata;
- Secure File content can be uploaded, but reads intentionally return metadata
  only so encrypted deployment material is never copied into model context.

The guarded `raw_rest` tools remain available for documented on-premises APIs
outside Microsoft's published specifications, such as server extensions. They
are not counted as coverage for the 889 official operations. They support
bounded base64 binary bodies/responses plus `If-Match`, `If-None-Match`,
`Range`, `Content-Range`, `ETag`, and continuation-token request headers; host,
credentials, cookies, and arbitrary headers remain unavailable.

## Opaque bodies

Complex payloads remain explicit `body` objects instead of being flattened into
lossy MCP fields:

- work item changes use JSON Patch arrays;
- Git pushes use native `refUpdates` and `commits`;
- build definitions and YAML run resources retain their native structure;
- policies, service endpoints, checks, hooks, releases, and test entities
  preserve provider- and extension-specific properties.

The purpose-built tool still owns the route, method, API version, content type,
concurrency header, and mutation risk. Official area tools derive those same
constraints from the checked-in generated operation definition rather than
accepting an arbitrary path. Models discover complete body structure with
`official_api_catalog get_schema`, which returns a root definition and its
transitive local dependencies (at most 47 in the audited official contracts).
