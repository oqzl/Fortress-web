# Fortress-web

A browser reimplementation of SSI's 1983 abstract strategy game FORTRESS by Jim Templeman and Patty Denbrook

This repository does not include original game assets. The board, castle graphics, UI, and AI are new implementations based on documented rules and descriptions of the original game

## Rules implemented

- 6×6 board
- Each player gets 21 moves by default; game length is configurable from 1 to 54 moves per player
- On a move, place a strength-1 castle on any empty square or fortify one of your castles up to strength 3
- A castle projects its strength onto its own square and the four cardinally adjacent squares
- The side with more total influence controls a square; ties are neutral
- A castle on an enemy-controlled square is destroyed
- A newly placed suicidal castle contributes its influence before destruction, so mutually destructive moves are possible
- Defeated castles from a move are removed simultaneously
- The winner is the side controlling more squares after both players have used all moves

## Modes

- Human vs CPU
- Local two-player hot-seat

The five CPU profiles use modern search/evaluation code to approximate the documented personalities of The Squire, Sir Galahad, Genghis Khan, Lord Maginot, and Count Vauban. They do not reproduce the original game's adaptive-learning implementation

## Development

```sh
npm ci
npm test
npm run dev
```

The browser source lives under `web/`. Vite writes the production bundle to `.build/`

## Deployment

Production is configured for Cloudflare Workers Static Assets

- Worker name: `fortress-web`
- Production domain: `fortress.oqzl.net`
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Static assets: `.build/`

For a manual authenticated deployment:

```sh
npm ci
npm test
npm run deploy
```

`wrangler.jsonc` declares `fortress.oqzl.net` as a Cloudflare Worker Custom Domain, so Cloudflare manages the DNS record and certificate when the deployment is applied

## Sources

- Computer Gaming World, issue 3.6 (December 1983), review of FORTRESS
- SSI catalog descriptions of FORTRESS
- C64-Wiki: Fortress (SSI)
- Peterb, “Bonaguil 0.1” (2004), a rules-focused reimplementation that documents suicidal placement behavior
