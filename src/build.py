import pathlib
d = pathlib.Path(__file__).parent
core = (d / "core.html").read_text()
marker = "/*ADAPTER*/"
core = core.replace(marker, "")
anchor = "// =====================================================================\n// Candles & indicators"
assert anchor in core
def build(adapter, title, out):
    s = core.replace(anchor, (d / adapter).read_text() + "\n" + anchor).replace("/*TITLE*/", title)
    (d.parent / out).write_text(s); print("built", out, len(s))
build("adapter_binance.js", "2-Min Trader – Free Live (Binance)", "index.html")
build("adapter_twelvedata.js", "2-Min Trader – Pocket Option", "pocket.html")
