# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i --loglevel=error
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Voz en off con ElevenLabs

Las voces se generan con el modelo **Eleven v4** y la voz **Lina - Sunny, Kind and Friendly**
(Estabilidad 50 %, Similitud 75 %, MP3 44.1 kHz 128 kbps).

1. Copia `.env.example` como `.env` y pon tu `ELEVENLABS_API_KEY`. El archivo `.env` no se sube a GitHub.
2. Genera la voz de un video:

```console
npm run voz -- anuncio1 "Tu lavaplatos queda brillante en minutos."
npm run voz -- anuncio1 --archivo guiones/anuncio1.txt
```

Esto crea `public/voz/anuncio1.mp3` (el audio) y `public/voz/anuncio1.json`
(duración y tiempos de cada palabra, para subtítulos). En Remotion:

```tsx
<Audio src={staticFile("voz/anuncio1.mp3")} />
```

## Clips de video con Higgsfield (Seedance 2.5)

Los clips se generan con el modelo `bytedance/seedance-2.5/text-to-video` usando el SDK oficial
`@higgsfield/client`. **Cada clip se cobra** (aprox. US$0.46 por segundo a 720p, según la
documentación del modelo).

1. Crea `.env.local` con tu clave, copiada tal cual desde
   [open.higgsfield.ai/api-keys](https://open.higgsfield.ai/api-keys) (formato `key-id:key-secret`).
   El archivo `.env.local` no se sube a GitHub.

```console
HF_CREDENTIALS=tu-key-id:tu-key-secret
```

2. Genera un clip (por defecto: 5 s, 720p, vertical 9:16, sin audio porque la voz va aparte):

```console
npm run clip -- escena1 "Plato brillante saliendo del lavaplatos, luz cálida"
npm run clip -- escena2 "Cocina moderna, cámara lenta" --duracion 8 --resolucion 1080p --formato 16:9 --con-audio
npm run clip -- escena1 --continuar   # si se cortó la espera: la generación sigue en Higgsfield
npm run clip -- escena1 --cancelar    # solo funciona mientras está en cola
```

Esto crea `public/clips/escena1.mp4` y `public/clips/escena1.json` (request_id y estado).
En Remotion:

```tsx
<OffthreadVideo src={staticFile("clips/escena1.mp4")} />
```

`npm run higgsfield:ejemplo` ejecuta el ejemplo mínimo del SDK (una generación facturable de 5 s, 720p, 16:9).

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
