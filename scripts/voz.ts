// Genera la voz en off de un video con ElevenLabs (modelo Eleven v4,
// voz "Lina - Sunny, Kind and Friendly").
//
// Uso:
//   npm run voz -- <nombre> "Texto del guion"
//   npm run voz -- <nombre> --archivo guiones/<nombre>.txt
//
// Crea en public/voz/:
//   <nombre>.mp3   el audio, listo para usar con <Audio src={staticFile("voz/<nombre>.mp3")} />
//   <nombre>.json  duración y tiempos de cada palabra (para subtítulos)

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MODELO = "eleven_v4";
const NOMBRE_VOZ = "Lina - Sunny, Kind and Friendly";
// Mismos valores que en la web de ElevenLabs (Estabilidad al 50 %, Similitud al 75 %).
const AJUSTES_VOZ = { stability: 0.5, similarityBoost: 0.75 };
const FORMATO = "mp3_44100_128";
const CARPETA_SALIDA = path.join("public", "voz");

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const salir = (mensaje: string): never => {
  console.error(mensaje);
  process.exit(1);
};

const leerArgumentos = () => {
  const [nombre, ...resto] = process.argv.slice(2);
  if (!nombre || resto.length === 0) {
    salir(
      'Uso: npm run voz -- <nombre> "Texto del guion"\n' +
        "     npm run voz -- <nombre> --archivo guiones/<nombre>.txt",
    );
  }
  const texto =
    resto[0] === "--archivo"
      ? readFileSync(resto[1] ?? salir("Falta la ruta después de --archivo"), "utf8")
      : resto.join(" ");
  if (!texto.trim()) {
    salir("El texto está vacío.");
  }
  return { nombre, texto: texto.trim() };
};

const esLina = (nombre: string | undefined) =>
  (nombre ?? "").toLowerCase().startsWith("lina");

// Busca a Lina primero en "Mis voces" y, si no está, en la biblioteca pública
// (en ese caso la añade a "Mis voces", que es lo que exige la API).
const buscarVoz = async (cliente: ElevenLabsClient): Promise<string> => {
  if (process.env.ELEVENLABS_VOICE_ID) {
    return process.env.ELEVENLABS_VOICE_ID;
  }

  const propias = await cliente.voices.search({ search: "Lina" });
  const propia =
    propias.voices.find((v) => v.name === NOMBRE_VOZ) ??
    propias.voices.find((v) => esLina(v.name));
  if (propia) {
    console.log(`Voz encontrada en "Mis voces": ${propia.name} (${propia.voiceId})`);
    return propia.voiceId;
  }

  const compartidas = await cliente.voices.getShared({ search: "Lina Sunny" });
  const compartida =
    compartidas.voices.find((v) => v.name === NOMBRE_VOZ) ??
    compartidas.voices.find((v) => esLina(v.name));
  if (!compartida) {
    return salir(
      `No encontré la voz "${NOMBRE_VOZ}". Copia su ID desde ElevenLabs ` +
        "y ponlo en .env como ELEVENLABS_VOICE_ID=...",
    );
  }
  const agregada = await cliente.voices.share(
    compartida.publicOwnerId,
    compartida.voiceId,
    { newName: compartida.name },
  );
  console.log(`Voz añadida a "Mis voces": ${compartida.name} (${agregada.voiceId})`);
  return agregada.voiceId;
};

type Palabra = { texto: string; inicio: number; fin: number };

const agruparPalabras = (
  caracteres: string[],
  inicios: number[],
  fines: number[],
): Palabra[] => {
  const palabras: Palabra[] = [];
  let actual: Palabra | null = null;
  caracteres.forEach((c, i) => {
    if (/\s/.test(c)) {
      actual = null;
      return;
    }
    if (actual) {
      actual.texto += c;
      actual.fin = fines[i];
    } else {
      actual = { texto: c, inicio: inicios[i], fin: fines[i] };
      palabras.push(actual);
    }
  });
  return palabras;
};

const main = async () => {
  const { nombre, texto } = leerArgumentos();
  const apiKey =
    process.env.ELEVENLABS_API_KEY ||
    salir("Falta ELEVENLABS_API_KEY en el archivo .env (mira .env.example).");

  const cliente = new ElevenLabsClient({ apiKey });
  const vozId = await buscarVoz(cliente);

  console.log(`Generando "${nombre}" con ${MODELO}...`);
  const respuesta = await cliente.textToSpeech.convertWithTimestamps(vozId, {
    text: texto,
    modelId: MODELO,
    outputFormat: FORMATO,
    voiceSettings: AJUSTES_VOZ,
  });

  const alineacion = respuesta.alignment;
  const palabras = alineacion
    ? agruparPalabras(
        alineacion.characters,
        alineacion.characterStartTimesSeconds,
        alineacion.characterEndTimesSeconds,
      )
    : [];
  const duracionSegundos = alineacion
    ? alineacion.characterEndTimesSeconds[alineacion.characterEndTimesSeconds.length - 1]
    : null;

  mkdirSync(CARPETA_SALIDA, { recursive: true });
  const rutaAudio = path.join(CARPETA_SALIDA, `${nombre}.mp3`);
  const rutaDatos = path.join(CARPETA_SALIDA, `${nombre}.json`);
  writeFileSync(rutaAudio, Buffer.from(respuesta.audioBase64, "base64"));
  writeFileSync(
    rutaDatos,
    JSON.stringify(
      { texto, vozId, modelo: MODELO, duracionSegundos, palabras },
      null,
      2,
    ) + "\n",
  );

  console.log(`Listo: ${rutaAudio} (${duracionSegundos?.toFixed(2) ?? "?"} s)`);
  console.log(`       ${rutaDatos} (${palabras.length} palabras con tiempos)`);
};

main().catch((error: unknown) => {
  salir(`Error de ElevenLabs: ${error instanceof Error ? error.message : String(error)}`);
});
