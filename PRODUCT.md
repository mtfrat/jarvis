# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 15 (App Router, TypeScript), Tailwind CSS, Recharts, Lucide Icons, grammY (Telegram bot), Google Gemini API (Multimodal 2.0/1.5 Flash), Supabase (PostgreSQL).

## Users

Primary user: Martín (personal finance tracking) with whitelist support for authorized household members (partner/family) via Telegram User IDs.

## Product Purpose

Track personal and recurring expenses instantly via Telegram (voice notes, receipt photos, text) with automatic categorization, installment calculation, and multi-currency (ARS/USD), backed by a modern, high-density Fintech Dark Mode web dashboard for deep spending analytics.

## Positioning

Frictionless capture at the moment of spending (via natural audio, receipt snapshot, or short text in Telegram) combined with native multimodal intelligence that projects future credit card installment liabilities and visualizes burn rate without manual spreadsheet maintenance.

## Operating Context

- Mobile on the go: Telegram bot accessed via smartphone keyboard, voice mic, or camera.
- Desktop / Mobile web: Interactive dashboard reviewed weekly or monthly to understand burn rate, category leakages, day-of-week trends, and upcoming credit card installment commitments.

## Capabilities and Constraints

- Telegram input ingestion: Text (natural language), Voice audio (.oga/.mp3), Receipt images.
- AI Engine: Google Gemini API (single-model multimodal processing for transcription, vision, and extraction).
- Installments Engine: Automatically detects purchases in installments (e.g., "$60.000 en 3 cuotas") and projects records across upcoming months.
- Multicurrency: Argentine Peso (ARS) and US Dollar (USD) with real-time conversion rate (DolarApi).
- Security: Telegram user ID whitelist to prevent unauthorized expense creation.
- Bot Tone: Balanced, helpful, with a subtle witty roast on excessive or discretionary spending.

## Brand Commitments

- Name: Jarvis Finance
- Aesthetic: Modern Fintech Dark Mode (obsidian background `#09090b`, zinc cards `#18181b`, emerald `#10b981` positive/success accents, indigo/violet metrics, crisp monospace numbers).

## Product Principles

1. Zero-friction logging: A voice note or photo in Telegram must be recorded and classified in under 3 seconds.
2. Honest financial clarity: Present liabilities and future installments transparently so the user knows true commitments.
3. Minimal, rock-solid codebase: Follow Ponytail principles—write the shortest, cleanest code with zero speculative abstractions.
4. Scanability and operational craft: The dashboard must answer "How much did I spend, where did it go, and what's coming next?" in one glance.
