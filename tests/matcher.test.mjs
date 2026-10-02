import { ScriptMatcher, tokenize } from "../app/js/matcher.js";
import assert from "node:assert";
const script = "Hello everyone and welcome back to the channel. Today I want to talk about the three things that changed how I work. The first thing is planning. The second thing is focus. And the third thing is rest, which most of us ignore.";
const words = tokenize(script);
const m = new ScriptMatcher(words);
const say = (t) => { m.update(t); return words[m.position]; };
// Web Speech gives growing interim transcripts
assert.equal(say("hello"), "hello");
assert.equal(say("hello everyone and"), "and");
assert.equal(say("hello everyone and welcome back to the"), "the");
assert.equal(say("welcome back to the channel today I want"), "want");
// ad-lib: no movement
const before = m.position;
say("um sorry let me grab my coffee");
assert.equal(m.position, before);
// misrecognition "talked" for "talk"
assert.equal(say("to talked about the three things"), "things");
// "the second thing is" must not jump back to "the first thing is"
say("that changed how I work the first thing is planning");
assert.equal(words[m.position], "planning");
assert.equal(say("the second thing is"), "is"); assert.ok(m.position > words.indexOf("second"));
// skip a sentence forward
assert.equal(say("and the third thing is rest"), "rest");
// numbers
const m2 = new ScriptMatcher(tokenize("We have 3 goals for 2026 this year"));
m2.update("we have three goals"); assert.equal(m2.position, 3);
// relocation after being lost: jump far
const long = tokenize(Array.from({length: 200}, (_, i) => "filler word number " + i).join(" ") + " the quick brown fox jumps over the lazy dog");
const m3 = new ScriptMatcher(long);
for (let k = 0; k < 4; k++) m3.update("the quick brown fox jumps over");
assert.equal(long[m3.position], "over");
console.log("all matcher tests passed");
