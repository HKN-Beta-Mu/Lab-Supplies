import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("entry point contains the complete application shell", async () => {
  const html = await read("index.html");
  assert.match(html, /<title>LabKit · Component Procurement<\/title>/);
  assert.match(html, /class="app-shell/);
  assert.match(html, /vHome/);
  assert.match(html, /vCatalog/);
  assert.match(html, /vOrders/);
  assert.match(html, /LabKitDataSource\.save/);
});

test("the application logic and runtime parse as JavaScript", async () => {
  const html = await read("index.html");
  const logic = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(logic, "embedded application logic should exist");
  assert.doesNotThrow(() => new Function("DCLogic", "React", logic));

  const runtime = await read("support.js");
  assert.doesNotThrow(() => new Function(runtime));
});

test("the data model initializes and can create a persisted semester", async () => {
  const html = await read("index.html");
  const logic = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  let lastSaved = null;

  class LogicStub {
    constructor(props) {
      this.props = props;
      this.state = {};
    }

    setState(update) {
      const patch = typeof update === "function" ? update(this.state) : update;
      this.state = { ...this.state, ...patch };
    }

    forceUpdate() {}
  }

  globalThis.window = {
    LabKitDataSource: {
      load: () => null,
      save: (data) => {
        lastSaved = data;
      },
    },
  };

  try {
    const App = new Function(
      "DCLogic",
      "React",
      `${logic}\nreturn Component;`,
    )(LogicStub, {});
    const app = new App({});
    app.flash = () => {};

    assert.equal(app.catalog.length, 53);
    assert.equal(app.kits.length, 7);
    assert.equal(app.terms.length, 33);

    app.createSemester();
    assert.equal(app.terms.length, 34);
    assert.equal(app.state.semesterId, "sp27");
    assert.equal(app.termMap.sp27.status, "Planning");

    app.persistData();
    assert.equal(lastSaved.terms.length, 34);
    assert.equal(lastSaved.kits.length, 7);
  } finally {
    delete globalThis.window;
  }
});

test("all local assets referenced by the entry point exist", async () => {
  const html = await read("index.html");
  const localAssets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => (
      !path.startsWith("http")
      && !path.startsWith("#")
      && !path.includes("{{")
    ));

  await Promise.all(localAssets.map(async (path) => {
    const content = await read(path);
    assert.ok(content.length > 0, `${path} should not be empty`);
  }));
});

test("persistence adapter exposes the expected provider boundary", async () => {
  const source = await read("src/data-source.js");
  assert.match(source, /schemaVersion/);
  assert.match(source, /load\(\)/);
  assert.match(source, /save\(data\)/);
  assert.match(source, /reset\(\)/);
});

test("responsive styles include desktop, tablet, and mobile layouts", async () => {
  const css = await read("src/app-overrides.css");
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.app-shell\.nav-open \.app-sidebar/);
});
