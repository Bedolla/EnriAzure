# EnriAzure

EnriAzure lets an LLM work with **Azure DevOps Server 2022 Update 2 installed
on your own infrastructure**.

You can ask the LLM to inspect or manage projects, repositories, pull requests,
work items, sprints, pipelines, deployments, Variable Groups, agents, releases,
artifacts, wikis, tests, permissions, and other Azure DevOps Server resources.

> EnriAzure is only for self-hosted/on-premises Azure DevOps Server. It rejects
> Azure DevOps Services (`dev.azure.com`) and Azure cloud-management APIs.

## What you need

You do not need Azure CLI, an Azure subscription, Microsoft Entra ID, a cloud
SDK, or knowledge of the Azure DevOps REST API.

You need these four things:

1. **A reachable Azure DevOps Server address.** It can use a public or internal
   DNS name, a LAN hostname or IP address, or `localhost` when Azure DevOps
   Server runs on the same computer as EnriAzure. Examples include
   `https://ado.example.test`, `http://ado-server.example.test:8080/tfs`, and
   `http://localhost:8080/tfs`.
2. **A Personal Access Token (PAT) from that Server.** EnriAzure uses the PAT
   like a password. It can do only what the PAT scopes and its owner are allowed
   to do.
3. **Node.js 24 LTS or a newer supported release.** Node.js runs EnriAzure on
   the same computer as your MCP application.
4. **An MCP-compatible application that supports local `stdio` servers.** This
   is the software where you interact with the LLM. It starts the EnriAzure MCP
   server and gives its tools to the LLM.

### Create the PAT

In the Azure DevOps Server web interface:

1. Sign in to the Azure DevOps Server web portal.
2. Open **User settings** and select **Personal access tokens**.
3. Select **+ New Token**.
4. Enter a descriptive name and choose an expiration date.
5. Select the scopes EnriAzure needs. Reading requires the corresponding read
   scopes; creating, changing, or deleting resources requires the corresponding
   write or manage scopes.
6. Select **Create**, copy the token immediately, and store it securely. The
   complete token is not displayed again.

Treat the PAT like a password. Do not post it in an issue, commit it to a
repository, or place it in a file that other users can read. Microsoft provides
additional PAT guidance in
[Use personal access tokens](https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops-2022).

## Configure EnriAzure

Choose one of the following three ways to run EnriAzure. Each configuration
starts the same MCP server and accepts the same environment variables. The
examples use the EnriCode CLI configuration format: add the selected `mcp`
object to the EnriCode CLI JSON configuration.

### Run a local source checkout

Use this option when EnriAzure is already cloned or downloaded on the computer
that runs the MCP application. Install its dependencies and compile the
JavaScript entry point:

```text
git clone https://github.com/Bedolla/EnriAzure.git
cd EnriAzure
npm ci
npm run build
```

Then configure the MCP application to run that compiled file with Node.js:

```json
{
  "mcp": {
    "servers": {
      "EnriAzure": {
        "enabled": true,
        "transport": "stdio",
        "command": "node",
        "args": ["/absolute/path/to/EnriAzure/dist/index.js"],
        "env": {
          "ENRIAZURE_SERVER_URL": "https://ado.example.test",
          "ENRIAZURE_PAT": "PASTE_YOUR_PAT_HERE",
          "ENRIAZURE_WRITE_POLICY": "read-only"
        }
      }
    }
  }
}
```

Replace the argument with the absolute path to the generated `dist/index.js`
file. On Windows, a JSON path looks like
`C:\\Tools\\EnriAzure\\dist\\index.js`.

### Run with `npx` without installing EnriAzure first (recommended)

`npx` is included with npm. No separate EnriAzure installation is required. If
the requested package is not already available, `npx` downloads it from the
configured npm registry into the npm cache and starts it:

```json
{
  "mcp": {
    "servers": {
      "EnriAzure": {
        "enabled": true,
        "transport": "stdio",
        "command": "npx",
        "args": ["--yes", "@bedolla/enriazure@latest"],
        "env": {
          "ENRIAZURE_SERVER_URL": "https://ado.example.test",
          "ENRIAZURE_PAT": "PASTE_YOUR_PAT_HERE",
          "ENRIAZURE_WRITE_POLICY": "read-only"
        }
      }
    }
  }
}
```

`--yes` lets `npx` download the package without an interactive confirmation.
`@latest` selects the newest stable release. On Windows, use `npx.cmd` if the
application says it cannot find `npx`. To keep the same release until you
intentionally update it, replace `@latest` with an exact version, for example
`@bedolla/enriazure@0.1.0`.

### Run a global npm installation

Use this option to install EnriAzure once and update it manually:

```text
npm install --global @bedolla/enriazure@latest
```

The global installation provides the `enriazure` command:

