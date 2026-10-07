// Ejemplo mínimo del SDK oficial de Higgsfield con Seedance 2.5 (texto a video).
//
// Uso: npm run higgsfield:ejemplo
//
// Hace UNA generación que se cobra (5 s a 720p, aprox. US$2.31 según la
// documentación del modelo). Espera a que termine e imprime la URL del video.

import { randomUUID } from "node:crypto";
import { config, higgsfield } from "@higgsfield/client/v2";
import { API_BASE_URL, explicarError, leerCredenciales } from "./comun";

const main = async () => {
  config({
    credentials: leerCredenciales(),
    baseURL: API_BASE_URL,
    // Un video puede tardar varios minutos; por defecto el SDK espera solo 5.
    maxPollTime: 30 * 60 * 1000,
    // El SDK reintenta el envío si se corta la red; con esta clave Higgsfield
    // devuelve la misma solicitud en vez de crear (y cobrar) otra.
    headers: { "Idempotency-Key": randomUUID() },
  });

  const result = await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });

  console.log(`request_id: ${result.request_id}`);
  // El tipo del SDK no incluye "canceled" ni "error", aunque la API los devuelve.
  const status: string = result.status;
  const detalle = (result as { error?: string }).error;

  if (status === "completed" && result.video?.url) {
    console.log(`Video: ${result.video.url}`);
    return;
  }
  if (status === "completed") {
    console.error('Higgsfield respondió "completed" pero sin video.url.');
  } else if (status === "failed") {
    console.error(`La generación falló: ${detalle ?? "sin detalle"} (Higgsfield devuelve los créditos).`);
  } else if (status === "nsfw") {
    console.error("La moderación de Higgsfield rechazó el pedido o el resultado (Higgsfield devuelve los créditos).");
  } else if (status === "canceled") {
    console.error("La solicitud fue cancelada antes de empezar; no se generó video.");
  } else {
    console.error(`Estado inesperado: ${status}`);
  }
  process.exitCode = 1;
};

main().catch((error: unknown) => {
  console.error(explicarError(error));
  process.exitCode = 1;
});
