/**
 * YouTube MCP Server -- Production-ready
 *
 * Provides tools to interact with the YouTube Data API v3 on behalf of the
 * authenticated user.  Credentials are injected via the GOOGLE_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * The YouTube API uses the 'part' parameter extensively to control which
 * resource properties are included in the response.
 *
 * Tools:
 *   youtube_search            -- Search for videos, channels, and playlists
 *   youtube_get_video         -- Get details of a single video
 *   youtube_list_videos       -- List popular or specified videos
 *   youtube_get_channel       -- Get channel details
 *   youtube_list_playlists    -- List playlists for a channel
 *   youtube_get_playlist_items -- Get items in a playlist
 *   youtube_list_comments     -- List comment threads on a video
 *   youtube_post_comment      -- Post a top-level comment on a video
 *   youtube_list_subscriptions -- List subscriptions for the authenticated user
 *   youtube_get_captions      -- List captions/subtitles for a video
 *   youtube_list_categories   -- List video categories for a region
 *   youtube_get_analytics     -- Get basic channel analytics via the Data API
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'youtube',
  baseUrl: 'https://www.googleapis.com/youtube/v3',
  tokenEnvVar: 'GOOGLE_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'youtube-mcp',
  version: '0.1.0',
})

// ---- youtube_search -------------------------------------------------------

server.tool(
  'youtube_search',
  'Search for YouTube videos, channels, or playlists. Returns a list of matching resources with IDs and snippets.',
  {
    query: z.string().describe('Search query string (e.g. "typescript tutorial", "cooking recipes")'),
    type: z
      .enum(['video', 'channel', 'playlist'])
      .optional()
      .describe('Restrict results to a specific resource type (default: all types)'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (1-50, default 5)'),
    order: z
      .enum(['date', 'rating', 'relevance', 'title', 'viewCount'])
      .optional()
      .describe('Sort order for the results (default: relevance)'),
    channel_id: z
      .string()
      .optional()
      .describe('Restrict search to a specific channel ID'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous response for pagination'),
    published_after: z
      .string()
      .optional()
      .describe('Filter results published after this datetime (RFC 3339, e.g. "2024-01-01T00:00:00Z")'),
    published_before: z
      .string()
      .optional()
      .describe('Filter results published before this datetime (RFC 3339, e.g. "2024-12-31T23:59:59Z")'),
  },
  async ({ query, type, max_results, order, channel_id, page_token, published_after, published_before }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: 'snippet',
        q: query,
        type,
        maxResults: max_results !== undefined ? String(max_results) : undefined,
        order,
        channelId: channel_id,
        pageToken: page_token,
        publishedAfter: published_after,
        publishedBefore: published_before,
      }
      const result = await call('/search', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_get_video ----------------------------------------------------

server.tool(
  'youtube_get_video',
  'Get detailed information about a single YouTube video including statistics, content details, and snippet.',
  {
    video_id: z.string().describe('The ID of the video to retrieve (e.g. "dQw4w9WgXcQ")'),
    part: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of resource parts to include (e.g. "snippet,statistics,contentDetails,status,player"). Defaults to "snippet,statistics,contentDetails".',
      ),
  },
  async ({ video_id, part }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: part || 'snippet,statistics,contentDetails',
        id: video_id,
      }
      const result = await call('/videos', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_list_videos --------------------------------------------------

server.tool(
  'youtube_list_videos',
  'List popular videos or retrieve multiple videos by ID. When chart is "mostPopular", returns trending videos for the specified region.',
  {
    chart: z
      .enum(['mostPopular'])
      .optional()
      .describe('Chart to retrieve. Use "mostPopular" for trending videos.'),
    video_ids: z
      .string()
      .optional()
      .describe('Comma-separated list of video IDs to retrieve (e.g. "id1,id2,id3"). Mutually exclusive with chart.'),
    part: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of resource parts (e.g. "snippet,statistics,contentDetails"). Defaults to "snippet,statistics".',
      ),
    region_code: z
      .string()
      .optional()
      .describe('ISO 3166-1 alpha-2 country code for regional results (e.g. "US", "GB", "JP")'),
    category_id: z
      .string()
      .optional()
      .describe('Video category ID to filter by (use youtube_list_categories to find IDs)'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (1-50, default 5)'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous response for pagination'),
  },
  async ({ chart, video_ids, part, region_code, category_id, max_results, page_token }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: part || 'snippet,statistics',
        chart,
        id: video_ids,
        regionCode: region_code,
        videoCategoryId: category_id,
        maxResults: max_results !== undefined ? String(max_results) : undefined,
        pageToken: page_token,
      }
      const result = await call('/videos', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_get_channel --------------------------------------------------

server.tool(
  'youtube_get_channel',
  'Get detailed information about a YouTube channel including subscriber count, video count, and description.',
  {
    channel_id: z
      .string()
      .optional()
      .describe('The channel ID to look up. Provide either channel_id or for_username.'),
    for_username: z
      .string()
      .optional()
      .describe('The username (legacy) of the channel. Provide either channel_id or for_username.'),
    part: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of resource parts (e.g. "snippet,statistics,contentDetails,brandingSettings"). Defaults to "snippet,statistics,contentDetails".',
      ),
  },
  async ({ channel_id, for_username, part }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: part || 'snippet,statistics,contentDetails',
        id: channel_id,
        forUsername: for_username,
      }
      const result = await call('/channels', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_list_playlists -----------------------------------------------

server.tool(
  'youtube_list_playlists',
  'List playlists for a specific channel or the authenticated user. Returns playlist titles, descriptions, and item counts.',
  {
    channel_id: z
      .string()
      .optional()
      .describe('Channel ID whose playlists to list. Omit to list the authenticated user\'s playlists.'),
    mine: z
      .boolean()
      .optional()
      .describe('Set to true to list the authenticated user\'s playlists (requires OAuth). Mutually exclusive with channel_id.'),
    part: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of resource parts (e.g. "snippet,contentDetails,status"). Defaults to "snippet,contentDetails".',
      ),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (1-50, default 5)'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous response for pagination'),
  },
  async ({ channel_id, mine, part, max_results, page_token }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: part || 'snippet,contentDetails',
        channelId: channel_id,
        mine: mine !== undefined ? String(mine) : undefined,
        maxResults: max_results !== undefined ? String(max_results) : undefined,
        pageToken: page_token,
      }
      const result = await call('/playlists', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_get_playlist_items -------------------------------------------

server.tool(
  'youtube_get_playlist_items',
  'Get the items (videos) in a specific YouTube playlist. Returns video IDs, titles, and positions.',
  {
    playlist_id: z.string().describe('The ID of the playlist to retrieve items from'),
    part: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of resource parts (e.g. "snippet,contentDetails,status"). Defaults to "snippet,contentDetails".',
      ),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (1-50, default 5)'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous response for pagination'),
  },
  async ({ playlist_id, part, max_results, page_token }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: part || 'snippet,contentDetails',
        playlistId: playlist_id,
        maxResults: max_results !== undefined ? String(max_results) : undefined,
        pageToken: page_token,
      }
      const result = await call('/playlistItems', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_list_comments ------------------------------------------------

server.tool(
  'youtube_list_comments',
  'List comment threads on a YouTube video. Returns top-level comments with reply counts and like counts.',
  {
    video_id: z.string().describe('The ID of the video to list comments for'),
    part: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of resource parts (e.g. "snippet,replies"). Defaults to "snippet".',
      ),
    order: z
      .enum(['time', 'relevance'])
      .optional()
      .describe('Comment sort order: "time" (newest first) or "relevance" (top comments). Default: time.'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of comment threads to return (1-100, default 20)'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous response for pagination'),
  },
  async ({ video_id, part, order, max_results, page_token }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: part || 'snippet',
        videoId: video_id,
        order,
        maxResults: max_results !== undefined ? String(max_results) : undefined,
        pageToken: page_token,
      }
      const result = await call('/commentThreads', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_post_comment -------------------------------------------------

server.tool(
  'youtube_post_comment',
  'Post a new top-level comment on a YouTube video. Requires OAuth authentication with the youtube.force-ssl scope.',
  {
    video_id: z.string().describe('The ID of the video to comment on'),
    text: z.string().describe('The text content of the comment (supports basic HTML formatting)'),
    channel_id: z
      .string()
      .optional()
      .describe('The channel ID of the authenticated user posting the comment'),
  },
  async ({ video_id, text, channel_id }) => {
    try {
      const body: Record<string, unknown> = {
        snippet: {
          videoId: video_id,
          topLevelComment: {
            snippet: {
              textOriginal: text,
            },
          },
        },
      }
      if (channel_id) {
        (body.snippet as Record<string, unknown>).channelId = channel_id
      }

      const qp: Record<string, string | undefined> = {
        part: 'snippet',
      }
      const result = await call('/commentThreads', { method: 'POST', body, query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_list_subscriptions -------------------------------------------

server.tool(
  'youtube_list_subscriptions',
  'List subscriptions for the authenticated user or a specific channel. Returns channel titles and subscription details.',
  {
    mine: z
      .boolean()
      .optional()
      .describe('Set to true to list the authenticated user\'s subscriptions. Mutually exclusive with channel_id.'),
    channel_id: z
      .string()
      .optional()
      .describe('Channel ID whose subscriptions to list. Mutually exclusive with mine.'),
    part: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of resource parts (e.g. "snippet,contentDetails"). Defaults to "snippet".',
      ),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (1-50, default 5)'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous response for pagination'),
  },
  async ({ mine, channel_id, part, max_results, page_token }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: part || 'snippet',
        mine: mine !== undefined ? String(mine) : undefined,
        channelId: channel_id,
        maxResults: max_results !== undefined ? String(max_results) : undefined,
        pageToken: page_token,
      }
      const result = await call('/subscriptions', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_get_captions -------------------------------------------------

server.tool(
  'youtube_get_captions',
  'List available caption tracks (subtitles) for a YouTube video. Returns language, name, and track kind for each caption.',
  {
    video_id: z.string().describe('The ID of the video to list captions for'),
    part: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of resource parts (e.g. "snippet,id"). Defaults to "snippet".',
      ),
  },
  async ({ video_id, part }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: part || 'snippet',
        videoId: video_id,
      }
      const result = await call('/captions', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_list_categories ----------------------------------------------

server.tool(
  'youtube_list_categories',
  'List YouTube video categories for a specific region. Returns category IDs and titles useful for filtering videos.',
  {
    region_code: z
      .string()
      .optional()
      .describe('ISO 3166-1 alpha-2 country code (e.g. "US", "GB", "JP"). Defaults to "US".'),
    part: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of resource parts. Defaults to "snippet".',
      ),
  },
  async ({ region_code, part }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: part || 'snippet',
        regionCode: region_code || 'US',
      }
      const result = await call('/videoCategories', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- youtube_get_analytics ------------------------------------------------

server.tool(
  'youtube_get_analytics',
  'Get basic analytics for the authenticated user\'s channel using the Data API. Returns channel statistics including view count, subscriber count, and video count.',
  {
    part: z
      .string()
      .optional()
      .describe(
        'Comma-separated list of resource parts (e.g. "snippet,statistics,contentDetails"). Defaults to "statistics".',
      ),
  },
  async ({ part }) => {
    try {
      const qp: Record<string, string | undefined> = {
        part: part || 'statistics',
        mine: 'true',
      }
      const result = await call('/channels', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
