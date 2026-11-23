const ALLOWED_ORIGIN = "https://sakshitiwari7598-pixel.github.io";
const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const INSTRUCTIONS = `You are HBT ANUJ, a friendly, patient and encouraging AI learning companion for school and college students.
LANGUAGE RULE: Reply in the same language and style the user uses in their latest message. If they write in Hindi, reply in natural Hindi; if English, reply in English; if Hinglish, reply in natural Hinglish. Follow language switches naturally. Do not force English.
FRIEND MODE: When the user says "hello bhai", "hi bhai", "hey bhai", or clearly asks to talk like a friend, activate FRIEND MODE. In this mode, answer very briefly and naturally, usually 1–2 short sentences. Be warm, casual, respectful and supportive. Use friendly words such as "bhai" only when they fit. Match the user's language (Hindi, English, or Hinglish) and follow language switches. If the user asks for a detailed explanation, notes, or exam answer, provide the requested detail while keeping a friendly tone. If the user asks to stop friend mode or return to normal/formal mode, do so.
If the user simply greets you, greet them naturally and invite them to chat; do not launch into a lesson or a list of features.
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

function json(data, status = 200, headers = {}) {
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
    if (!env.AI || typeof env.AI.run !== "function") {
      return json({ error: "Cloudflare Workers AI is not connected yet. Add an AI binding named AI in Worker Settings > Bindings." }, 503, headers);
    }

    try {
      const contentLength = Number(request.headers.get("Content-Length") || 0);
      if (contentLength > 24000) return json({ error: "Your request is too large. Please shorten it and try again." }, 413, headers);
      const body = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request format." }, 400, headers);
      if (typeof body.message !== "string") return json({ error: "Please enter a question." }, 400, headers);
      const message = body.message.trim();
      const context = typeof body.context === "string" ? body.context.slice(0, 1200) : "";
      const mode = typeof body.mode === "string" ? body.mode.slice(0, 30) : "tutor";
      const history = Array.isArray(body.history) ? body.history.slice(-8).filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").map(item => ({
        role: item.role,
        content: item.content.slice(0, 1200)
      })) : [];

      if (!message) return json({ error: "Please enter a question." }, 400, headers);
      if (message.length > 7000) return json({ error: "Please keep each request under 7,000 characters." }, 413, headers);

      const prompt = (context ? "Student context: " + context + "\n\n" : "") +
        "Task mode: " + mode + "\n\n" + message;

      const result = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: INSTRUCTIONS },
          ...history,
          { role: "user", content: prompt }
        ],
        max_tokens: 1600,
        chat_template_kwargs: { enable_thinking: false }
      }, { rejectIfBusy: true });

      const answer = result?.response ||
        result?.choices?.[0]?.message?.content ||
        result?.result?.response ||
        "";

      if (!answer) return json({ error: "The AI returned an empty answer. Please try again." }, 502, headers);
      return json({ answer: String(answer) }, 200, headers);
    } catch (error) {
      const message = String(error?.message || "");
      const safeMessage = /limit|quota|capacity|neurons|billing|busy/i.test(message)
        ? "The AI service is busy or its free usage limit may have been reached. Please wait and try again."
        : "Cloudflare AI could not process this request. Please try again in a moment.";
      return json({ error: safeMessage }, 502, headers);
    }
  }
};
