// Genera clips de video para los anuncios con Higgsfield (Seedance 2.5, texto a video).
//
// Uso:
//   npm run clip -- <nombre> "descripción de la escena" [opciones]
//   npm run clip -- <nombre> --continuar   retoma la espera y la descarga
//   npm run clip -- <nombre> --cancelar    cancela si todavía está en cola
//
// Opciones (por defecto: 5 s, 720p, 9:16, sin audio):
//   --duracion 4..30
//   --resolucion 480p | 720p | 1080p
//   --formato 16:9 | 4:3 | 1:1 | 3:4 | 9:16 | 21:9
//   --con-audio   el modelo genera sonido (por defecto no: la voz va aparte)
//
// Crea en public/clips/:
//   <nombre>.mp4   el clip, listo para <OffthreadVideo src={staticFile("clips/<nombre>.mp4")} />
//   <nombre>.json  registro de la solicitud (request_id, estado, parámetros)
//
// Cada generación se cobra. Si cierras el script mientras espera, la generación
// sigue en Higgsfield: recupérala con --continuar.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHiggsfieldClient } from "@higgsfield/client/v2";
import {
  API_BASE_URL,
  explicarError,
  leerCredenciales,
  rechazadoAntesDeAceptar,
} from "./higgsfield/comun";

// Esquema: https://dash.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/llms.txt
const MODELO = "bytedance/seedance-2.5/text-to-video";
const RESOLUCIONES = ["480p", "720p", "1080p"];
const FORMATOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
// Precio aproximado por segundo, antes de descuentos (misma fuente que el esquema).
const USD_POR_SEGUNDO: Record<string, number> = {
  "480p": 0.2056,
  "720p": 0.4622,
  "1080p": 1.1372,
};
const TERMINALES = ["completed", "failed", "nsfw", "canceled"];
const ESPERA_MAXIMA_MS = 30 * 60 * 1000;
const CARPETA = path.join("public", "clips");

type Entrada = {
  prompt: string;
  duration: number;
  resolution: string;
  aspect_ratio: string;
  generate_audio: boolean;
  output_format: "mp4";
};

type Registro = {
  modelo: string;
  entrada: Entrada;
  // Se guarda antes de enviar: si la red se corta, --continuar reenvía con la
  // misma clave y Higgsfield devuelve la solicitud original sin cobrar otra.
  idempotencyKey: string;
  estado: string;
  requestId?: string;
  statusUrl?: string;
  cancelUrl?: string;
  videoUrl?: string;
  error?: string;
  actualizado?: string;
};

type EstadoApi = {
  status: string;
  request_id: string;
  video?: { url: string };
  error?: string;
};

const USO =
  'Uso: npm run clip -- <nombre> "descripción de la escena" [--duracion 5] [--resolucion 720p] [--formato 9:16] [--con-audio]\n' +
  "     npm run clip -- <nombre> --continuar\n" +
  "     npm run clip -- <nombre> --cancelar";

const salir = (mensaje: string): never => {
  console.error(mensaje);
  process.exit(1);
};

const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const esTerminal = (estado: string) => TERMINALES.indexOf(estado) !== -1;

const leerArgumentos = () => {
  const [nombre, ...resto] = process.argv.slice(2);
  if (!nombre || nombre.startsWith("--")) {
    salir(USO);
  }
  if (!/^[\w-]+$/.test(nombre)) {
    salir("El nombre solo puede tener letras, números, guiones y guiones bajos.");
  }

  let modo: "nuevo" | "continuar" | "cancelar" = "nuevo";
  let duracion = 5;
  let resolucion = "720p";
  let formato = "9:16";
  let conAudio = false;
  const palabras: string[] = [];

  for (let i = 0; i < resto.length; i++) {
    const valor = () => resto[++i] ?? salir(`Falta el valor después de ${resto[i - 1]}`);
    switch (resto[i]) {
      case "--continuar":
        modo = "continuar";
        break;
      case "--cancelar":
        modo = "cancelar";
        break;
      case "--con-audio":
        conAudio = true;
        break;
      case "--duracion":
        duracion = Number(valor());
        break;
      case "--resolucion":
        resolucion = valor();
        break;
      case "--formato":
        formato = valor();
        break;
      default:
        if (resto[i].startsWith("--")) {
          salir(`Opción desconocida: ${resto[i]}\n${USO}`);
        }
        palabras.push(resto[i]);
    }
  }

  const entrada: Entrada = {
    prompt: palabras.join(" ").trim(),
    duration: duracion,
    resolution: resolucion,
    aspect_ratio: formato,
    generate_audio: conAudio,
    output_format: "mp4",
  };
  if (modo === "nuevo") {
    if (!entrada.prompt) {
      salir(`Falta la descripción de la escena.\n${USO}`);
    }
    if (!Number.isInteger(duracion) || duracion < 4 || duracion > 30) {
      salir("--duracion debe ser un número entero entre 4 y 30.");
    }
    if (RESOLUCIONES.indexOf(resolucion) === -1) {
      salir(`--resolucion debe ser una de: ${RESOLUCIONES.join(", ")}`);
    }
    if (FORMATOS.indexOf(formato) === -1) {
      salir(`--formato debe ser uno de: ${FORMATOS.join(", ")}`);
    }
  }
  return { nombre, modo, entrada };
};

