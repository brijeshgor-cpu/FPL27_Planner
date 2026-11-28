"""Build BG27 Words Daily: inline the word lists and game logic into the page, then wrap it for the Worker."""
import json, re, pathlib
src = pathlib.Path(__file__).parent / "src"
def plain(js): return re.sub(r"^import .*\n", "", js, flags=re.M).replace("export const ", "const ").replace("export function ", "function ")
page = (src / "page.html").read_text()
page = page.replace("/*WORDS*/", plain((src / "words.js").read_text())).replace("/*LOGIC*/", plain((src / "logic.js").read_text()))
(src / "page.gen.js").write_text("export default " + json.dumps(page) + ";\n")
(src.parent / "dist").mkdir(exist_ok=True)
(src.parent / "dist" / "index.html").write_text(page)
print("page", len(page), "bytes")
