/**
 * support-knowledge-gap-proxy — Cloudflare Worker
 *
 * Routes:
 *   POST /        → Anthropic Messages API (Claude)
 *   POST /notion  → Create KB page in Notion (properties + page body blocks)
 *
 * Secrets (wrangler secret put):
 *   ANTHROPIC_API_KEY
 *   NOTION_API_KEY
 *
 * Vars (wrangler.toml):
 *   NOTION_DATABASE_ID
 */

const NOTION_VERSION = "2022-06-28";
const ANTHROPIC_VERSION = "2023-06-01";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}

function notionHeaders(env) {
  return {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}

function richText(content) {
  const text = String(content ?? "").slice(0, 2000);
  return [{ type: "text", text: { content: text } }];
}

function headingBlock(text) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: richText(text) }
  };
}

function paragraphBlock(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(text) }
  };
}

function numberedStepBlock(text) {
  return {
    object: "block",
    type: "numbered_list_item",
    numbered_list_item: { rich_text: richText(text) }
  };
}

function buildPageChildren({ summary, description, steps }) {
  const blocks = [];
  const stepList = Array.isArray(steps) ? steps.map(String).filter(Boolean) : [];

  if (summary) {
    blocks.push(headingBlock("Summary"), paragraphBlock(summary));
  }

  if (description) {
    blocks.push(headingBlock("Description"));
    for (const chunk of String(description).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(0, 12)) {
      blocks.push(paragraphBlock(chunk));
    }
  }

  if (stepList.length) {
    blocks.push(headingBlock("Resolution steps"));
    for (const step of stepList) {
      blocks.push(numberedStepBlock(step));
    }
  }

  return blocks;
}

function buildNotionProperties({ title, summary, category, tags }) {
  const tagText = Array.isArray(tags) ? tags.join(", ") : String(tags ?? "");

  return {
    Title: {
      title: [{ type: "text", text: { content: String(title ?? "").slice(0, 2000) } }]
    },
    Summary: {
      rich_text: richText(summary)
    },
    Category: {
      rich_text: richText(category || "General")
    },
    Tags: {
      rich_text: richText(tagText)
    },
    status: {
      status: { name: "Published" }
    }
  };
}

async function handleClaude(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ type: "error", error: { message: "ANTHROPIC_API_KEY not configured" } }, 500);
  }

  const body = await request.json();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}

async function handleNotion(request, env) {
  if (!env.NOTION_API_KEY || !env.NOTION_DATABASE_ID) {
    return jsonResponse(
      { object: "error", message: "NOTION_API_KEY or NOTION_DATABASE_ID not configured" },
      500
    );
  }

  const payload = await request.json();
  const { title, summary, description, category, tags, steps } = payload;

  if (!title || !summary || !description) {
    return jsonResponse(
      { object: "error", message: "title, summary, and description are required" },
      400
    );
  }

  const children = buildPageChildren({ summary, description, steps });
  if (!children.length) {
    return jsonResponse(
      { object: "error", message: "At least summary or description content is required for page content" },
      400
    );
  }

  const notionRes = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: notionHeaders(env),
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DATABASE_ID },
      properties: buildNotionProperties({ title, summary, category, tags }),
      children
    })
  });

  const data = await notionRes.json();
  return new Response(JSON.stringify(data), {
    status: notionRes.status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResponse({ object: "error", message: "Method not allowed" }, 405);
    }

    const { pathname } = new URL(request.url);

    try {
      if (pathname === "/notion" || pathname === "/notion/") {
        return await handleNotion(request, env);
      }
      return await handleClaude(request, env);
    } catch (err) {
      return jsonResponse(
        { object: "error", message: err?.message || "Worker error" },
        500
      );
    }
  }
};
