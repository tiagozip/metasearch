# contributing

thanks for wanting to help out! metasearch is a relatively small cloudflare worker, so there's not much to set up.

## getting started

you'll need [bun](https://bun.com) and a cloudflare account (the free tier is fine)

```bash
git clone https://github.com/tiagozip/metasearch.git
cd metasearch
bun install

# the worker signs short-lived search tokens with this secret
echo 'JWT_SECRET=dev-secret' > .env

bun run dev
```

## code style

- use biome for formatting and linting
- we use two-space indentation
- please try to match the surrounding code
- prose and ui copy should all be lowercase

## pull requests

- keep prs focused. one feature or fix per pr is much easier to review.
- describe what changed and why, and include a screenshot or short clip for anything visual.
- please do not ai-generate pr descriptions
- make sure `bun run dev` still works and everything you touched still renders.

## ai policy

we intentionally do not have an AI policy as review is done on a per-case basis.

as long as your code is high-quality, it will get reviewed properly and held to the same standard as any other code.

if you have any other questions, feel free to [email me](mailto:hi@tiago.zip)
