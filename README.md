# 2-Min Trader – Forex candle signal tool

Live link: https://uttam775699-cell.github.io/forex-signal/

- Free live data (Binance websocket, no key), all available pairs at once
- Trader rules: 15m/5m trend, trend pullback, breakout, support/resistance rejection, momentum
- Filters: session timing, weekend/rollover, low volatility, news spikes
- Timing flow per 2-min candle: analyse → lock at 0:30 → entry at 0:00 → result
- Risk manager, journal, backtest

⚠️ Educational tool. No indicator can reliably predict a single 2-minute candle. Test on a demo account first. Does not work on OTC pairs.

`src/` holds the source; `python3 src/build.py` rebuilds `index.html` (free/Binance) and `pocket.html` (Twelve Data connector version).
