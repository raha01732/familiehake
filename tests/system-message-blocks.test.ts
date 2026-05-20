// tests/system-message-blocks.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlock,
  normalizeBlocks,
  renderEmailHtml,
  renderInApp,
  renderPlainText,
  type SystemMessageBlock,
} from "@/lib/system-messages/blocks";

const sample: SystemMessageBlock[] = [
  { type: "heading", text: "Wartung" },
  { type: "paragraph", text: "Hallo,\nam Sonntag gibt es Wartung." },
  { type: "notice", tone: "warn", text: "Kurzfristige Ausfälle möglich." },
  { type: "button", label: "Mehr erfahren", href: "https://example.com/info" },
];

test("renderEmailHtml enthält Titel, Inhalte und Button-Link", () => {
  const html = renderEmailHtml({ title: "Systeminfo", blocks: sample, appUrl: "https://app.example.com" });
  assert.match(html, /Systeminfo/);
  assert.match(html, /Wartung/);
  assert.match(html, /am Sonntag gibt es Wartung/);
  assert.match(html, /https:\/\/example\.com\/info/);
  assert.match(html, /Mehr erfahren/);
  // Zeilenumbruch im Absatz wird zu <br>
  assert.match(html, /Hallo,<br>/);
});

test("renderEmailHtml escapet HTML im Text", () => {
  const html = renderEmailHtml({
    title: "<b>x</b>",
    blocks: [{ type: "paragraph", text: "<script>alert(1)</script>" }],
  });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.match(html, /&lt;script&gt;/);
});

test("renderPlainText enthält Titel und Button-URL", () => {
  const text = renderPlainText({ title: "Systeminfo", blocks: sample });
  assert.match(text, /Systeminfo/);
  assert.match(text, /Mehr erfahren: https:\/\/example\.com\/info/);
});

test("renderInApp verdichtet Text und nimmt ersten Button als Link", () => {
  const { body, link } = renderInApp(sample);
  assert.match(body, /Wartung/);
  assert.match(body, /Kurzfristige Ausfälle/);
  assert.equal(link, "https://example.com/info");
});

test("normalizeBlocks filtert ungültige Einträge und Typen", () => {
  const result = normalizeBlocks([
    { type: "heading", text: "OK" },
    { type: "unknown", text: "nope" },
    null,
    "string",
    { type: "notice", tone: "bogus", text: "x" },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].type, "heading");
  assert.equal(result[1].type, "notice");
  // ungültiger Ton fällt auf "info" zurück
  assert.equal((result[1] as { tone: string }).tone, "info");
});

test("createBlock liefert sinnvolle Defaults", () => {
  assert.deepEqual(createBlock("divider"), { type: "divider" });
  assert.equal(createBlock("button").type, "button");
  assert.equal(createBlock("notice").type, "notice");
});
