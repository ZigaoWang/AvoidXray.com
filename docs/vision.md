# Vision

What each photo shows, for search and "More like this", and whether a new
upload can go public. All of it runs on our own server; no photo is sent to an
outside service.

## The worker

`vision/worker.ts` is a second pm2 process, `avoidxray-vision`, beside the site.

- **Its own process** because its two models hold about 2.1GB resident. In the
  web process that would sit on top of export renders, and a crash in either
  would take down the other. If the worker is down, the site works and uploads
  wait.
- **Models load once at startup** from `.vision-models/` (gitignored, about 1GB,
  downloaded on first start). No visitor waits for a cold load.
- **Loopback only**, on `127.0.0.1:3210`. The site calls it through
  `src/lib/vision.ts` with a 2.5 second timeout, and every call falls back to
  nothing rather than an error.
- **Threads** are a third of the cores, so a backfill does not slow page renders.

## Models

| Job | Model | License |
|---|---|---|
| Embeddings for search and similarity | Google SigLIP 2 Large, 256px, int8 | Apache-2.0 |
| Nudity | Freepik EVA-02 classifier, int8, graded neutral to explicit | MIT |

Chosen by running candidates over every public photo on the site:

- **SigLIP 2 base** mistook a motorcycle for a bicycle and a lake for a camera.
  **So400m** was five times slower than Large with no visible gain. Large reads
  Chinese as well as English.
- **Nudity classifiers.** AdamCodd's scored ordinary photos of clothed people
  at 0.98. Falconsai's scored every public photo under 0.01 but passed the
  Venus de Milo at 0.000, so it knew explicit images and not nudity. Freepik's
  scored no public photo at 0.5 or above (the highest was 0.34), the Venus de
  Milo at 0.73 and Botticelli's Venus, covered by her hair, at 0.11. Its file
  is pinned to one revision and checked by hash on download.

## Screening

`Photo.screening` is `PENDING`, `CLEAR`, `HELD` or `REJECTED`. Only `CLEAR` is
public (`PUBLIC_PHOTO` in `src/lib/photoVisibility.ts`, and the raw SQL feeds).
The owner sees their photo in every state, with a line on its page saying why
nobody else can.

1. A new upload starts `PENDING`. Photos from before screening existed were
   migrated as `CLEAR`.
2. The worker scores it: the probability of partial nudity plus explicit. At
   or above 0.5 it becomes `HELD` and the owner gets a notification saying
   so; otherwise `CLEAR`. This usually takes seconds.
3. Admins decide held photos at `/admin/screening`, blurred until revealed:
   approve makes it `CLEAR`, keep hidden makes it `REJECTED`. Both can be
   undone there, and the owner is notified of the outcome. Nothing is deleted.

Each score is stored with the classifier's name (`nudityModel`). A photo scored
by an older classifier is scored again, and held if the new one flags it, so
changing the model re-checks the whole library. An approved photo keeps its
score and is not held again until the model changes.
The admin page warns when an upload has waited more than ten minutes, which
means the worker is not running.

## The queue

There is no job table; the Photo table is the queue. `PENDING` photos go first,
oldest first. Then any published photo without an embedding from the current
model, newest first. Each batch of eight downloads its thumbnails together.

`PhotoEmbedding` stores the raw vector with the name of the model that made
it. Vectors from different models cannot be compared, so changing the model
re-embeds everything without a separate backfill.

## Search

A query is encoded three ways ("a photo of …", "a film photo of …", "a picture
of …") and averaged. Each photo is scored by its **margin**: how much more it
matches the query than it matches neutral prompts ("something", "a photo").

Raw similarity was tried first and failed. Some photos and some phrases score
high against everything, so "double exposure" gave 76% to ordinary buildings,
and no single cutoff both kept real cats and dropped junk.

The cutoff is a margin of 0.025, measured over every photo on the site.
Subjects in none of them, like giraffes and kangaroos, top out between 0.020
and 0.027; most real matches score above 0.03. A query with nothing above the
cutoff shows no results. Animals the photos do not contain can still find their
nearest look-alike: "tiger" finds a cat.

The worker returns ids for every photo it has seen, private ones included.
`/search` looks them up through the usual visibility and block filters, ranks
them in the worker's order, and puts caption matches after them.

Known limit: darkroom vocabulary ("double exposure", "overexposed") matches
loosely. Subjects and scenes are reliable.

## More like this

The strip under a photo ranks by visual similarity first, then by shared film
and camera, still at most two frames per photographer. With the worker down it
is the gear tiers alone, as before.

## The word filter

`src/lib/wordFilter.ts`, built on the `obscenity` library plus short Chinese
lists. Slurs, sexual words, swearing and common Chinese insults are refused in
usernames, display names, comments, bios, captions, notes and album names.
Search refuses the same words plus requests for nudity.

A refused search shows no results and does not repeat the query.
`scripts/test/wordFilter.test.ts` holds the innocent words the library's
patterns once caught, such as "Scunthorpe" and "shiitake".
