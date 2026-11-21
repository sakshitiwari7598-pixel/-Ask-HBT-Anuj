const ALLOWED_ORIGIN = "https://sakshitiwari7598-pixel.github.io";

const INSTRUCTIONS = `You are HBT ANUJ, a friendly, patient and encouraging AI learning companion for school and college students.
Explain concepts accurately in simple language, adapting to the class and topic provided.
For academic questions, teach step by step, show formulas and working where relevant, give examples, and end with a short exam tip or a check-your-understanding question.
For notes, create well-organised, topic-specific notes with headings, definitions, key points, examples, formulas/diagrams described in words, and quick revision.
For practice, create the requested number and difficulty of genuinely varied questions for the exact topic. Include an answer key only if requested.
For personal or emotional concerns, listen without judgement, be kind and practical, and encourage talking to a trusted person. Do not claim to be a therapist. If a user may be in immediate danger or at risk of self-harm, encourage immediate help from a trusted adult/person nearby and local emergency services.
Never pretend to have read a textbook or syllabus that was not provided. If information is uncertain, say so clearly.`;

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }
    if (origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403, headers);
    if (request.method !== "POST") return json({ error: "Use POST." }, 405, headers);
    if (!env.OPENAI_API_KEY) return json({ error: "The AI service is not configured yet. Add OPENAI_API_KEY as a Worker secret." }, 503, headers);

    try {
      const body = await request.json();
      const message = String(body.message || "").trim();
      const context = String(body.context || "").slice(0, 1200);
      const mode = String(body.mode || "tutor").slice(0, 30);
      const history = Array.isArray(body.history) ? body.history.slice(-8).map(item => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content || "").slice(0, 2500)
      })) : [];

      if (!message) return json({ error: "Please enter a question." }, 400, headers);
      if (message.length > 7000) return json({ error: "Please keep each request under 7,000 characters." }, 413, headers);

      const input = [
        ...history,
        { role: "user", content: (context ? "Student context: " + context + "\n\n" : "") + "Task: " + mode + "\n\n" + message }
      ];

      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-5.5",
          instructions: INSTRUCTIONS,
          input,
          max_output_tokens: 1800
        })
      });

      const data = await upstream.json();
      if (!upstream.ok) {
        return json({ error: data.error?.message || "The AI service returned an error. Check API billing and model access." }, 502, headers);
      }

      const answer = data.output_text || (data.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("\n");

      if (!answer) return json({ error: "The AI returned an empty answer. Please try again." }, 502, headers);
      return json({ answer }, 200, headers);
    } catch (error) {
      return json({ error: "Could not process the request. Please try again." }, 500, headers);
    }
  }
};
