# Fetch Maze

A maze game for kids and grown-ups. Help the dog fetch its ball. Every round is a new maze, and every maze can be solved.

- 15 levels in three tiers: Easy, Medium and Hard. Each level is bigger and twistier than the last.
- A trail shows where you have been, and your best time is saved for each level.
- Play with the arrow keys or WASD, by dragging on a touch screen, or with an on-screen joystick.
- Pick your dog's collar color. Sounds are made in the browser and can be turned off.
- Works on phones, tablets and computers.

## Play it on your computer

1. At the top of this page, click the green **Code** button, then **Download ZIP**.
2. Unzip the file you downloaded. You get a folder called `fetch-maze-main`.
3. Open that folder and double-click `index.html`. The game opens in your web browser.

There's nothing to install and no account to make.

## How to play

- Press **Start**, or the Enter key, to begin.
- Move the dog one cell at a time with the arrow keys or WASD. Hold a key to keep walking, and let go to stop.
- On a touch screen, drag in the direction you want to go. Keep your finger down to keep walking, and lift it to stop.
- To use the joystick, switch on **Joystick** under the maze, or press **J**. You can turn it on or off at any time.
- The clock starts on your first move. Reach the orange ball to finish.
- When you finish, **Next level** takes you to a slightly bigger maze.
- Press **Esc** to pause. The maze hides while the game is paused, so pausing can't help your time.
- Press **M** to turn sound on or off.
- On the start screen, tap a dot to choose a level, or tap **Easy**, **Medium** or **Hard** to jump to that group. The left and right arrow keys move between levels too. Solved levels fill in with your collar color.

## Change it

The settings are at the top of `src/game.js`. After any change, run `python3 build.py` (plain Python 3, no packages), then reload `index.html`.

**Levels.** Each group of levels is one line in `TIERS`:

```js
const TIERS = [
  { tag: "Easy",   sizes: [7, 8, 9, 10, 11],    twist: [0.35, 0.6],  straight: [0.5, 0.35] },
  { tag: "Medium", sizes: [12, 13, 14, 15, 16], twist: [0.65, 0.85], straight: [0.3, 0.15] },
  { tag: "Hard",   sizes: [17, 18, 19, 21, 23], twist: [0.9, 1],     straight: [0.1, 0] }
];
```

- `sizes` is the number of cells on each side, one number per level.
- `twist` makes halls longer and windier as it goes up, from 0 to 1.
- `straight` makes halls run straight for longer as it goes up, from 0 to 1.

Add or remove numbers in `sizes` to change how many levels a group has.

**Collar colors.** Add a color in two places: a `--collar-<name>` line in the `:root` block of `src/page.html`, and the same name in `COLLARS` in `src/game.js`.

**Speed.** `MOVE` sets how long one step takes and how fast the dog walks while you hold a key.

## Put it online for free

Fetch Maze is a few plain files with no build step needed to run it, so any free static web host can serve it. With GitHub Pages:

1. Sign in to GitHub and click **Fork** at the top of this page to make your own copy.
2. In your copy, open **Settings**, then **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and click **Save**.
4. After a minute or two, your game is live at `https://<your-username>.github.io/fetch-maze/`.

On another host, upload these three files together:

- `index.html`: the game
- `og-image.png`: the picture shown when the link is shared
- `apple-touch-icon.png`: the icon for "Add to Home Screen" on iPhone and iPad

### Nicer link previews (optional)

The game works without this step. LinkedIn and X only show the preview picture when the page gives its full address, so once you know where the game lives, rebuild with that address (ending in a slash) and upload the new `index.html`:

```
python3 build.py --url https://<your-username>.github.io/fetch-maze/
```

## Project layout

```
index.html            the built game (deploy this)
build.py              joins src/ into index.html
src/page.html         title, colors, fonts, styles and the screens
src/game.js           the game: settings, mazes, moving, input, sounds, effects, saving
src/dog.js            the dog and the ball, drawn in code
src/favicon.png       the tab icon (built into index.html)
og-image.png          link preview picture, 1200 x 630
apple-touch-icon.png  home screen icon, 180 x 180
```

## How it works

- Plain HTML, CSS and JavaScript. The maze is drawn on one canvas, and the menus and cards are regular HTML. There are no dependencies. The only outside request is the Nunito font from Google Fonts, used where the Apple rounded font is missing.
- Mazes are carved with a "growing tree" method: every cell joins every other cell by exactly one path, so a maze can always be solved. If the path from start to ball is too short for the level, the maze is carved again.
- The dog and ball are drawn with canvas paths and shading, not images. The dog walks, wags, blinks and turns to face where it's going.
- One press moves the dog one cell. Holding waits a moment, then keeps stepping at a steady pace. The dog never moves on its own.
- Sounds are made with the Web Audio API and start after your first key press or tap.
- Your level, collar, sound and joystick choices and your best times are kept in `localStorage` under `fetch-maze-v1`. Nothing leaves your browser.
- Motion is reduced when your device asks for reduced motion.

## License

Fetch Maze is free and open source under the [MIT License](LICENSE). Anyone, schools included, can use it, change it and share it, as long as they keep the license file with it.

Made by Ansu Badjie.
