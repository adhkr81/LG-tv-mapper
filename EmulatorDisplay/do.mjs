import { readFileSync, writeFileSync } from "fs";

const screens = JSON.parse(readFileSync("./test2.json").toString());

const keys = Object.keys(screens);

for (const key of keys) {
  if (screens[key]?.scrolling) {
    screens[key].preset = "preset2";
  }
}

writeFileSync("screens.json", JSON.stringify(screens));
