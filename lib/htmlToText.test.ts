import { describe, it, expect } from "vitest";
import { htmlToText } from "./htmlToText";

describe("htmlToText", () => {
  it("strips tags and keeps the visible text", () => {
    expect(htmlToText("<p>รายการเงินเข้า</p>")).toBe("รายการเงินเข้า");
  });

  it("keeps a label and its value apart across table cells", () => {
    const html = "<table><tr><td>จำนวนเงิน</td><td>200.00 บาท</td></tr></table>";
    // Without the block-tag rule these collide into "จำนวนเงิน200.00 บาท",
    // which no label-based pattern can match. The exact number of newlines
    // does not matter — the parser's patterns allow any whitespace run.
    expect(htmlToText(html)).toMatch(/จำนวนเงิน\s+200\.00 บาท/);
  });

  it("turns <br> into a line break", () => {
    expect(htmlToText("a<br>b")).toBe("a\nb");
  });

  it("drops script and style content entirely", () => {
    const html = "<style>.x{color:red}</style><script>var a=1;</script><p>เงินเข้า</p>";
    expect(htmlToText(html)).toBe("เงินเข้า");
  });

  it("decodes the entities that appear in bank mail", () => {
    expect(htmlToText("<p>A&nbsp;&amp;&nbsp;B</p>")).toBe("A & B");
  });

  it("decodes numeric entities", () => {
    expect(htmlToText("<p>&#3585;</p>")).toBe("ก");
  });

  it("collapses runs of blank lines", () => {
    expect(htmlToText("<p>a</p><br><br><br><p>b</p>")).toBe("a\n\nb");
  });
});