```json
{
  "mcp": {
    "servers": {
      "EnriAzure": {
        "enabled": true,
        "transport": "stdio",
        "command": "enriazure",
        "args": [],
        "env": {
          "ENRIAZURE_SERVER_URL": "https://ado.example.test",
          "ENRIAZURE_PAT": "PASTE_YOUR_PAT_HERE",
          "ENRIAZURE_WRITE_POLICY": "read-only"
        }
      }
    }
  }
}
```

On Windows, npm also creates `enriazure.cmd`; use that command if the MCP
application cannot resolve `enriazure`. Update the installed package later by
running the same
`npm install --global @bedolla/enriazure@latest` command.

### Environment variables used by all three configurations

The examples include the required Server address and PAT plus an explicit
write policy. The following table documents every supported `ENRIAZURE_*`
variable; omit optional variables unless you need to change their default
behavior.

| Variable                            | Required | Accepted values and behavior                                                                                                                                                                                                       |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENRIAZURE_SERVER_URL`              | Yes      | Absolute `http://` or `https://` root of an Azure DevOps Server instance, for example `https://ado.example.test` or `https://ado.example.test/tfs`. Do not include a collection, project, API path, or credentials.                |
| `ENRIAZURE_PAT`                     | Yes      | A non-empty PAT written directly, or an exact reference such as `${AZURE_DEVOPS_SERVER_PAT}`.                                                                                                                                      |
| `ENRIAZURE_DEFAULT_COLLECTION`      | No       | A collection name or ID. Empty or omitted means no default. A tool call can select any other collection, so this does not restrict the Server scope.                                                                               |
| `ENRIAZURE_DEFAULT_PROJECT`         | No       | A project name or ID. Empty or omitted means no default. A tool call can select any other project, so this does not restrict the Server scope.                                                                                     |
| `ENRIAZURE_REQUEST_TIMEOUT_SECONDS` | No       | Positive whole number of seconds allowed for one Server request. Default: `180` (3 minutes).                                                                                                                                       |
| `ENRIAZURE_MAX_RESPONSE_SIZE_MB`    | No       | Maximum whole number of megabytes loaded for one Server response. It does not limit a project or the total data EnriAzure can access. Default: `64`. Increase it only if EnriAzure reports this exact limit.                       |
| `ENRIAZURE_WRITE_POLICY`            | No       | `read-only` allows inspection only; `write` also allows create, edit, run, queue, approve, assign, and upload; `full` additionally allows delete, remove, restore, purge, and complete lifecycle operations. Default: `read-only`. |

Changing the write policy does not grant Azure DevOps permissions. The PAT
owner and PAT permissions must also allow the requested operation.

In all three examples, replace `https://ado.example.test` and
`PASTE_YOUR_PAT_HERE` with your Server root and PAT. In EnriCode CLI,
`mcp.servers.EnriAzure.enabled` enables this server and `transport: "stdio"`
starts it as a local process.

## Keep the PAT outside the MCP configuration

The direct PAT shown above is the simplest first setup. If the MCP
configuration is stored as readable text, keep the PAT in an external
environment variable instead.

First make `AZURE_DEVOPS_SERVER_PAT` available to the process that launches the
MCP application. For example, when starting that application from a terminal:

Windows PowerShell:

```powershell
$env:AZURE_DEVOPS_SERVER_PAT = "YOUR_PAT"
```

macOS or Linux:

```bash
export AZURE_DEVOPS_SERVER_PAT="YOUR_PAT"
```

Then change only the PAT line in the MCP configuration:

```json
{
  "ENRIAZURE_PAT": "${AZURE_DEVOPS_SERVER_PAT}"
}
```

EnriAzure accepts both forms:

- a direct PAT string; or
- an exact `${VARIABLE_NAME}` reference.

If the MCP application expands the reference itself, EnriAzure receives the
PAT. If the application passes the reference literally, EnriAzure resolves it
from the environment inherited when the process starts.

## Select collections and projects

The Server address identifies the installation, not a particular collection or
project. EnriAzure can work with multiple collections and projects from one
process.

The model can discover them by using:

1. `server` with action `list_collections`;
2. `project` with action `list`.

You do not have to configure a default collection or project. If most requests
use the same ones, add these optional values to the MCP server's `env` object:

```json
{
  "ENRIAZURE_DEFAULT_COLLECTION": "DefaultCollection",
  "ENRIAZURE_DEFAULT_PROJECT": "ExampleProject"
}
```

They are conveniences, not restrictions. A tool call can explicitly select a
different collection or project.

Some advanced official operations also accept `scope_level`:

- `instance`: the complete Azure DevOps Server installation;
- `collection`: one project collection;
- `project`: one project;
- `team`: one team inside a project;
- `auto`: infer the scope from the provided values and optional defaults.

EnriAzure accepts only the scope levels supported by the selected Server API.

## What the LLM can manage

