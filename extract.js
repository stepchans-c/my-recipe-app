// api/extract.js  — Vercel Serverless Function
// Safely calls Anthropic API server-side (API key never exposed to browser)

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, recipeText } = req.body || {};
  if (!url && !recipeText) {
    return res.status(400).json({ error: "Missing url or recipeText" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured in Vercel environment variables" });
  }

  // Build prompt — if raw text was passed (scraped by client), use it; otherwise use URL hint
  const userContent = recipeText
    ? `以下是從食譜網頁抓取的原始文字內容，請從中提取食譜資料：\n\n${recipeText.slice(0, 6000)}`
    : `食譜網址：${url}\n\n請根據網址路徑（例如 /black_pepper_beef/）推斷並生成一個合理、詳細的中文食譜。`;

  const prompt = `你是專業食譜解析AI。${userContent}

請只回傳以下 JSON 格式，不要有任何其他文字、說明或 markdown 符號：
{
  "name": "菜式中文名稱",
  "category": "從以下選一個最合適的：牛肉、雞肉、豬肉、意粉、海鮮、飲品、甜品、其它",
  "ingredients": ["食材1（含份量）", "食材2（含份量）"],
  "steps": ["步驟1", "步驟2", "步驟3"]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Anthropic API error" });
    }

    const raw = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Failed to parse recipe: " + err.message });
  }
}
