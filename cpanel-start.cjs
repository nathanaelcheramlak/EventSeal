const path = require("node:path");
const { pathToFileURL } = require("node:url");

const serverEntry = pathToFileURL(
  path.join(__dirname, "apps", "api", "dist", "server.js")
).href;

import(serverEntry).catch((error) => {
  console.error(error);
  process.exit(1);
});
