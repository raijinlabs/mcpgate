/**
 * Twitter MCP Server -- Production-ready
 *
 * Provides tools to interact with the Twitter (X) API v2 on behalf of the
 * authenticated user.  Credentials are injected via the TWITTER_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   twitter_create_tweet        -- Create a new tweet
 *   twitter_delete_tweet        -- Delete a tweet by ID
 *   twitter_get_tweet           -- Get a single tweet by ID
 *   twitter_search_tweets       -- Search recent tweets
 *   twitter_get_user            -- Get a user by ID
 *   twitter_get_user_by_username -- Get a user by username
 *   twitter_get_user_tweets     -- Get tweets authored by a user
 *   twitter_like_tweet          -- Like a tweet on behalf of a user
 *   twitter_unlike_tweet        -- Unlike a previously liked tweet
 *   twitter_follow_user         -- Follow a user
 *   twitter_get_followers       -- Get followers of a user
 *   twitter_get_following       -- Get users that a user is following
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'twitter',
  baseUrl: 'https://api.twitter.com/2',
  tokenEnvVar: 'TWITTER_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'twitter-mcp',
  version: '0.1.0',
})

// ---- twitter_create_tweet -------------------------------------------------

server.tool(
  'twitter_create_tweet',
  'Create a new tweet. Optionally reply to an existing tweet or quote another tweet. Returns the created tweet ID and text.',
  {
    text: z.string().describe('The text content of the tweet (max 280 characters)'),
    reply_to: z
      .string()
      .optional()
      .describe('Tweet ID to reply to. The new tweet will appear as a reply in that thread.'),
    quote_tweet_id: z
      .string()
      .optional()
      .describe('Tweet ID to quote. The referenced tweet will be embedded in the new tweet.'),
  },
  async ({ text, reply_to, quote_tweet_id }) => {
    try {
      const body: Record<string, unknown> = { text }
      if (reply_to !== undefined) {
        body.reply = { in_reply_to_tweet_id: reply_to }
      }
      if (quote_tweet_id !== undefined) {
        body.quote_tweet_id = quote_tweet_id
      }

      const result = await call('/tweets', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_delete_tweet -------------------------------------------------

server.tool(
  'twitter_delete_tweet',
  'Delete a tweet by its ID. The authenticated user must own the tweet. Returns deletion confirmation.',
  {
    tweet_id: z.string().describe('The ID of the tweet to delete'),
  },
  async ({ tweet_id }) => {
    try {
      const result = await call(`/tweets/${tweet_id}`, { method: 'DELETE' })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_get_tweet ----------------------------------------------------

server.tool(
  'twitter_get_tweet',
  'Get a single tweet by ID. Supports expansions and tweet.fields for richer data including metrics, author info, and media.',
  {
    tweet_id: z.string().describe('The ID of the tweet to retrieve'),
    tweet_fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of tweet fields to include (e.g. "created_at,public_metrics,author_id,entities,attachments")',
      ),
    expansions: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of expansions (e.g. "author_id,attachments.media_keys,referenced_tweets.id")',
      ),
    user_fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of user fields when author_id is expanded (e.g. "name,username,profile_image_url,verified")',
      ),
    media_fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of media fields when media_keys is expanded (e.g. "url,preview_image_url,type")',
      ),
  },
  async ({ tweet_id, tweet_fields, expansions, user_fields, media_fields }) => {
    try {
      const query: Record<string, string | undefined> = {
        'tweet.fields': tweet_fields,
        expansions,
        'user.fields': user_fields,
        'media.fields': media_fields,
      }
      const result = await call(`/tweets/${tweet_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_search_tweets ------------------------------------------------

server.tool(
  'twitter_search_tweets',
  'Search recent tweets (last 7 days) using the Twitter v2 search endpoint. Supports the full Twitter search query syntax including operators.',
  {
    query: z
      .string()
      .describe(
        'Search query using Twitter search syntax (e.g. "from:user", "#hashtag", "keyword lang:en -is:retweet")',
      ),
    max_results: z
      .number()
      .int()
      .min(10)
      .max(100)
      .optional()
      .describe('Maximum number of results to return (10-100, default 10)'),
    tweet_fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of tweet fields (e.g. "created_at,public_metrics,author_id")',
      ),
    expansions: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of expansions (e.g. "author_id,attachments.media_keys")',
      ),
    next_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response to get the next page of results'),
  },
  async ({ query, max_results, tweet_fields, expansions, next_token }) => {
    try {
      const qp: Record<string, string | undefined> = {
        query,
        max_results: max_results !== undefined ? String(max_results) : undefined,
        'tweet.fields': tweet_fields,
        expansions,
        next_token,
      }
      const result = await call('/tweets/search/recent', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_get_user -----------------------------------------------------

server.tool(
  'twitter_get_user',
  'Get a Twitter user by their numeric ID. Returns profile information including name, bio, and public metrics.',
  {
    user_id: z.string().describe('The numeric ID of the user to retrieve'),
    user_fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of user fields (e.g. "name,username,description,public_metrics,profile_image_url,verified,created_at")',
      ),
  },
  async ({ user_id, user_fields }) => {
    try {
      const query: Record<string, string | undefined> = {
        'user.fields': user_fields,
      }
      const result = await call(`/users/${user_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_get_user_by_username -----------------------------------------

server.tool(
  'twitter_get_user_by_username',
  'Get a Twitter user by their username (handle). Returns profile information including name, bio, and public metrics.',
  {
    username: z
      .string()
      .describe('The username (handle) of the user without the @ symbol (e.g. "elonmusk")'),
    user_fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of user fields (e.g. "name,username,description,public_metrics,profile_image_url,verified,created_at")',
      ),
  },
  async ({ username, user_fields }) => {
    try {
      const query: Record<string, string | undefined> = {
        'user.fields': user_fields,
      }
      const result = await call(`/users/by/username/${username}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_get_user_tweets ----------------------------------------------

server.tool(
  'twitter_get_user_tweets',
  'Get tweets authored by a specific user. Returns a reverse-chronological timeline of their tweets.',
  {
    user_id: z.string().describe('The numeric ID of the user whose tweets to retrieve'),
    max_results: z
      .number()
      .int()
      .min(5)
      .max(100)
      .optional()
      .describe('Maximum number of results to return (5-100, default 10)'),
    tweet_fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of tweet fields (e.g. "created_at,public_metrics,entities")',
      ),
    expansions: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of expansions (e.g. "attachments.media_keys,referenced_tweets.id")',
      ),
    pagination_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response to get the next page'),
  },
  async ({ user_id, max_results, tweet_fields, expansions, pagination_token }) => {
    try {
      const query: Record<string, string | undefined> = {
        max_results: max_results !== undefined ? String(max_results) : undefined,
        'tweet.fields': tweet_fields,
        expansions,
        pagination_token,
      }
      const result = await call(`/users/${user_id}/tweets`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_like_tweet ---------------------------------------------------

server.tool(
  'twitter_like_tweet',
  'Like a tweet on behalf of the authenticated user. Requires the user ID of the liking user and the tweet ID to like.',
  {
    user_id: z.string().describe('The numeric ID of the authenticated user who is liking the tweet'),
    tweet_id: z.string().describe('The ID of the tweet to like'),
  },
  async ({ user_id, tweet_id }) => {
    try {
      const result = await call(`/users/${user_id}/likes`, {
        method: 'POST',
        body: { tweet_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_unlike_tweet -------------------------------------------------

server.tool(
  'twitter_unlike_tweet',
  'Unlike a previously liked tweet. Removes the like from the specified tweet for the authenticated user.',
  {
    user_id: z.string().describe('The numeric ID of the authenticated user who is unliking the tweet'),
    tweet_id: z.string().describe('The ID of the tweet to unlike'),
  },
  async ({ user_id, tweet_id }) => {
    try {
      const result = await call(`/users/${user_id}/likes/${tweet_id}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_follow_user --------------------------------------------------

server.tool(
  'twitter_follow_user',
  'Follow a user on behalf of the authenticated user. Requires both the source user ID and the target user ID.',
  {
    user_id: z.string().describe('The numeric ID of the authenticated user who will follow'),
    target_user_id: z.string().describe('The numeric ID of the user to follow'),
  },
  async ({ user_id, target_user_id }) => {
    try {
      const result = await call(`/users/${user_id}/following`, {
        method: 'POST',
        body: { target_user_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_get_followers ------------------------------------------------

server.tool(
  'twitter_get_followers',
  'Get followers of a specified user. Returns a paginated list of users who follow the target user.',
  {
    user_id: z.string().describe('The numeric ID of the user whose followers to retrieve'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of results to return (1-1000, default 100)'),
    user_fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of user fields (e.g. "name,username,description,public_metrics")',
      ),
    pagination_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response to get the next page'),
  },
  async ({ user_id, max_results, user_fields, pagination_token }) => {
    try {
      const query: Record<string, string | undefined> = {
        max_results: max_results !== undefined ? String(max_results) : undefined,
        'user.fields': user_fields,
        pagination_token,
      }
      const result = await call(`/users/${user_id}/followers`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twitter_get_following ------------------------------------------------

server.tool(
  'twitter_get_following',
  'Get users that a specified user is following. Returns a paginated list of accounts the target user follows.',
  {
    user_id: z.string().describe('The numeric ID of the user whose following list to retrieve'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of results to return (1-1000, default 100)'),
    user_fields: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of user fields (e.g. "name,username,description,public_metrics")',
      ),
    pagination_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response to get the next page'),
  },
  async ({ user_id, max_results, user_fields, pagination_token }) => {
    try {
      const query: Record<string, string | undefined> = {
        max_results: max_results !== undefined ? String(max_results) : undefined,
        'user.fields': user_fields,
        pagination_token,
      }
      const result = await call(`/users/${user_id}/following`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
