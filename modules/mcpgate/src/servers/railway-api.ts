/**
 * Railway API MCP Server -- Production-ready
 *
 * Provides tools to interact with the Railway GraphQL API (v2) on behalf of
 * the authenticated user.  Credentials are injected via the RAILWAY_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Named "railway-api" to avoid a clash with the Railway CLI MCP server.
 *
 * Tools:
 *   railway_list_projects    -- List all projects
 *   railway_get_project      -- Get project details with services
 *   railway_list_services    -- List services in a project
 *   railway_get_service      -- Get service details
 *   railway_list_deployments -- List deployments for a service
 *   railway_get_deployment   -- Get deployment details
 *   railway_list_variables   -- List environment variables
 *   railway_set_variable     -- Create or update an environment variable
 *   railway_deploy_service   -- Trigger a redeployment of a service
 *   railway_get_logs         -- Get logs for a deployment
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createGraphQLClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// GraphQL client
// ---------------------------------------------------------------------------

const { query, categoriseError } = createGraphQLClient({
  name: 'railway',
  endpoint: 'https://backboard.railway.app/graphql/v2',
  tokenEnvVar: 'RAILWAY_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'railway-api-mcp',
  version: '0.1.0',
})

// ---- railway_list_projects ------------------------------------------------

server.tool(
  'railway_list_projects',
  'List all projects accessible by the authenticated Railway user. Returns project IDs, names, and descriptions.',
  {},
  async () => {
    try {
      const gql = `
        query ListProjects {
          projects {
            edges {
              node {
                id
                name
                description
                createdAt
                updatedAt
              }
            }
          }
        }
      `
      const result = await query(gql)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- railway_get_project --------------------------------------------------

server.tool(
  'railway_get_project',
  'Get detailed information about a Railway project including its services, environments, and metadata.',
  {
    project_id: z
      .string()
      .describe('The ID of the Railway project to retrieve'),
  },
  async ({ project_id }) => {
    try {
      const gql = `
        query GetProject($id: String!) {
          project(id: $id) {
            id
            name
            description
            createdAt
            updatedAt
            environments {
              edges {
                node {
                  id
                  name
                }
              }
            }
            services {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
      `
      const result = await query(gql, { id: project_id })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- railway_list_services ------------------------------------------------

server.tool(
  'railway_list_services',
  'List all services in a Railway project. Returns service IDs, names, and basic configuration.',
  {
    project_id: z
      .string()
      .describe('The ID of the Railway project whose services to list'),
  },
  async ({ project_id }) => {
    try {
      const gql = `
        query ListServices($projectId: String!) {
          project(id: $projectId) {
            services {
              edges {
                node {
                  id
                  name
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }
      `
      const result = await query(gql, { projectId: project_id })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- railway_get_service --------------------------------------------------

server.tool(
  'railway_get_service',
  'Get detailed information about a single Railway service including its configuration and instances.',
  {
    service_id: z
      .string()
      .describe('The ID of the Railway service to retrieve'),
  },
  async ({ service_id }) => {
    try {
      const gql = `
        query GetService($id: String!) {
          service(id: $id) {
            id
            name
            createdAt
            updatedAt
            projectId
          }
        }
      `
      const result = await query(gql, { id: service_id })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- railway_list_deployments ---------------------------------------------

server.tool(
  'railway_list_deployments',
  'List deployments for a Railway service within a project. Returns deployment IDs, statuses, timestamps, and metadata. Results are paginated.',
  {
    project_id: z
      .string()
      .describe('The ID of the Railway project'),
    service_id: z
      .string()
      .describe('The ID of the Railway service whose deployments to list'),
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of deployments to return (1-100, default 25)'),
    after: z
      .string()
      .optional()
      .describe('Cursor for pagination -- pass endCursor from previous response'),
  },
  async ({ project_id, service_id, first, after }) => {
    try {
      const gql = `
        query ListDeployments($projectId: String!, $serviceId: String!, $first: Int, $after: String) {
          deployments(
            input: { projectId: $projectId, serviceId: $serviceId }
            first: $first
            after: $after
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                status
                createdAt
                updatedAt
                meta
              }
            }
          }
        }
      `
      const variables: Record<string, unknown> = {
        projectId: project_id,
        serviceId: service_id,
        first: first ?? 25,
      }
      if (after !== undefined) variables.after = after

      const result = await query(gql, variables)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- railway_get_deployment -----------------------------------------------

server.tool(
  'railway_get_deployment',
  'Get detailed information about a single Railway deployment including its status, build logs reference, and meta.',
  {
    deployment_id: z
      .string()
      .describe('The ID of the deployment to retrieve'),
  },
  async ({ deployment_id }) => {
    try {
      const gql = `
        query GetDeployment($id: String!) {
          deployment(id: $id) {
            id
            status
            createdAt
            updatedAt
            meta
            staticUrl
            environmentId
            serviceId
            projectId
          }
        }
      `
      const result = await query(gql, { id: deployment_id })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- railway_list_variables -----------------------------------------------

server.tool(
  'railway_list_variables',
  'List environment variables for a service in a specific environment. Returns variable names and values.',
  {
    project_id: z
      .string()
      .describe('The ID of the Railway project'),
    environment_id: z
      .string()
      .describe('The ID of the environment (e.g. production, staging)'),
    service_id: z
      .string()
      .describe('The ID of the service whose variables to list'),
  },
  async ({ project_id, environment_id, service_id }) => {
    try {
      const gql = `
        query ListVariables($projectId: String!, $environmentId: String!, $serviceId: String!) {
          variables(
            projectId: $projectId
            environmentId: $environmentId
            serviceId: $serviceId
          )
        }
      `
      const result = await query(gql, {
        projectId: project_id,
        environmentId: environment_id,
        serviceId: service_id,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- railway_set_variable -------------------------------------------------

server.tool(
  'railway_set_variable',
  'Create or update an environment variable for a service. If the variable already exists it will be overwritten. Returns the updated variable state.',
  {
    project_id: z
      .string()
      .describe('The ID of the Railway project'),
    environment_id: z
      .string()
      .describe('The ID of the environment'),
    service_id: z
      .string()
      .describe('The ID of the service'),
    name: z
      .string()
      .describe('Variable name (e.g. "DATABASE_URL")'),
    value: z
      .string()
      .describe('Variable value'),
  },
  async ({ project_id, environment_id, service_id, name, value }) => {
    try {
      const gql = `
        mutation VariableUpsert($input: VariableUpsertInput!) {
          variableUpsert(input: $input)
        }
      `
      const result = await query(gql, {
        input: {
          projectId: project_id,
          environmentId: environment_id,
          serviceId: service_id,
          name,
          value,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- railway_deploy_service -----------------------------------------------

server.tool(
  'railway_deploy_service',
  'Trigger a redeployment of a Railway service in a specific environment. Returns confirmation of the redeployment.',
  {
    service_id: z
      .string()
      .describe('The ID of the service to redeploy'),
    environment_id: z
      .string()
      .describe('The ID of the environment to redeploy in'),
  },
  async ({ service_id, environment_id }) => {
    try {
      const gql = `
        mutation ServiceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
          serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
        }
      `
      const result = await query(gql, {
        serviceId: service_id,
        environmentId: environment_id,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- railway_get_logs -----------------------------------------------------

server.tool(
  'railway_get_logs',
  'Get logs for a specific Railway deployment. Returns log lines with timestamps and severity levels.',
  {
    deployment_id: z
      .string()
      .describe('The ID of the deployment whose logs to retrieve'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .describe('Maximum number of log lines to return (1-5000, default 100)'),
    filter: z
      .string()
      .optional()
      .describe('Filter logs by keyword or pattern'),
  },
  async ({ deployment_id, limit, filter }) => {
    try {
      const gql = `
        query DeploymentLogs($deploymentId: String!, $limit: Int, $filter: String) {
          deploymentLogs(
            deploymentId: $deploymentId
            limit: $limit
            filter: $filter
          ) {
            timestamp
            message
            severity
            attributes
          }
        }
      `
      const variables: Record<string, unknown> = {
        deploymentId: deployment_id,
      }
      if (limit !== undefined) variables.limit = limit
      if (filter !== undefined) variables.filter = filter

      const result = await query(gql, variables)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
