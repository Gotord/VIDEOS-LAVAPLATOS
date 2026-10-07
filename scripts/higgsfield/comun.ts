// Utilidades compartidas por los scripts de Higgsfield (scripts/clip.ts y el ejemplo).
// La clave vive en .env.local (no se sube a GitHub) y nunca se imprime.

import { existsSync } from "node:fs";
import {
  APIError,
  AuthenticationError,
  BadInputError,
  CredentialsMissedError,
  NotEnoughCreditsError,
  TimeoutError,
  ValidationError,
} from "@higgsfield/client/v2";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// Solo se cambia para pruebas contra un servidor local.
export const API_BASE_URL =
  process.env.HF_API_BASE_URL || "https://api.higgsfield.ai";

// Devuelve la clave completa "key-id:key-secret" tal como se copió de open.higgsfield.ai.
export const leerCredenciales = (): string => {
  const credenciales = (process.env.HF_CREDENTIALS ?? "").trim();
  if (!credenciales) {
    throw new CredentialsMissedError();
  }
  if (credenciales.split(":").length !== 2) {
    throw new Error(
      "HF_CREDENTIALS en .env.local debe tener el formato key-id:key-secret " +
        "(cópiala tal cual desde open.higgsfield.ai/api-keys).",
    );
  }
  return credenciales;
};

// Errores en los que Higgsfield rechazó el pedido antes de aceptarlo: no se creó
// ninguna generación ni se cobró nada.
export const rechazadoAntesDeAceptar = (error: unknown): boolean =>
  error instanceof CredentialsMissedError ||
  error instanceof AuthenticationError ||
  error instanceof NotEnoughCreditsError ||
  error instanceof ValidationError ||
  error instanceof BadInputError;

export const explicarError = (error: unknown): string => {
  if (error instanceof CredentialsMissedError) {
    return "Falta HF_CREDENTIALS en .env.local (formato key-id:key-secret).";
  }
  if (error instanceof AuthenticationError) {
    return "Higgsfield rechazó la clave (401). Revisa HF_CREDENTIALS en .env.local.";
  }
  if (error instanceof NotEnoughCreditsError) {
    return "Higgsfield respondió 403: no hay créditos suficientes en la cuenta.";
  }
  if (error instanceof ValidationError || error instanceof BadInputError) {
    return `Higgsfield rechazó los parámetros (${error.statusCode}): ${error.message}`;
  }
  if (error instanceof TimeoutError) {
    return (
      `${error.message}. La generación puede seguir en curso en Higgsfield. ` +
      'Ojo: el SDK no reconoce el estado "canceled", así que una solicitud cancelada también acaba aquí.'
    );
  }
  if (error instanceof APIError) {
    return `Error de la API de Higgsfield (${error.statusCode ?? "sin código"}): ${error.message}`;
  }
  if (error instanceof TypeError && error.message === "fetch failed") {
    return "No se pudo conectar con Higgsfield (fetch failed). Revisa la conexión a internet.";
  }
  return error instanceof Error ? error.message : String(error);
};
