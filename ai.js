export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };

  if (!env.AI) {
    return new Response(JSON.stringify({
      error: "Workers AI no está conectado. En Cloudflare, añade el binding AI al proyecto Pages y vuelve a desplegar."
    }), { status: 503, headers });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Solicitud JSON no válida." }), { status: 400, headers });
  }

  const type = String(body.type || "texto").slice(0, 30);
  const idea = String(body.idea || "").trim().slice(0, 1800);
  const style = String(body.style || "creativo y claro").slice(0, 100);

  if (!idea) {
    return new Response(JSON.stringify({ error: "Escribe una idea antes de generar." }), { status: 400, headers });
  }

  try {
    if (type === "imagen") {
      const prompt = `${idea}. Estilo visual: ${style}. Composición clara, sujeto principal definido, iluminación coherente, alta calidad.`;
      const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
        prompt,
        num_steps: 4
      });
      let imageBytes;
      if (result instanceof ReadableStream) {
        imageBytes = new Uint8Array(await new Response(result).arrayBuffer());
      } else if (result && result.image) {
        const binary = atob(result.image);
        imageBytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      } else {
        throw new Error("El modelo no devolvió una imagen en un formato reconocido.");
      }
      let binaryString = "";
      for (let i = 0; i < imageBytes.length; i += 0x8000) {
        binaryString += String.fromCharCode(...imageBytes.subarray(i, i + 0x8000));
      }
      return new Response(JSON.stringify({
        kind: "image",
        image: `data:image/png;base64,${btoa(binaryString)}`
      }), { status: 200, headers });
    }

    let task;
    if (type === "video") {
      task = `Prepara un prompt detallado en español para una herramienta externa de generación de vídeo (no generes ni afirmes adjuntar un vídeo). Idea: ${idea}. Estilo: ${style}. Incluye formato sugerido, escenas, movimiento de cámara, iluminación, continuidad y cierre.`;
    } else if (type === "redes") {
      task = `Crea una publicación para redes sociales en español sobre: ${idea}. Estilo: ${style}. Incluye un gancho, texto breve, llamada a la acción y hashtags pertinentes.`;
    } else if (type === "mejorar") {
      task = `Mejora y estructura este prompt en español: ${idea}. Estilo: ${style}. Incluye sujeto, entorno, acción, composición, iluminación, paleta y detalles relevantes.`;
    } else {
      task = `Responde en español. Tipo de contenido: ${type}. Idea: ${idea}. Estilo: ${style}. Crea un borrador original, útil y claro. No inventes datos verificables; marca los puntos que deban comprobarse.`;
    }

    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [
        { role: "system", content: "Eres el asistente creativo de NovaIA Studio. Responde en español, de forma útil y concisa." },
        { role: "user", content: task }
      ],
      max_tokens: 650,
      temperature: 0.7
    });

    const text = result?.response || result?.result?.response || "";
    if (!text) throw new Error("El modelo no devolvió texto.");
    return new Response(JSON.stringify({ kind: "text", text }), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({
      error: "La generación con IA ha fallado. Comprueba el estado del modelo y los límites de tu cuenta de Cloudflare.",
      detail: String(error?.message || error).slice(0, 240)
    }), { status: 502, headers });
  }
}