const rutaRegistro = (nombre: string) => path.join(CARPETA, `${nombre}.json`);
const rutaVideo = (nombre: string) => path.join(CARPETA, `${nombre}.mp4`);

const leerRegistro = (nombre: string): Registro | null =>
  existsSync(rutaRegistro(nombre))
    ? (JSON.parse(readFileSync(rutaRegistro(nombre), "utf8")) as Registro)
    : null;

const guardarRegistro = (nombre: string, registro: Registro) => {
  mkdirSync(CARPETA, { recursive: true });
  writeFileSync(
    rutaRegistro(nombre),
    JSON.stringify({ ...registro, actualizado: new Date().toISOString() }, null, 2) + "\n",
  );
};

const enviar = async (nombre: string, registro: Registro): Promise<Registro> => {
  const cliente = createHiggsfieldClient({
    credentials: leerCredenciales(),
    baseURL: API_BASE_URL,
    headers: { "Idempotency-Key": registro.idempotencyKey },
  });
  try {
    const respuesta = await cliente.subscribe(MODELO, {
      input: registro.entrada,
      withPolling: false,
    });
    const enviado: Registro = {
      ...registro,
      estado: "queued",
      requestId: respuesta.request_id,
      statusUrl: respuesta.status_url,
      cancelUrl: respuesta.cancel_url,
    };
    guardarRegistro(nombre, enviado);
    console.log(`Aceptado por Higgsfield. request_id: ${respuesta.request_id}`);
    return enviado;
  } catch (error) {
    if (rechazadoAntesDeAceptar(error)) {
      // No se creó nada: se puede volver a intentar desde cero.
      rmSync(rutaRegistro(nombre), { force: true });
    } else {
      console.error(
        "No se sabe si Higgsfield recibió el pedido. Vuelve a intentarlo con " +
          `npm run clip -- ${nombre} --continuar (usa la misma Idempotency-Key, no se cobra dos veces).`,
      );
    }
    throw error;
  }
};

// Consulta el estado con espera creciente (2 s → 10 s) hasta un estado final.
const esperar = async (nombre: string, registro: Registro): Promise<Registro> => {
  const url = registro.statusUrl ?? `${API_BASE_URL}/requests/${registro.requestId}/status`;
  const inicio = Date.now();
  let pausa = 2000;
  let ultimo = "";

  while (Date.now() - inicio < ESPERA_MAXIMA_MS) {
    let respuesta: Response | null = null;
    try {
      respuesta = await fetch(url, {
        headers: { Authorization: `Key ${leerCredenciales()}` },
      });
    } catch {
      // Fallo de red: se reintenta.
    }
    if (respuesta?.status === 401) {
      salir("Higgsfield rechazó la clave (401). Revisa HF_CREDENTIALS en .env.local.");
    }
    if (respuesta?.status === 404) {
      salir(`Higgsfield no encuentra la solicitud ${registro.requestId} en esta cuenta (404).`);
    }
    if (respuesta && !respuesta.ok && respuesta.status !== 429 && respuesta.status < 500) {
      salir(`Higgsfield respondió ${respuesta.status} al consultar el estado.`);
    }
    if (respuesta?.ok) {
      const datos = (await respuesta.json()) as EstadoApi;
      if (datos.status !== ultimo) {
        console.log(`Estado: ${datos.status}`);
        ultimo = datos.status;
      }
      if (esTerminal(datos.status)) {
        const final: Registro = {
          ...registro,
          estado: datos.status,
          videoUrl: datos.video?.url,
          error: datos.error,
        };
        guardarRegistro(nombre, final);
        return final;
      }
    }
    await dormir(pausa + Math.random() * 500);
    pausa = Math.min(pausa * 1.5, 10000);
  }
  return salir(
    `Pasaron 30 minutos y la solicitud sigue en "${ultimo || "sin respuesta"}". ` +
      `La generación continúa en Higgsfield: npm run clip -- ${nombre} --continuar`,
  );
};

