This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The API server requires an OpenRouter API key. Set `OPENROUTER_API_KEY` in
`.env.local` before starting the app. `OPENROUTER_MODEL` is optional and
defaults to `openrouter/free`, which routes requests to an available free model.
OpenRouter account privacy settings (including Zero Data Retention) can exclude
all free providers. If that happens, choose a compatible model/provider or
review the account's [Privacy Settings](https://openrouter.ai/settings/privacy).

### User attachment uploads

The Fluina API uploads attachments directly from the browser to a **private**
Cloudflare R2 bucket, then passes short-lived signed URLs to OpenRouter for
images and PDFs. Text attachments are read by the API from that bucket. Set
these variables on the Fluina API service, using an R2 token with access to the
private upload bucket:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_UPLOAD_BUCKET`: the private bucket for user attachments.

The upload bucket must allow browser `PUT` requests from the Fluina site origin
with the `Content-Type` request header. Configure a one-day R2 lifecycle
expiration rule for the `uploads/` prefix in this bucket. Uploads use random
object keys in a shared prefix; there is no per-user account or folder.
Fluina attempts to delete uploaded objects when AI processing ends or fails;
the one-day lifecycle rule is a fallback for abandoned uploads or failed
deletions. Fluina does not impose attachment count or file-size caps, but R2,
OpenRouter, and selected model/provider limits still apply.

## Manim visual answers

When the assistant decides a diagram or animation will help, it can request a
still image or short video. The API sends a validated scene description to the
separate Manim renderer in `renderer/`; generated Python is never executed.

Deploy the root `render.yaml` as a Render Blueprint, then set these variables
on the Fluina API service:

- `MANIM_RENDERER_URL`: the public URL of the Render service, without a trailing
  slash.
- `MANIM_RENDERER_TOKEN`: the same secret value as the renderer's `RENDER_TOKEN`.

On the renderer, Render's Blueprint generates `RENDER_TOKEN` and asks for the
Cloudflare R2 settings. Finished media is uploaded to a **private** R2 bucket
under `media/` and served through signed URLs that expire after 24 hours:

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: an R2 API token
  with Object Read & Write on the media bucket.
- `R2_BUCKET`: the bucket name.

No Render disk is needed. The renderer also compiles the bounded vector-point preprocessing helper with
Cython. Cython does not accelerate Manim's Cairo/FFmpeg rendering itself, so
any broader speed claim should be based on measured render timings.

The visual scene format supports text, safe-subset math formulas, circles,
rectangles, lines, and plotted point sequences. Configure a one-day R2
lifecycle expiration rule for the `media/` prefix in the renderer's bucket.
Keep public access disabled. The bucket's CORS policy should allow `GET` and
`HEAD` from the Fluina site origin so generated images, videos, and captions can
be loaded in the browser.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
