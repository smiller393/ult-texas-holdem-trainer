# Ultimate Texas Hold'em Trainer

Practice Ultimate Texas Hold'em using the [Wizard of Odds strategy](https://wizardofodds.com/games/ultimate-texas-hold-em/). Works on phone and desktop, and can be added to your home screen.

**Play it:** https://smiller393.github.io/ult-texas-holdem-trainer/

## Features
- **Play**: full hands with Ante/Blind/Play betting and a bankroll. Every decision is graded, and mistakes come with an explanation.
- **Outs Drill**: river practice for the "fewer than 21 dealer outs" rule. Enter your count, pick raise or fold, then see every out grouped by reason (pairs the board, out-kicks you, completes a flush...) on a 52-card grid. Modes: mixed, close calls (16–26 outs), tricky boards.
- **Strategy**: preflop chart, flop and river rules, a method for counting outs, and shortcuts.
- **Stats**: accuracy by street, streaks, outs-count accuracy, and a mistake log where you can replay any river spot.

Stats are stored in your browser's localStorage.

## Strategy used
| Street | Bet | When |
|---|---|---|
| Preflop | 4x | 33+, any A, K-x suited, K5o+, Q6s+, Q8o+, J8s+, JTo |
| Flop | 2x | Two pair or better (using a hole card), hidden pair except pocket 2s, four to a flush with a hidden 10+ of that suit |
| River | 1x | Hidden pair or better, or fewer than 21 dealer outs. Otherwise fold |

A dealer out is one of the 45 unseen cards that, combined with the board, **beats** you. Cards that only tie are not counted.

## Development
No build step. It's plain HTML/CSS/ES modules.

```bash
npm install
npm run serve         # http://localhost:8080
npm test              # unit tests (node --test)
npx playwright install chromium webkit
npm run test:e2e      # desktop Chrome/Safari, iPhone SE, iPhone 15 Pro, Pixel 7
```
