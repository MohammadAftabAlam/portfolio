# Aftab — portfolio (React + Vite + Three.js)

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

## Make it yours

- **All text, experience, stack and contact details:** edit `src/data.js`.
  Optional fields (`jobTitle`, `company`, extra `bullets`) only appear once you fill them in.
- **Accent colour:** `--amber` in `src/styles.css` and `edgeActive` / `packetRequest` in `src/three/theme.js`.
- **Resume:** put your PDF in a `public/` folder and set its `href` in the Resume entry of `src/data.js`.

## The 3D animation (`src/three/`)

Three.js is used across the whole page, all in one visual style: dark schematic shapes, thin
constant-width lines, amber highlights, bloom and eased motion.

| File | Where it shows | What it does |
| --- | --- | --- |
| `Backdrop.jsx` | Behind the whole page | Faint grid that flows towards you and drifting wire boxes. Scrolling lifts the camera and speeds the grid up, then it settles (eased). |
| `SystemScene.jsx` + `buildSystem.js` + `packets.js` | Hero | Flutter apps, REST API, Spring Boot, Hibernate, MySQL, with request and response packets. |
| `ExperienceScene.jsx` | Experience | Three apps, each built once in Flutter and shipped to iOS and Android. |
| `StackScene.jsx` | Stack | Four layers with a packet running down a rail. Hover a stack card to hold that layer lit. |
| `ContactScene.jsx` | Contact | Wireframe globe with a pinging marker and a satellite orbit. |
| `stage.js`, `wire.js` | Shared | Renderer, camera, damped OrbitControls, bloom, labels and render loop; wire-shape helpers. |
| `easing.js`, `theme.js`, `postprocessing.js` | Shared | Easing curves, colours, bloom pass. |

Each diagram only runs while it is on screen and is created only when you scroll near it. With
reduced motion turned on you get still frames, and a text version shows if WebGL is unavailable.

## Publish it

```bash
npm run build    # creates the dist/ folder
```

Upload `dist/` to Netlify, Vercel, Cloudflare Pages or GitHub Pages.
