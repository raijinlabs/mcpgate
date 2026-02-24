/**
 * LinkedIn MCP Server -- Production-ready
 *
 * Provides tools to interact with the LinkedIn REST API v2 on behalf of the
 * authenticated user.  Credentials are injected via the LINKEDIN_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   linkedin_get_profile      -- Get the authenticated user's profile
 *   linkedin_create_post      -- Create a UGC post (text, article, image)
 *   linkedin_delete_post      -- Delete a UGC post by ID
 *   linkedin_get_connections  -- Get the user's connections
 *   linkedin_search_people    -- Search for people on LinkedIn
 *   linkedin_get_company      -- Get an organisation by ID
 *   linkedin_list_companies   -- List companies the user is associated with
 *   linkedin_share_content    -- Share content via the shares API
 *   linkedin_get_analytics    -- Get analytics for the user's posts
 *   linkedin_get_notifications -- Get the user's notifications
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'linkedin',
  baseUrl: 'https://api.linkedin.com/v2',
  tokenEnvVar: 'LINKEDIN_TOKEN',
  authStyle: 'bearer',
  defaultHeaders: {
    'X-Restli-Protocol-Version': '2.0.0',
  },
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'linkedin-mcp',
  version: '0.1.0',
})

// ---- linkedin_get_profile -------------------------------------------------

server.tool(
  'linkedin_get_profile',
  'Get the authenticated user\'s LinkedIn profile. Returns name, headline, vanity name, and profile picture URL.',
  {
    fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated projection fields (e.g. "id,firstName,lastName,profilePicture,headline"). Defaults to full profile.',
      ),
  },
  async ({ fields }) => {
    try {
      const query: Record<string, string | undefined> = {
        projection: fields ? `(${fields})` : undefined,
      }
      const result = await call('/me', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linkedin_create_post -------------------------------------------------

server.tool(
  'linkedin_create_post',
  'Create a UGC (User Generated Content) post on LinkedIn. Supports text posts, articles, and image shares. Returns the created post URN.',
  {
    author: z
      .string()
      .describe(
        'Author URN (e.g. "urn:li:person:MEMBER_ID" or "urn:li:organization:ORG_ID")',
      ),
    text: z.string().describe('The text content of the post'),
    visibility: z
      .enum(['PUBLIC', 'CONNECTIONS'])
      .optional()
      .describe('Post visibility: PUBLIC (anyone) or CONNECTIONS (1st-degree only). Defaults to PUBLIC.'),
    article_url: z
      .string()
      .optional()
      .describe('URL of an article to share along with the post text'),
    article_title: z
      .string()
      .optional()
      .describe('Title for the shared article (used only with article_url)'),
    article_description: z
      .string()
      .optional()
      .describe('Description for the shared article (used only with article_url)'),
  },
  async ({ author, text, visibility, article_url, article_title, article_description }) => {
    try {
      const vis = visibility || 'PUBLIC'
      const shareContent: Record<string, unknown> = {
        shareCommentary: { text },
        shareMediaCategory: article_url ? 'ARTICLE' : 'NONE',
      }

      if (article_url) {
        const media: Record<string, unknown> = {
          status: 'READY',
          originalUrl: article_url,
        }
        if (article_title) media.title = { text: article_title }
        if (article_description) media.description = { text: article_description }
        shareContent.media = [media]
      }

      const body = {
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': shareContent,
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': vis,
        },
      }

      const result = await call('/ugcPosts', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linkedin_delete_post -------------------------------------------------

server.tool(
  'linkedin_delete_post',
  'Delete a UGC post by its URN ID. The authenticated user must be the author of the post.',
  {
    post_id: z
      .string()
      .describe(
        'The UGC post URN-encoded ID (e.g. "urn:li:ugcPost:1234567890"). URL-encoding is handled automatically.',
      ),
  },
  async ({ post_id }) => {
    try {
      const encodedId = encodeURIComponent(post_id)
      const result = await call(`/ugcPosts/${encodedId}`, { method: 'DELETE' })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linkedin_get_connections ---------------------------------------------

server.tool(
  'linkedin_get_connections',
  'Get the authenticated user\'s connections (1st-degree network). Returns a paginated list of connection URNs.',
  {
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based offset for pagination (default 0)'),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of connections to return (1-100, default 50)'),
  },
  async ({ start, count }) => {
    try {
      const query: Record<string, string | undefined> = {
        start: start !== undefined ? String(start) : undefined,
        count: count !== undefined ? String(count) : undefined,
      }
      const result = await call('/connections', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linkedin_search_people -----------------------------------------------

server.tool(
  'linkedin_search_people',
  'Search for people on LinkedIn by keywords. Returns matching profiles with name, headline, and profile URN.',
  {
    keywords: z
      .string()
      .describe('Search keywords to match against people profiles (e.g. "software engineer San Francisco")'),
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based offset for pagination (default 0)'),
    count: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results to return (1-50, default 10)'),
  },
  async ({ keywords, start, count }) => {
    try {
      const query: Record<string, string | undefined> = {
        q: 'people',
        keywords,
        start: start !== undefined ? String(start) : undefined,
        count: count !== undefined ? String(count) : undefined,
      }
      const result = await call('/search/people', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linkedin_get_company -------------------------------------------------

server.tool(
  'linkedin_get_company',
  'Get information about a LinkedIn organisation by its numeric ID. Returns company name, description, industry, and size.',
  {
    organization_id: z
      .string()
      .describe('The numeric organisation ID (e.g. "12345678")'),
    fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated projection fields (e.g. "id,name,description,vanityName,logoV2,staffCount")',
      ),
  },
  async ({ organization_id, fields }) => {
    try {
      const query: Record<string, string | undefined> = {
        projection: fields ? `(${fields})` : undefined,
      }
      const result = await call(`/organizations/${organization_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linkedin_list_companies ----------------------------------------------

server.tool(
  'linkedin_list_companies',
  'List organisations that the authenticated user is an administrator of. Returns company URNs and basic metadata.',
  {
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based offset for pagination (default 0)'),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results to return (1-100, default 50)'),
  },
  async ({ start, count }) => {
    try {
      const query: Record<string, string | undefined> = {
        q: 'roleAssignee',
        role: 'ADMINISTRATOR',
        state: 'APPROVED',
        start: start !== undefined ? String(start) : undefined,
        count: count !== undefined ? String(count) : undefined,
      }
      const result = await call('/organizationalEntityAcls', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linkedin_share_content -----------------------------------------------

server.tool(
  'linkedin_share_content',
  'Share content on LinkedIn using the legacy shares API. Suitable for simple text shares and link shares with commentary.',
  {
    owner: z
      .string()
      .describe(
        'Owner URN (e.g. "urn:li:person:MEMBER_ID" or "urn:li:organization:ORG_ID")',
      ),
    text: z.string().describe('Commentary text for the share'),
    content_url: z
      .string()
      .optional()
      .describe('URL of the content to share (creates a link preview)'),
    content_title: z
      .string()
      .optional()
      .describe('Title for the shared content (used with content_url)'),
    content_description: z
      .string()
      .optional()
      .describe('Description for the shared content (used with content_url)'),
    visibility: z
      .enum(['PUBLIC', 'CONNECTIONS'])
      .optional()
      .describe('Share visibility: PUBLIC or CONNECTIONS (default PUBLIC)'),
  },
  async ({ owner, text, content_url, content_title, content_description, visibility }) => {
    try {
      const body: Record<string, unknown> = {
        owner,
        text: { text },
        distribution: {
          linkedInDistributionTarget: {},
        },
        visibility: {
          code: visibility || 'anyone',
        },
      }

      if (content_url) {
        const contentEntity: Record<string, unknown> = {
          entityLocation: content_url,
        }
        if (content_title) contentEntity.title = content_title
        if (content_description) contentEntity.description = content_description
        body.content = {
          contentEntities: [contentEntity],
        }
      }

      const result = await call('/shares', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linkedin_get_analytics -----------------------------------------------

server.tool(
  'linkedin_get_analytics',
  'Get analytics (share statistics) for the authenticated user\'s content. Returns impressions, clicks, likes, comments, and shares.',
  {
    author: z
      .string()
      .describe(
        'Author URN for which to retrieve analytics (e.g. "urn:li:person:MEMBER_ID")',
      ),
    start_date: z
      .string()
      .optional()
      .describe('Start date in epoch milliseconds for the analytics window'),
    end_date: z
      .string()
      .optional()
      .describe('End date in epoch milliseconds for the analytics window'),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results to return (1-100, default 25)'),
  },
  async ({ author, start_date, end_date, count }) => {
    try {
      const encodedAuthor = encodeURIComponent(author)
      const query: Record<string, string | undefined> = {
        q: 'specificShare',
        'shares[0]': encodedAuthor,
        'timeIntervals.timeGranularityType': 'DAY',
        'timeIntervals.timeRange.start': start_date,
        'timeIntervals.timeRange.end': end_date,
        count: count !== undefined ? String(count) : undefined,
      }
      const result = await call('/organizationalEntityShareStatistics', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linkedin_get_notifications -------------------------------------------

server.tool(
  'linkedin_get_notifications',
  'Get the authenticated user\'s LinkedIn notifications. Returns recent notification events such as likes, comments, and connection requests.',
  {
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based offset for pagination (default 0)'),
    count: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of notifications to return (1-50, default 20)'),
  },
  async ({ start, count }) => {
    try {
      const query: Record<string, string | undefined> = {
        start: start !== undefined ? String(start) : undefined,
        count: count !== undefined ? String(count) : undefined,
      }
      const result = await call('/clientAwareMemberHandles', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
