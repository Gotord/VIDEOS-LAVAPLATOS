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

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
