# Monikers Online

IRL party game over Socket.IO — custom cards, 3 rounds, mobile-first.

## Dev

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Deploy (sockets need a real Node host)

**Vercel alone is a bad fit** for this app: party games need long-lived Socket.IO connections and shared in-memory rooms. Vercel’s WebSocket beta still has connection time limits and multiple instances won’t share room state.

**Recommended:** one Render (or Railway/Fly) web service that runs the Express + Socket.IO server and serves the built React app.

1. Push this repo to GitHub
2. [Render → New → Blueprint](https://dashboard.render.com/blueprints) and select the repo (uses `render.yaml`), **or** New Web Service → this repo with:
   - Build: `npm install && npm run build`
   - Start: `npm start`
3. Open the Render URL on phones — same origin, sockets work