const informar = async (nombre: string, registro: Registro) => {
  if (registro.estado === "completed") {
    if (!registro.videoUrl) {
      salir('Higgsfield respondió "completed" pero sin video.url.');
    }
    const videoUrl = registro.videoUrl as string;
    const respuesta = await fetch(videoUrl);
    if (!respuesta.ok) {
      salir(
        `El video está listo pero no pude descargarlo (HTTP ${respuesta.status}).\n` +
          `URL (disponible al menos 7 días): ${videoUrl}`,
      );
    }
    writeFileSync(rutaVideo(nombre), Buffer.from(await respuesta.arrayBuffer()));
    console.log(`Listo: ${rutaVideo(nombre)}`);
    console.log(`URL:   ${videoUrl}`);
    return;
  }
  if (registro.estado === "failed") {
    salir(`La generación falló: ${registro.error ?? "sin detalle"}. Higgsfield devuelve los créditos.`);
  }
  if (registro.estado === "nsfw") {
    salir(
      "La moderación de Higgsfield rechazó el pedido o el resultado. " +
        "Higgsfield devuelve los créditos. Prueba con otra descripción.",
    );
  }
  if (registro.estado === "canceled") {
    salir("La solicitud fue cancelada antes de empezar; no se generó video.");
  }
};

const cancelar = async (registro: Registro, nombre: string) => {
  if (esTerminal(registro.estado)) {
    salir(`La solicitud ya terminó (estado: ${registro.estado}); no hay nada que cancelar.`);
  }
  if (!registro.requestId) {
    salir(`No hay request_id guardado. Usa --continuar para saber si Higgsfield recibió el pedido.`);
  }
  const url = registro.cancelUrl ?? `${API_BASE_URL}/requests/${registro.requestId}/cancel`;
  const respuesta = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Key ${leerCredenciales()}` },
  });
  if (respuesta.status === 202) {
    guardarRegistro(nombre, { ...registro, estado: "canceled" });
    console.log("Cancelación aceptada por Higgsfield; no se generará este clip.");
    return;
  }
  if (respuesta.status === 400) {
    salir("Ya empezó a generarse y no se puede cancelar (solo se cancelan pedidos en cola).");
  }
  salir(`Higgsfield respondió ${respuesta.status} al cancelar.`);
};

const main = async () => {
  const { nombre, modo, entrada } = leerArgumentos();
  const previo = leerRegistro(nombre);

  if (modo !== "nuevo") {
    if (!previo) {
      return salir(`No existe ${rutaRegistro(nombre)}.\n${USO}`);
    }
    if (modo === "cancelar") {
      return cancelar(previo, nombre);
    }
    if (esTerminal(previo.estado)) {
      return informar(nombre, previo);
    }
    const enviado = previo.requestId ? previo : await enviar(nombre, previo);
    return informar(nombre, await esperar(nombre, enviado));
  }

  if (previo && (previo.estado === "completed" || !esTerminal(previo.estado))) {
    salir(
      `Ya existe el clip "${nombre}" (estado: ${previo.estado}). ` +
        (previo.estado === "completed"
          ? "Usa otro nombre para generar uno nuevo."
          : `Para seguir esperándolo: npm run clip -- ${nombre} --continuar`),
    );
  }

  const costo = USD_POR_SEGUNDO[entrada.resolution] * entrada.duration;
  console.log(
    `Generando "${nombre}": ${entrada.duration} s, ${entrada.resolution}, ${entrada.aspect_ratio}, ` +
      `${entrada.generate_audio ? "con" : "sin"} audio (aprox. US$${costo.toFixed(2)}).`,
  );
  const registro: Registro = {
    modelo: MODELO,
    entrada,
    idempotencyKey: randomUUID(),
    estado: "enviando",
  };
  guardarRegistro(nombre, registro);
  const enviado = await enviar(nombre, registro);
  await informar(nombre, await esperar(nombre, enviado));
};

main().catch((error: unknown) => {
  salir(explicarError(error));
});
