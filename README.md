# Grounded Answers

Grounded Answers is my redesign of AWS Docs AI, the AI answer feature in the AWS documentation search. I'm a senior UX designer, and this is Demo 1 of a self-directed project where I learn to design and build AI products with Claude.

I audited AWS Docs AI on AWS Data Exchange and Amazon S3 pages. I found that you can't stop a response, it gives no sign of how confident it is, its source lists are noisy, and follow-up questions can lose or mix up context. This repo builds the fixes one component at a time. It uses Cloudscape (AWS's open source design system) inside the current Docs AI layout.

## Status

Work in progress. Component 1, a streaming response with a stop control, is built and tested locally:

- You can stop a response while it streams. The partial text stays, with the status "Stopped. This response is not complete." You can regenerate a stopped response one time.
- When you stop, the server also cancels the Claude stream, so nobody pays for text that no one sees. I tested this locally. The check on the live site comes after the deploy.
- Inline [n] links point to a numbered Sources list, in the order each source is first cited. After a stop, the list shows only the sources cited in the partial text.
- After a stop, keyboard focus goes back to the prompt input, and screen readers hear the status one time.

Next: the Sources panel, confidence signals, follow-up handling, a live demo and a GIF.

## Built with

React, Vite, Cloudscape components, the Claude API (streaming with citations) and one Vercel function. I designed the states in Figma and built them with Claude Code. I used the Figma MCP server to inspect my frames, and found they were mostly pasted screenshots, so the build takes its structure from real Cloudscape components.

## Run it locally

You need Node 20.19 or later and your own Anthropic API key.

1. Run `npm install`.
2. Create a file named `.env.local` in the project folder with one line: `ANTHROPIC_API_KEY=your-key`
3. Run `npm run dev`, then open http://localhost:5173.

Each question calls the Claude API, so each one costs a small amount.

## Note

This is a personal portfolio project. It is not affiliated with or endorsed by Amazon Web Services. The doc text in `data/docs.json` is quoted from the Amazon S3 User Guide on docs.aws.amazon.com and belongs to AWS.
