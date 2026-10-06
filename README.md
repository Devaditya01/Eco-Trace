# EcoTrace

Our EVS project on environmental sustainability. It's a website where you can work out your carbon footprint and the water hidden in what you eat and buy, and see how it compares with the average person in India and the world.

The idea behind it is simple: most people have no sense of how much their daily habits add up to. Once you see the numbers for your own travel, electricity use and diet, it's much easier to see what's worth changing.

## What's on the site

- Carbon footprint calculator covering travel, home electricity, diet and waste, with a breakdown chart and a comparison to the India and world averages
- Virtual water calculator that shows how much water goes into producing common foods and products, along with lower-water swaps
- Charts on global temperature rise, plastic production and CO2 emissions per person
- ECO, a chat assistant that answers questions about climate and sustainability and gives suggestions based on your calculator results
- Dark and light mode

## How the chat works

When you ask ECO something, the website sends your question (and your calculator results, if you've filled them in) to our backend. The backend adds some instructions and passes it on to Google's Gemini model, then sends the reply back to the page. The API key is only stored on the server, so it never reaches the browser.

## Running it locally

You'll need Python 3 and a free Gemini API key, which you can get from https://aistudio.google.com.

1. Install the dependencies:
   ```
   pip install -r requirements.txt
   ```
2. Make a copy of `.env.example`, name it `.env`, and paste your key after `GEMINI_API_KEY=`
3. Start the server from the project folder:
   ```
   python backend/server.py
   ```
4. Open http://localhost:8000 in your browser

The calculators and charts work without a key. Only the chat needs it.

## Deploying on Vercel

1. Push the project to GitHub. The `.env` file is ignored by git, so your key won't be uploaded.
2. On Vercel, create a new project and import the repo. The framework can stay as "Other".
3. Go to Settings > Environment Variables and add `GEMINI_API_KEY` with your key.
4. Deploy. If you add the key after the first deploy, redeploy once so it takes effect.

## Project structure

```
frontend/      the website (HTML, CSS, JavaScript, data and logos)
backend/       chat logic and the local development server
app.py         entry point Vercel uses to start the backend
vercel.json    Vercel configuration
```

## Sources

NASA GISS, Our World in Data, IPCC, Water Footprint Network, UN-Water, FAO, UNEP, Central Electricity Authority (India) and Scarborough et al. (2014).

All figures are rounded approximations meant for learning, not exact measurement.