| Area          | Examples                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| Server        | Collections and available Server resource areas                              |
| Projects      | Projects, teams, team members, areas, and iterations                         |
| Git           | Repositories, branches, refs, files, commits, pushes, and pull requests      |
| Work tracking | Work items, comments, queries, boards, backlogs, sprints, and capacity       |
| Pipelines     | YAML pipelines, classic builds, runs, logs, artifacts, and timelines         |
| Deployments   | Environments, deployment groups, targets, checks, approvals, and permissions |
| Libraries     | Variable Groups, individual variables, secrets, and Secure Files             |
| Agents        | Agent pools, agents, and project queues                                      |
| Releases      | Classic definitions, releases, stages, deployments, and interventions        |
| Artifacts     | Feeds, views, permissions, packages, versions, retention, and recycle bins   |
| Collaboration | Wikis, pages, policies, service hooks, endpoints, and notifications          |
| Testing       | Test Plans, suites, cases, runs, results, and configurations                 |
| Search        | Code, work item, and wiki search                                             |

Useful requests include:

- “List the collections and projects available on this Azure DevOps Server.”
- “Show me the repositories, active branches, and open pull requests in this
  project.”
- “Show me the failed pipelines and their logs.”
- “Find the cause of the latest failed deployment and identify the resource
  that blocked it.”
- “Review the checks, approvals, and agents blocking the deployment.”
- “List the pending approvals assigned to this user and show their pipeline
  context.”
- “Rerun this failed deployment check and monitor its new result.”
- “Queue this pipeline with these variables and monitor it until it finishes.”
- “List the incomplete work items in the current sprint.”
- “Create the next sprint, assign it to this team, and configure its capacity.”
- “Create a branch and a pull request for this change.”
- “Update this deployment variable without changing the others.”
- “Create a secret Variable Group entry without exposing its value in the
  result.”
- “Review the Variable Groups without revealing secrets.”
- “Show me unavailable agents and queued jobs waiting for an agent.”
- “Run this pipeline and tell me whether the deployment completed successfully.”
- “List failed tests from the latest run and show their error details.”
- “Review the latest classic release and explain which stage needs attention.”
- “List packages in this feed that are deprecated or waiting for cleanup.”
- “Update this wiki page with the final deployment procedure.”

## Variable Group and secret safety

Azure DevOps updates a Variable Group as one complete object even when only one
variable changes. EnriAzure reads and merges the group so an individual update
does not accidentally remove sibling variables, project references, read-only
flags, or existing masked secrets.

For an existing secret variable:

- omit `value` to keep its current secret;
- provide a new value to replace it;
- provide `""` only when you intentionally want an empty value.

When Azure DevOps returns a hidden secret as `null` or asterisks, EnriAzure does
not interpret that as a request to erase it. Secret values and other
credential-shaped fields are removed again before results reach the model.

Secure File contents can be uploaded, but EnriAzure does not download their
contents into model context.

## Troubleshooting

### The MCP application cannot start EnriAzure

Run `node --version` and `npm --version`. Install Node.js 24 or newer if either
command is missing. On Windows, change `npx` to `npx.cmd`.

### The package cannot be downloaded

Confirm that the computer can reach npmjs.com. If the network uses a proxy,
configure npm according to the organization's network policy. A global
installation can be used when the MCP application is not allowed to download a
package at startup.

### The Server address is rejected

Use the Server instance root, such as `https://server.example.test` or
`https://server.example.test/tfs`. Do not include a collection, project, REST
path, query string, username, or password.

### Authentication returns `401` or `403`

Check that the PAT:

- came from this Azure DevOps Server;
- has not expired or been revoked;
- belongs to a user who can access the target resource;
- includes the required read or manage permissions.

Azure DevOps Server PAT authentication can also fail when IIS Basic
Authentication is enabled for the Server site.

### Collections or projects are missing

Remove incorrect default values and ask the model to list collections first,
then projects. A collection and project do not have to share the same name.

### The LLM cannot create, update, or delete

Check both permission layers:

1. `ENRIAZURE_WRITE_POLICY` must allow the action.
2. The PAT owner and PAT scopes must allow the same action in Azure DevOps.

Create and update operations require `write` or `full`. Delete and removal
operations require `full`.

### HTTPS reports a certificate error

No extra setting is needed when HTTPS works normally. Only if EnriAzure reports
a certificate error for a Server that uses an internal certificate authority,
add one of these values to the MCP server's `env` object:

- `"NODE_OPTIONS": "--use-system-ca"` when the computer already trusts that
  internal authority;
- `"NODE_EXTRA_CA_CERTS": "C:\\certificates\\organization-ca.pem"` when the
  Server administrator provides its public CA certificate in PEM format.

Restart the MCP application after changing the configuration. Never use
`NODE_TLS_REJECT_UNAUTHORIZED=0`, because it disables certificate verification.

### A response is too large

This limit applies to one Server response, not to a project or the total data
EnriAzure can access. Ask for a narrower date range, filter, or page. If the
complete response is intentionally larger, increase
`ENRIAZURE_MAX_RESPONSE_SIZE_MB`.

## Further information

- [Capability matrix](docs/CAPABILITIES.md)
- [Official API coverage](docs/OFFICIAL_API_COVERAGE.md)
